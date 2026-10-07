import { assertPrivacidadeAntesDoHub } from "./shared/assert-privacidade.js";
import {
  inferirSensibilidadeColuna,
  parseSensibilidadeColuna,
  sensibilidadeGravadaEfetiva,
} from "../../domain/entities/privacidade.js";
import { createHash } from "node:crypto";
import { identidadeConsulta } from "../../domain/entities/consulta-fingerprint.js";
import { uniaoEscopos } from "../../domain/entities/escopo.js";
import { resolverSkillsConsulta } from "./shared/resolver-skills-consulta.js";
import { capturaSqlSegura, textoSeguro } from "./shared/curadoria-segura.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import type { ConsultaAprendida } from "../../domain/entities/aprendizado.js";
import type { AnotacaoGrafo } from "../../domain/entities/skill.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AprendizadoRepositoryPort } from "../../domain/ports/aprendizado-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { AuditMetadata } from "../../domain/entities/audit-log.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../domain/ports/skill-repository.port.js";
import { requireAcesso, requireUsuario } from "./shared/guards.js";
import { validarSqlNoEscopo } from "./shared/validar-escopo.js";
import { catalogoSe7eParaDialeto } from "./shared/catalogo-se7e.js";
import {
  agregarTelemetriaBusca,
  parseTagsTelemetriaBusca,
  type TelemetriaBusca,
} from "./shared/telemetria-busca.js";
import { parseEscopoPadrao, type BindingEscopoPadrao } from "../../domain/entities/escopo.js";
import { persistirItensAprendizado, TIPOS_APRENDIZADO } from "./shared/persistir-aprendizado.js";
import type { GovernancaConhecimentoInput } from "./skills.js";
import { assertFanoutSeguro } from "./shared/assert-fanout.js";
import { exigirFiltroEscopoPadrao } from "./shared/escopo-filtro.js";

export class SalvarConsulta {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly aprendizado: AprendizadoRepositoryPort,
    private readonly grafo?: GrafoRepositoryPort,
  ) {}
  async execute(
    usuarioId: string | undefined,
    input: Parameters<SalvarConsulta["executeUnlocked"]>[1],
  ): ReturnType<SalvarConsulta["executeUnlocked"]> {
    const uid = requireUsuario(usuarioId),
      access = await requireAcesso(this.acessos, input.acessoId, uid, {
        skills: this.skills,
        skillId: input.skillId,
      });
    return this.grafo
      ? this.grafo.withAcessoLock(access.id, () => this.executeUnlocked(uid, input))
      : this.executeUnlocked(uid, input);
  }
  private async executeUnlocked(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      skillIds?: readonly string[];
      consultaAprendidaId?: string;
      pergunta?: string;
      sql?: string;
      confirmadoPeloUsuario?: boolean;
      confirmacaoHash?: string;
    },
  ): Promise<{
    success: boolean;
    confirmacaoPendente?: boolean;
    confirmacaoHash?: string;
    consulta: ConsultaAprendida;
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
    });
    let consulta = input.consultaAprendidaId
      ? await this.aprendizado.obterConsulta(acesso.id, input.consultaAprendidaId)
      : null;
    if (input.consultaAprendidaId && !consulta)
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Consulta não encontrada neste acesso.",
        hint: "Liste as candidatas.",
      });
    const ids = consulta?.skillIds ?? [
      ...new Set([...(input.skillIds ?? []), ...(input.skillId ? [input.skillId] : [])]),
    ];
    if (!ids.length)
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Vincule ao menos uma skill publicada.",
        hint: "Informe skillIds.",
      });
    const published = await resolverSkillsConsulta(this.skills, acesso.id, ids);
    const sql = consulta?.sql ?? input.sql?.trim() ?? "";
    const pergunta = consulta?.pergunta ?? input.pergunta?.trim() ?? "";
    const scope = uniaoEscopos(published.map((s) => s.escopo));
    const ast = validarSqlNoEscopo(sql, acesso.dialeto, scope);
    assertFanoutSeguro(ast, scope);
    assertPrivacidadeAntesDoHub({
      ast,
      negar: ["pessoal", "segredo"],
      lookup: (table, col) => {
        const found = published
          .flatMap((s) => s.conhecimentoPublicado?.colunas ?? [])
          .filter(
            (c) =>
              (!table || c.tabela.toLowerCase() === table.toLowerCase()) &&
              c.nome.toLowerCase() === col.toLowerCase(),
          );
        const coluna = found.length === 1 ? found[0] : undefined;
        return coluna
          ? sensibilidadeGravadaEfetiva({
              nome: coluna.nome,
              gravada: parseSensibilidadeColuna(coluna.sensibilidade),
              origem: coluna.origem,
            })
          : inferirSensibilidadeColuna(col);
      },
    });
    exigirFiltroEscopoPadrao({
      sql,
      dialeto: acesso.dialeto,
      escopoPadrao: acesso.escopoPadrao,
      colunasDasTabelas: Object.fromEntries(
        Object.entries(scope.colunasPorTabela).map(([k, v]) => [k, [...v]]),
      ),
    });
    if (!pergunta || !textoSeguro(pergunta) || !capturaSqlSegura(sql, acesso.dialeto, published))
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Exemplo não pode ser capturado com segurança.",
        hint: "Parametrize os valores; confirme apenas constantes de negócio não sensíveis no pacote.",
      });
    const params = published.flatMap((s) => s.params);
    for (const param of params)
      if (
        params.some(
          (other) =>
            other.nome === param.nome &&
            (other.tipo !== param.tipo || other.obrigatorio !== param.obrigatorio),
        )
      )
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Contratos incompatíveis para o mesmo parâmetro.",
          hint: "Harmonize os parâmetros dos pacotes antes de confirmar o exemplo.",
        });
    const pubs = published
      .map((s) => ({ skillId: s.id, id: s.publicacaoAtivaId!, hash: s.publicacaoHash! }))
      .sort((a, b) => a.skillId.localeCompare(b.skillId));
    if (pubs.some((p) => !p.id || !p.hash))
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_PUBLISHED,
        message: "Publicação indisponível.",
        hint: "Publique a skill.",
      });
    consulta ??= await this.aprendizado.salvarConsulta({
      acessoId: acesso.id,
      skillIds: ids,
      pergunta,
      sql,
      paramsContrato: published
        .flatMap((s) => s.params)
        .filter((p, i, all) => all.findIndex((q) => q.nome === p.nome) === i),
      autorUsuarioId: uid,
      publicacoes: pubs,
      registroExecucao: false,
    });
    if (
      JSON.stringify(
        [...(consulta.publicacoes ?? [])].sort((a, b) => a.skillId.localeCompare(b.skillId)),
      ) !== JSON.stringify(pubs)
    )
      throw new DomainError({
        code: ERROR_CODES.CONFIRMACAO_DESATUALIZADA,
        message: "Publicações da candidata não são vigentes.",
        hint: "Prepare um novo exemplo para o pacote atual.",
      });
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          acessoId: acesso.id,
          id: consulta.id,
          versao: consulta.versao ?? 1,
          conteudo: identidadeConsulta(consulta),
          pergunta: consulta.pergunta,
        }),
      )
      .digest("hex");
    if (!input.confirmacaoHash || !input.confirmadoPeloUsuario)
      return { success: true, confirmacaoPendente: true, confirmacaoHash: hash, consulta };
    if (hash !== input.confirmacaoHash)
      throw new DomainError({
        code: ERROR_CODES.CONFIRMACAO_DESATUALIZADA,
        message: "Confirmação desatualizada.",
        hint: "Revise o novo preview.",
      });
    if (consulta.status !== "candidata")
      throw new DomainError({
        code: ERROR_CODES.CONFIRMACAO_DESATUALIZADA,
        message: "Exemplo já curado ou inativo.",
        hint: "Obtenha o estado atual.",
      });
    return {
      success: true,
      consulta: await this.aprendizado.alterarEstado({
        acessoId: acesso.id,
        id: consulta.id,
        expectedVersion: consulta.versao ?? 1,
        status: "confirmada",
        autorUsuarioId: uid,
        publicacoes: pubs,
      }),
    };
  }
}

export class RegistrarAprendizado {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly anotacoes: AnotacaoGrafoRepositoryPort,
    private readonly aprendizado: AprendizadoRepositoryPort,
    private readonly skills?: SkillRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      tipo?: string;
      titulo?: string;
      texto?: string;
      tabela?: string;
      governanca?: GovernancaConhecimentoInput;
    },
  ): Promise<{
    success: true;
    anotacao?: AnotacaoGrafo;
    sinonimo?: { termo: string; alvoId: string };
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
    });
    const tipo = (input.tipo?.trim() ? input.tipo.trim() : "uso").toLowerCase();
    const titulo = input.titulo?.trim() ?? "";
    const texto = input.texto?.trim() ?? "";
    if (!titulo || !texto) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "titulo e texto são obrigatórios.",
        hint: "Grave o que o usuário ensinou (regra, dicionário, glossário). Não invente.",
      });
    }
    if (pareceSegredoEmTexto(`${titulo}\n${texto}`)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "O aprendizado parece conter um segredo e não será persistido.",
        hint: "Remova senha, token, JWT ou credencial antes de registrar conhecimento.",
      });
    }
    if (!TIPOS_APRENDIZADO.has(tipo)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "tipo de aprendizado inválido.",
        hint: "Use regra, metrica, glossario, dicionario ou sinonimo.",
      });
    }
    const gravado = await persistirItensAprendizado({
      acessoId: acesso.id,
      autorUsuarioId: uid,
      grafo: this.grafo,
      anotacoes: this.anotacoes,
      aprendizado: this.aprendizado,
      skills: this.skills,
      strictMetricas: true,
      itens: [
        {
          tipo,
          titulo,
          texto,
          tabela: input.tabela,
          skillId: input.skillId,
          governanca: input.governanca,
        },
      ],
    });
    if (tipo === "sinonimo") {
      return {
        success: true,
        sinonimo: { termo: titulo, alvoId: input.skillId?.trim() ? input.skillId.trim() : texto },
      };
    }
    const anotacao = gravado.anotacoes[0];
    if (!anotacao) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Não foi possível gravar o aprendizado.",
        hint: "Confira titulo, texto e tipo.",
      });
    }
    return { success: true, anotacao };
  }
}

export class AtualizarEscopoPadrao {
  constructor(private readonly acessos: AcessoRepositoryPort) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      empresa?: string;
      filial?: string;
      bindings?: readonly BindingEscopoPadrao[];
      timezone?: string;
      confirmadoPeloUsuario?: boolean;
    },
  ): Promise<{
    success: true;
    escopoPadrao: { empresa?: string; filial?: string } | null;
    timezone: string | null;
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Atualizar empresa/filial default exige confirmação do usuário.",
        hint: "Mostre o recorte e chame de novo com confirmadoPeloUsuario: true.",
      });
    }
    const escopoPadrao = parseEscopoPadrao({
      empresa: input.empresa,
      filial: input.filial,
      bindings: input.bindings ?? acesso.escopoPadrao?.bindings,
    });
    const timezone = input.timezone?.trim() ? input.timezone.trim() : null;
    await this.acessos.updateEscopoPadrao(acesso.id, escopoPadrao, timezone);
    return { success: true, escopoPadrao, timezone };
  }
}

export class HerdarCatalogo {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; confirmadoPeloUsuario?: boolean },
  ): Promise<{
    success: true;
    tabelas: number;
    relacionamentos: number;
    origem: "inferido";
    publicaSkill: false;
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Herdar o catálogo Se7e exige confirmação do usuário.",
        hint: "O grafo recebe tabelas template (origem inferido). Chame com confirmadoPeloUsuario: true.",
      });
    }
    const catalogo = catalogoSe7eParaDialeto(acesso.dialeto);
    let tabelas = 0;
    let relacionamentos = 0;
    await this.grafo.withAcessoLock(acesso.id, async () => {
      const locked = await this.grafo.getDialeto(acesso.id);
      if (!locked) {
        await this.grafo.setDialeto(acesso.id, acesso.dialeto);
      } else if (locked.dialeto !== acesso.dialeto) {
        throw new DomainError({
          code: ERROR_CODES.DIALECT_CONFLICT,
          message: "Este acesso já foi treinado em outro dialeto.",
          hint: "Chame atualizar_dialeto com confirmadoPeloUsuario: true para mudar o dialeto.",
        });
      }
      const ids = new Map<string, string>();
      for (const tabela of catalogo.tabelas) {
        const merged = await this.grafo.mergeTabela({
          acessoId: acesso.id,
          nome: tabela.nome,
          descricao: tabela.descricao,
          origem: "inferido",
          autorUsuarioId: uid,
        });
        ids.set(tabela.nome.toLowerCase(), merged.tabela.id);
        tabelas += 1;
        for (const coluna of tabela.colunas) {
          await this.grafo.mergeColuna({
            acessoId: acesso.id,
            tabelaId: merged.tabela.id,
            nome: coluna.nome,
            tipo: coluna.tipo,
            descricao: coluna.descricao,
            papel: coluna.papel,
            origem: "inferido",
            autorUsuarioId: uid,
          });
        }
      }
      for (const rel of catalogo.relacionamentos) {
        const origemId = ids.get(rel.tabelaOrigem.toLowerCase());
        const destinoId = ids.get(rel.tabelaDestino.toLowerCase());
        const primeiro = rel.pares[0];
        if (!origemId || !destinoId || !primeiro) {
          continue;
        }
        await this.grafo.mergeRelacionamento({
          acessoId: acesso.id,
          tabelaOrigemId: origemId,
          colunaOrigem: primeiro.colunaOrigem,
          tabelaDestinoId: destinoId,
          colunaDestino: primeiro.colunaDestino,
          pares: rel.pares,
          tipoJoin: rel.tipoJoin,
          cardinalidade: rel.cardinalidade,
          origem: "inferido",
          autorUsuarioId: uid,
        });
        relacionamentos += 1;
      }
    });
    return { success: true, tabelas, relacionamentos, origem: "inferido", publicaSkill: false };
  }
}

export class ListarAuditoria {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; limite?: number },
  ): Promise<{
    success: true;
    entradas: {
      createdAt: string;
      tool: string;
      sucesso: boolean;
      codigoErro: string | null;
      linhasRetornadas: number | null;
      duracaoMs: number | null;
      metadata?: AuditMetadata | null;
      telemetria?: TelemetriaBusca;
    }[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const limite = Math.min(Math.max(1, input.limite ?? 50), 200);
    const doAcesso = await this.audit.listByAcesso(acesso.id, limite);
    return {
      success: true,
      entradas: doAcesso.map((row) => {
        const telemetria =
          row.tool === "buscar_contexto" ? parseTagsTelemetriaBusca(row.sqlEnviado) : null;
        return {
          createdAt: row.createdAt.toISOString(),
          tool: row.tool,
          sucesso: row.sucesso,
          codigoErro: row.codigoErro,
          linhasRetornadas: row.linhasRetornadas,
          duracaoMs: row.duracaoMs,
          ...(row.metadata ? { metadata: row.metadata } : {}),
          ...(telemetria ? { telemetria } : {}),
        };
      }),
    };
  }
}

export class ListarMetricasAgente {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; limite?: number },
  ): Promise<{
    success: true;
    porTool: Record<string, { total: number; erros: number; duracaoMs: number; linhas: number }>;
    porCodigo: Record<string, number>;
    busca: {
      total: number;
      consultaPermitida: number;
      skillGap: number;
      skillNotPublished: number;
      slotNarrativa: number;
    };
    janela: { observacoes: number; de: string | null; ate: string | null };
    consultas: {
      cacheHits: number;
      truncadas: number;
      p50Ms: number | null;
      p95Ms: number | null;
      porSkill: Record<string, number>;
      porOrigem: Record<string, number>;
      porOrigemErro: Record<string, number>;
      maisLentas: {
        skillIds: readonly string[];
        origem?: string;
        duracaoMs: number;
        createdAt: string;
      }[];
    };
    painel: {
      status: "estavel" | "atencao" | "critica";
      taxaErro: number;
      taxaCacheHit: number;
      taxaTruncamento: number;
      tendencia: {
        recentes: { observacoes: number; taxaErro: number; p95Ms: number | null };
        anteriores: { observacoes: number; taxaErro: number; p95Ms: number | null };
      };
    };
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const limite = Math.min(Math.max(50, input.limite ?? 400), 1000);
    const rows = await this.audit.listByAcesso(acesso.id, limite);
    const porTool: Record<
      string,
      { total: number; erros: number; duracaoMs: number; linhas: number }
    > = {};
    const porCodigo: Record<string, number> = {};
    for (const row of rows) {
      const bucket = porTool[row.tool] ?? { total: 0, erros: 0, duracaoMs: 0, linhas: 0 };
      bucket.total += 1;
      if (!row.sucesso) {
        bucket.erros += 1;
      }
      bucket.duracaoMs += row.duracaoMs ?? 0;
      bucket.linhas += row.linhasRetornadas ?? 0;
      porTool[row.tool] = bucket;
      if (row.codigoErro) {
        porCodigo[row.codigoErro] = (porCodigo[row.codigoErro] ?? 0) + 1;
      }
    }
    const consultas = rows.filter(
      (row) => row.tool === "consultar_dados" || row.tool === "validar_consulta",
    );
    const duracoes = consultas
      .map((row) => row.duracaoMs)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const percentil = (p: number): number | null => {
      if (duracoes.length === 0) return null;
      return duracoes[Math.min(duracoes.length - 1, Math.ceil(duracoes.length * p) - 1)] ?? null;
    };
    const resumoDaJanela = (items: readonly (typeof consultas)[number][]) => {
      const durations = items
        .map((row) => row.duracaoMs)
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b);
      const p95 =
        durations.length === 0
          ? null
          : (durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)] ??
            null);
      return {
        observacoes: items.length,
        taxaErro:
          items.length === 0 ? 0 : items.filter((row) => !row.sucesso).length / items.length,
        p95Ms: p95,
      };
    };
    const porSkill: Record<string, number> = {};
    const porOrigem: Record<string, number> = {};
    const porOrigemErro: Record<string, number> = {};
    let cacheHits = 0;
    let truncadas = 0;
    for (const row of consultas) {
      const meta = row.metadata;
      if (meta?.cacheHit) cacheHits += 1;
      if (meta?.truncated) truncadas += 1;
      if (meta?.origem) porOrigem[meta.origem] = (porOrigem[meta.origem] ?? 0) + 1;
      if (meta?.errorSource)
        porOrigemErro[meta.errorSource] = (porOrigemErro[meta.errorSource] ?? 0) + 1;
      for (const skillId of meta?.skillIds ?? []) porSkill[skillId] = (porSkill[skillId] ?? 0) + 1;
    }
    const maisLentas = [...consultas]
      .filter((row) => row.duracaoMs !== null)
      .sort((a, b) => (b.duracaoMs ?? 0) - (a.duracaoMs ?? 0))
      .slice(0, 10)
      .map((row) => ({
        skillIds: row.metadata?.skillIds ?? [],
        ...(row.metadata?.origem ? { origem: row.metadata.origem } : {}),
        duracaoMs: row.duracaoMs ?? 0,
        createdAt: row.createdAt.toISOString(),
      }));
    const taxaErro =
      consultas.length === 0
        ? 0
        : consultas.filter((row) => !row.sucesso).length / consultas.length;
    const taxaCacheHit = consultas.length === 0 ? 0 : cacheHits / consultas.length;
    const taxaTruncamento = consultas.length === 0 ? 0 : truncadas / consultas.length;
    const p95Ms = percentil(0.95);
    const status: "estavel" | "atencao" | "critica" =
      taxaErro >= 0.2 || (p95Ms ?? 0) >= 30_000
        ? "critica"
        : taxaErro >= 0.05 || taxaTruncamento >= 0.1 || (p95Ms ?? 0) >= 10_000
          ? "atencao"
          : "estavel";
    const recentCut = Math.ceil(consultas.length / 2);
    const recentes = resumoDaJanela(consultas.slice(0, recentCut));
    const anteriores = resumoDaJanela(consultas.slice(recentCut));
    return {
      success: true,
      porTool,
      porCodigo,
      busca: agregarTelemetriaBusca(rows),
      janela: {
        observacoes: rows.length,
        de: rows.at(-1)?.createdAt.toISOString() ?? null,
        ate: rows[0]?.createdAt.toISOString() ?? null,
      },
      consultas: {
        cacheHits,
        truncadas,
        p50Ms: percentil(0.5),
        p95Ms: percentil(0.95),
        porSkill,
        porOrigem,
        porOrigemErro,
        maisLentas,
      },
      painel: {
        status,
        taxaErro,
        taxaCacheHit,
        taxaTruncamento,
        tendencia: { recentes, anteriores },
      },
    };
  }
}

export class RegistrarLacunaFerramenta {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly aprendizado: AprendizadoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      objetivo?: string;
      entradas?: string;
      saidas?: string;
      permissao?: string;
      teto?: string;
      aceite?: string;
    },
  ): Promise<{ success: true; lacunaId: string }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const objetivo = input.objetivo?.trim() ?? "";
    if (!objetivo) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "objetivo é obrigatório.",
        hint: "Descreva a tool que falta sem inventar SQL.",
      });
    }
    const row = await this.aprendizado.registrarLacuna(acesso.id, objetivo, "ferramenta", {
      entradas: input.entradas ?? null,
      saidas: input.saidas ?? null,
      permissao: input.permissao ?? null,
      teto: input.teto ?? null,
      aceite: input.aceite ?? null,
    });
    return { success: true, lacunaId: row.id };
  }
}

export class ListarLacunas {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly aprendizado: AprendizadoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; limite?: number; status?: "aberta" | "arquivada" },
  ): Promise<{
    success: true;
    lacunas: {
      id: string;
      tipo: string;
      status: string;
      pergunta: string;
      contrato: Record<string, unknown> | null;
      createdAt: string;
    }[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const limite = Math.min(Math.max(1, input.limite ?? 20), 100);
    const status = input.status ?? "aberta";
    const rows = await this.aprendizado.listarLacunas(acesso.id, limite, status);
    return {
      success: true,
      lacunas: rows.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        status: row.status,
        pergunta: row.pergunta,
        contrato: row.contrato,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
