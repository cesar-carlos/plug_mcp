import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { ConsultaAprendida } from "../../domain/entities/aprendizado.js";
import type { AnotacaoGrafo, Skill } from "../../domain/entities/skill.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AprendizadoRepositoryPort } from "../../domain/ports/aprendizado-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
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
import { parseEscopoPadrao } from "../../domain/entities/escopo.js";
import { persistirItensAprendizado, TIPOS_APRENDIZADO } from "./shared/persistir-aprendizado.js";

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
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
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
      if (skill?.agentId !== acesso.agentId || skill.status !== "publicada") {
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
      agentId: acesso.agentId,
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
    },
  ): Promise<{
    success: true;
    anotacao?: AnotacaoGrafo;
    sinonimo?: { termo: string; alvoId: string };
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
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
    if (!TIPOS_APRENDIZADO.has(tipo)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "tipo de aprendizado inválido.",
        hint: "Use regra, metrica, glossario, dicionario ou sinonimo.",
      });
    }
    const gravado = await persistirItensAprendizado({
      agentId: acesso.agentId,
      autorUsuarioId: uid,
      grafo: this.grafo,
      anotacoes: this.anotacoes,
      aprendizado: this.aprendizado,
      itens: [{ tipo, titulo, texto, tabela: input.tabela, skillId: input.skillId }],
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
  ): Promise<{ success: true; tabelas: number; relacionamentos: number }> {
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
    await this.grafo.withAgentLock(acesso.agentId, async () => {
      const locked = await this.grafo.getDialeto(acesso.agentId);
      if (!locked) {
        await this.grafo.setDialeto(acesso.agentId, acesso.dialeto);
      } else if (locked.dialeto !== acesso.dialeto) {
        throw new DomainError({
          code: ERROR_CODES.DIALECT_CONFLICT,
          message: "Este agentId já foi treinado em outro dialeto.",
          hint: "Chame atualizar_dialeto com confirmadoPeloUsuario: true para mudar o dialeto.",
        });
      }
      const ids = new Map<string, string>();
      for (const tabela of catalogo.tabelas) {
        const merged = await this.grafo.mergeTabela({
          agentId: acesso.agentId,
          nome: tabela.nome,
          descricao: tabela.descricao,
          origem: "inferido",
          autorUsuarioId: uid,
        });
        ids.set(tabela.nome.toLowerCase(), merged.tabela.id);
        tabelas += 1;
        for (const coluna of tabela.colunas) {
          await this.grafo.mergeColuna({
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
        if (!origemId || !destinoId) {
          continue;
        }
        await this.grafo.mergeRelacionamento({
          agentId: acesso.agentId,
          tabelaOrigemId: origemId,
          colunaOrigem: rel.colunaOrigem,
          tabelaDestinoId: destinoId,
          colunaDestino: rel.colunaDestino,
          pares: [{ colunaOrigem: rel.colunaOrigem, colunaDestino: rel.colunaDestino }],
          tipoJoin: rel.tipoJoin,
          cardinalidade: rel.cardinalidade,
          origem: "inferido",
          autorUsuarioId: uid,
        });
        relacionamentos += 1;
      }
    });
    return { success: true, tabelas, relacionamentos };
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
    }[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const limite = Math.min(Math.max(1, input.limite ?? 50), 200);
    const rows = await this.audit.listByUsuario(uid, limite * 2);
    const doAcesso = rows.filter((row) => row.acessoId === acesso.id).slice(0, limite);
    return {
      success: true,
      entradas: doAcesso.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        tool: row.tool,
        sucesso: row.sucesso,
        codigoErro: row.codigoErro,
        linhasRetornadas: row.linhasRetornadas,
        duracaoMs: row.duracaoMs,
      })),
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
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const limite = Math.min(Math.max(50, input.limite ?? 400), 1000);
    const rows = (await this.audit.listByUsuario(uid, limite * 2)).filter(
      (row) => row.acessoId === acesso.id,
    );
    const porTool: Record<string, { total: number; erros: number; duracaoMs: number; linhas: number }> = {};
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
    return { success: true, porTool, porCodigo };
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
    const row = await this.aprendizado.registrarLacuna(acesso.agentId, objetivo, "ferramenta", {
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
    input: { acessoId?: string; limite?: number },
  ): Promise<{
    success: true;
    lacunas: {
      id: string;
      tipo: string;
      pergunta: string;
      contrato: Record<string, unknown> | null;
      createdAt: string;
    }[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const limite = Math.min(Math.max(1, input.limite ?? 20), 100);
    const rows = await this.aprendizado.listarLacunas(acesso.agentId, limite);
    return {
      success: true,
      lacunas: rows.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        pergunta: row.pergunta,
        contrato: row.contrato,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
