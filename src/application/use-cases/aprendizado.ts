import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import type { ConsultaAprendida } from "../../domain/entities/aprendizado.js";
import type { AnotacaoGrafo, Skill } from "../../domain/entities/skill.js";
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
import { parseSqlModelo } from "./shared/sql-modelo.js";
import { escopoFromSqlModelo } from "./shared/escopo-from-modelo.js";
import { validarSqlNoEscopo } from "./shared/validar-escopo.js";
import { catalogoSe7eParaDialeto } from "./shared/catalogo-se7e.js";
import {
  agregarTelemetriaBusca,
  parseTagsTelemetriaBusca,
  type TelemetriaBusca,
} from "./shared/telemetria-busca.js";
import { parseEscopoPadrao } from "../../domain/entities/escopo.js";
import { persistirItensAprendizado, TIPOS_APRENDIZADO } from "./shared/persistir-aprendizado.js";
import type { GovernancaConhecimentoInput } from "./skills.js";

export class SalvarConsulta {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly aprendizado: AprendizadoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      pergunta?: string;
      sql?: string;
      confirmadoPeloUsuario?: boolean;
    },
  ): Promise<{ success: true; consulta: ConsultaAprendida }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
    });
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Salvar a consulta exige confirmação do usuário.",
        hint: "Mostre o SQL que funcionou e chame de novo com confirmadoPeloUsuario: true.",
      });
    }
    const pergunta = input.pergunta?.trim() ?? "";
    const sql = input.sql?.trim() ?? "";
    if (!pergunta || !sql) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "pergunta e sql são obrigatórios.",
        hint: "Grave a pergunta do usuário e o SELECT que funcionou.",
      });
    }
    const skillId = input.skillId?.trim() ? input.skillId.trim() : null;
    let paramsContrato: Skill["params"] = [];
    if (skillId) {
      const skill = await this.skills.findById(skillId);
      if (skill?.acessoId !== acesso.id || skill.status !== "publicada") {
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_PUBLISHED,
          message: "Só skill publicada recebe consulta aprendida.",
          hint: "Use listar_skills e passe um skillId publicado.",
        });
      }
      const escopo =
        skill.escopo.tabelas.length > 0
          ? skill.escopo
          : escopoFromSqlModelo(parseSqlModelo(skill.sqlModelo));
      validarSqlNoEscopo(sql, acesso.dialeto, escopo);
      paramsContrato = skill.params;
    }
    const consulta = await this.aprendizado.salvarConsulta({
      acessoId: acesso.id,
      skillIds: skillId ? [skillId] : [],
      pergunta,
      sql,
      paramsContrato,
      autorUsuarioId: uid,
    });
    return { success: true, consulta };
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
