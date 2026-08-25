import { randomUUID } from "node:crypto";
import type { Acesso, NovoAcesso, StatusAcesso } from "../../../domain/entities/acesso.js";
import type { NovoUsuarioMcp, UsuarioMcp } from "../../../domain/entities/usuario-mcp.js";
import type {
  AnotacaoGrafo,
  NovaSkill,
  Skill,
  StatusSkill,
  ParametroSkill,
} from "../../../domain/entities/skill.js";
import { parseParametroSkillList } from "../../../domain/entities/skill.js";
import type {
  ConsultaAprendida,
  LacunaConsulta,
  Sinonimo,
} from "../../../domain/entities/aprendizado.js";
import type { AprendizadoRepositoryPort } from "../../../domain/ports/aprendizado-repository.port.js";
import { escopoVazio } from "../../../domain/entities/escopo.js";
import type {
  ColunaGrafo,
  GrafoDialeto,
  OrigemFato,
  RelacionamentoGrafo,
  TabelaGrafo,
} from "../../../domain/entities/grafo.js";
import { decidirMerge } from "../../../domain/entities/merge-fato.js";
import type { AcessoRepositoryPort } from "../../../domain/ports/acesso-repository.port.js";
import type { UsuarioRepositoryPort } from "../../../domain/ports/usuario-repository.port.js";
import type {
  GrafoRepositoryPort,
  MergeColunaInput,
  MergeRelacionamentoInput,
  MergeTabelaInput,
} from "../../../domain/ports/grafo-repository.port.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../../domain/ports/skill-repository.port.js";
import type { AuditLogPort } from "../../../domain/ports/audit-log.port.js";
import { rankByTerms, tokenizeQuery } from "../busca-termos.js";
import type { AuditLogEntry, NewAuditLog } from "../../../domain/entities/audit-log.js";

const now = (): Date => new Date();
const id = (): string => randomUUID();
const lower = (value: string): string => value.trim().toLowerCase();

export class InMemoryUsuarioRepository implements UsuarioRepositoryPort {
  private readonly rows = new Map<string, UsuarioMcp>();

  async create(input: NovoUsuarioMcp): Promise<UsuarioMcp> {
    const row: UsuarioMcp = { id: id(), ...input, createdAt: now(), updatedAt: now() };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(usuarioId: string): Promise<UsuarioMcp | null> {
    return this.rows.get(usuarioId) ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<UsuarioMcp | null> {
    return [...this.rows.values()].find((row) => row.tokenHash === tokenHash) ?? null;
  }

  async findByEmailHash(emailHash: string): Promise<UsuarioMcp | null> {
    return [...this.rows.values()].find((row) => row.emailHash === emailHash) ?? null;
  }

  async updateTokenHash(
    usuarioId: string,
    tokenHash: string,
    tokenExpiresAt?: Date | null,
  ): Promise<void> {
    const row = this.rows.get(usuarioId);
    if (!row) {
      return;
    }
    this.rows.set(usuarioId, {
      ...row,
      tokenHash,
      ...(tokenExpiresAt !== undefined ? { tokenExpiresAt } : {}),
      updatedAt: now(),
    });
  }

  async updateCredenciais(usuarioId: string, emailEnc: string, senhaEnc: string): Promise<void> {
    const row = this.rows.get(usuarioId);
    if (!row) {
      return;
    }
    this.rows.set(usuarioId, { ...row, emailEnc, senhaEnc, updatedAt: now() });
  }

  async deleteById(usuarioId: string): Promise<void> {
    this.rows.delete(usuarioId);
  }
}

export class InMemoryAcessoRepository implements AcessoRepositoryPort {
  private readonly rows = new Map<string, Acesso>();

  async create(input: NovoAcesso): Promise<Acesso> {
    const row: Acesso = {
      id: id(),
      ...input,
      escopoPadrao: input.escopoPadrao ?? null,
      timezone: input.timezone ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(acessoId: string): Promise<Acesso | null> {
    return this.rows.get(acessoId) ?? null;
  }

  async findByIdForUsuario(acessoId: string, usuarioId: string): Promise<Acesso | null> {
    const row = this.rows.get(acessoId);
    return row?.usuarioId === usuarioId ? row : null;
  }

  async listByUsuario(usuarioId: string): Promise<readonly Acesso[]> {
    return [...this.rows.values()].filter((row) => row.usuarioId === usuarioId);
  }

  async findByUsuarioAgentTokenHash(
    usuarioId: string,
    agentId: string,
    clientTokenHash: string,
  ): Promise<Acesso | null> {
    return (
      [...this.rows.values()].find(
        (row) =>
          row.usuarioId === usuarioId &&
          row.agentId === agentId &&
          row.clientTokenHash === clientTokenHash,
      ) ?? null
    );
  }

  async updateStatus(acessoId: string, status: StatusAcesso): Promise<void> {
    const row = this.rows.get(acessoId);
    if (!row) {
      return;
    }
    this.rows.set(acessoId, { ...row, statusAcesso: status, updatedAt: now() });
  }

  async updateClientToken(
    acessoId: string,
    clientTokenEnc: string,
    clientTokenHash: string,
  ): Promise<void> {
    const row = this.rows.get(acessoId);
    if (!row) {
      return;
    }
    this.rows.set(acessoId, { ...row, clientTokenEnc, clientTokenHash, updatedAt: now() });
  }

  async updateDialeto(acessoId: string, dialeto: Acesso["dialeto"]): Promise<void> {
    const row = this.rows.get(acessoId);
    if (!row) {
      return;
    }
    this.rows.set(acessoId, { ...row, dialeto, updatedAt: now() });
  }

  async updateEscopoPadrao(
    acessoId: string,
    escopoPadrao: Acesso["escopoPadrao"],
    timezone: string | null,
  ): Promise<void> {
    const row = this.rows.get(acessoId);
    if (!row) {
      return;
    }
    this.rows.set(acessoId, { ...row, escopoPadrao, timezone, updatedAt: now() });
  }

  async deleteById(acessoId: string): Promise<void> {
    this.rows.delete(acessoId);
  }
}

export class InMemoryGrafoRepository implements GrafoRepositoryPort {
  private readonly dialetos = new Map<string, GrafoDialeto>();
  private readonly tabelas = new Map<string, TabelaGrafo>();
  private readonly colunas = new Map<string, ColunaGrafo>();
  private readonly rels = new Map<string, RelacionamentoGrafo>();
  private readonly locks = new Map<string, Promise<void>>();

  async withAgentLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(agentId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      agentId,
      previous.then(() => current),
    );
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async getDialeto(agentId: string): Promise<GrafoDialeto | null> {
    return this.dialetos.get(agentId) ?? null;
  }

  async setDialeto(agentId: string, dialeto: string): Promise<void> {
    this.dialetos.set(agentId, { agentId, dialeto });
  }

  async mergeTabela(input: MergeTabelaInput): Promise<{ tabela: TabelaGrafo; conflito: boolean }> {
    const existing = [...this.tabelas.values()].find(
      (row) => row.agentId === input.agentId && lower(row.nome) === lower(input.nome),
    );
    if (!existing) {
      const tabela: TabelaGrafo = {
        id: id(),
        agentId: input.agentId,
        nome: input.nome,
        descricao: input.descricao ?? null,
        origem: input.origem,
        status: "vigente",
        autorUsuarioId: input.autorUsuarioId,
      };
      this.tabelas.set(tabela.id, tabela);
      return { tabela, conflito: false };
    }
    const merge = decidirMerge(
      {
        origem: existing.origem,
        status: existing.status,
        descricao: existing.descricao,
      },
      {
        origem: input.origem,
        status: "vigente",
        descricao: input.descricao ?? null,
      },
    );
    if (!merge.aplicar) {
      return { tabela: existing, conflito: false };
    }
    const tabela: TabelaGrafo = {
      ...existing,
      descricao: merge.descricao,
      origem: merge.origem,
      status: merge.status,
      autorUsuarioId: input.autorUsuarioId,
    };
    this.tabelas.set(tabela.id, tabela);
    return { tabela, conflito: merge.conflito };
  }

  async mergeColuna(input: MergeColunaInput): Promise<{ coluna: ColunaGrafo; conflito: boolean }> {
    const existing = [...this.colunas.values()].find(
      (row) => row.tabelaId === input.tabelaId && lower(row.nome) === lower(input.nome),
    );
    if (!existing) {
      const coluna: ColunaGrafo = {
        id: id(),
        tabelaId: input.tabelaId,
        nome: input.nome,
        tipo: input.tipo ?? null,
        descricao: input.descricao ?? null,
        dicionario: input.dicionario ?? null,
        papel: input.papel ?? null,
        formato: input.formato ?? null,
        perfil: input.perfil ?? null,
        origem: input.origem,
        status: "vigente",
        autorUsuarioId: input.autorUsuarioId,
      };
      this.colunas.set(coluna.id, coluna);
      return { coluna, conflito: false };
    }
    const merge = decidirMerge(
      {
        origem: existing.origem,
        status: existing.status,
        descricao: existing.descricao,
        dicionario: existing.dicionario,
        tipo: existing.tipo,
      },
      {
        origem: input.origem,
        status: "vigente",
        descricao: input.descricao ?? null,
        dicionario: input.dicionario ?? null,
        tipo: input.tipo ?? null,
      },
    );
    if (!merge.aplicar) {
      return { coluna: existing, conflito: false };
    }
    const coluna: ColunaGrafo = {
      ...existing,
      tipo: merge.tipo ?? existing.tipo,
      descricao: merge.descricao,
      dicionario: merge.dicionario ?? existing.dicionario,
      papel: input.papel ?? existing.papel,
      formato: input.formato ?? existing.formato,
      perfil: input.perfil ?? existing.perfil,
      origem: merge.origem,
      status: merge.status,
      autorUsuarioId: input.autorUsuarioId,
    };
    this.colunas.set(coluna.id, coluna);
    return { coluna, conflito: merge.conflito };
  }

  async mergeRelacionamento(
    input: MergeRelacionamentoInput,
  ): Promise<{ relacionamento: RelacionamentoGrafo; conflito: boolean }> {
    const existing = [...this.rels.values()].find(
      (row) =>
        row.agentId === input.agentId &&
        row.tabelaOrigemId === input.tabelaOrigemId &&
        row.tabelaDestinoId === input.tabelaDestinoId &&
        lower(row.colunaOrigem) === lower(input.colunaOrigem) &&
        lower(row.colunaDestino) === lower(input.colunaDestino),
    );
    if (!existing) {
      const relacionamento: RelacionamentoGrafo = {
        id: id(),
        agentId: input.agentId,
        tabelaOrigemId: input.tabelaOrigemId,
        colunaOrigem: input.colunaOrigem,
        tabelaDestinoId: input.tabelaDestinoId,
        colunaDestino: input.colunaDestino,
        tipoJoin: input.tipoJoin,
        cardinalidade: input.cardinalidade ?? null,
        descricao: input.descricao ?? null,
        origem: input.origem,
        status: "vigente",
        autorUsuarioId: input.autorUsuarioId,
      };
      this.rels.set(relacionamento.id, relacionamento);
      return { relacionamento, conflito: false };
    }
    const merge = decidirMerge(
      {
        origem: existing.origem,
        status: existing.status,
        descricao: existing.descricao,
      },
      {
        origem: input.origem,
        status: "vigente",
        descricao: input.descricao ?? null,
      },
    );
    if (!merge.aplicar) {
      return { relacionamento: existing, conflito: false };
    }
    const relacionamento: RelacionamentoGrafo = {
      ...existing,
      tipoJoin: input.tipoJoin,
      cardinalidade: input.cardinalidade ?? existing.cardinalidade,
      descricao: merge.descricao,
      origem: merge.origem,
      status: merge.status,
      autorUsuarioId: input.autorUsuarioId,
    };
    this.rels.set(relacionamento.id, relacionamento);
    return { relacionamento, conflito: merge.conflito };
  }

  async listTabelas(agentId: string): Promise<readonly TabelaGrafo[]> {
    return [...this.tabelas.values()].filter((row) => row.agentId === agentId);
  }

  async listColunas(tabelaId: string): Promise<readonly ColunaGrafo[]> {
    return [...this.colunas.values()].filter((row) => row.tabelaId === tabelaId);
  }

  async listRelacionamentos(agentId: string): Promise<readonly RelacionamentoGrafo[]> {
    return [...this.rels.values()].filter((row) => row.agentId === agentId);
  }

  async countConflitos(agentId: string): Promise<number> {
    const tabelas = [...this.tabelas.values()].filter((row) => row.agentId === agentId);
    let n = tabelas.filter((tabela) => tabela.status === "conflito").length;
    const tabelaIds = new Set(tabelas.map((tabela) => tabela.id));
    n += [...this.colunas.values()].filter(
      (coluna) => tabelaIds.has(coluna.tabelaId) && coluna.status === "conflito",
    ).length;
    n += [...this.rels.values()].filter(
      (rel) => rel.agentId === agentId && rel.status === "conflito",
    ).length;
    return n;
  }

  async findTabelaByNome(agentId: string, nome: string): Promise<TabelaGrafo | null> {
    return (
      [...this.tabelas.values()].find(
        (row) => row.agentId === agentId && lower(row.nome) === lower(nome),
      ) ?? null
    );
  }

  async findColuna(tabelaId: string, nome: string): Promise<ColunaGrafo | null> {
    return (
      [...this.colunas.values()].find(
        (row) => row.tabelaId === tabelaId && lower(row.nome) === lower(nome),
      ) ?? null
    );
  }

  async resolverConflito(input: {
    tabelaId?: string;
    colunaId?: string;
    relacionamentoId?: string;
    origem: OrigemFato;
    descricao?: string | null;
    dicionario?: string | null;
    autorUsuarioId: string | null;
  }): Promise<void> {
    if (input.tabelaId) {
      const row = this.tabelas.get(input.tabelaId);
      if (row) {
        this.tabelas.set(input.tabelaId, {
          ...row,
          origem: input.origem,
          descricao: input.descricao ?? row.descricao,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        });
      }
    }
    if (input.colunaId) {
      const row = this.colunas.get(input.colunaId);
      if (row) {
        this.colunas.set(input.colunaId, {
          ...row,
          origem: input.origem,
          descricao: input.descricao ?? row.descricao,
          dicionario: input.dicionario ?? row.dicionario,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        });
      }
    }
    if (input.relacionamentoId) {
      const row = this.rels.get(input.relacionamentoId);
      if (row) {
        this.rels.set(input.relacionamentoId, {
          ...row,
          origem: input.origem,
          descricao: input.descricao ?? row.descricao,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        });
      }
    }
  }

  async buscar(agentId: string, query: string, limite: number): Promise<readonly TabelaGrafo[]> {
    return rankByTerms(
      [...this.tabelas.values()].filter((row) => row.agentId === agentId),
      tokenizeQuery(query),
      (row) => `${row.nome} ${row.descricao ?? ""}`,
      limite,
    );
  }
}

export class InMemorySkillRepository implements SkillRepositoryPort {
  private readonly rows = new Map<string, Skill>();

  async create(input: NovaSkill): Promise<Skill> {
    const row: Skill = {
      id: id(),
      agentId: input.agentId,
      slug: input.slug,
      nome: input.nome,
      descricao: input.descricao,
      sqlModelo: input.sqlModelo,
      params: parseParametroSkillList(input.params ?? []),
      escopo: input.escopo ?? escopoVazio(),
      autorUsuarioId: input.autorUsuarioId,
      versao: 1,
      status: "rascunho",
      createdAt: now(),
      updatedAt: now(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async update(
    skillId: string,
    patch: Partial<
      Pick<Skill, "nome" | "descricao" | "sqlModelo" | "params" | "status" | "escopo">
    >,
  ): Promise<Skill> {
    const row = this.rows.get(skillId);
    if (!row) {
      throw new Error("skill not found");
    }
    const next: Skill = {
      ...row,
      ...patch,
      versao: row.versao + 1,
      updatedAt: now(),
    };
    this.rows.set(skillId, next);
    return next;
  }

  async setStatus(skillId: string, status: StatusSkill, versao?: number): Promise<Skill> {
    const row = this.rows.get(skillId);
    if (!row) {
      throw new Error("skill not found");
    }
    const next: Skill = { ...row, status, versao: versao ?? row.versao, updatedAt: now() };
    this.rows.set(skillId, next);
    return next;
  }

  async findById(skillId: string): Promise<Skill | null> {
    return this.rows.get(skillId) ?? null;
  }

  async findBySlug(agentId: string, slug: string): Promise<Skill | null> {
    return (
      [...this.rows.values()].find((row) => row.agentId === agentId && row.slug === slug) ?? null
    );
  }

  async listByAgent(agentId: string): Promise<readonly Skill[]> {
    return [...this.rows.values()].filter((row) => row.agentId === agentId);
  }

  async buscar(
    agentId: string,
    query: string,
    limite: number,
    status?: StatusSkill | readonly StatusSkill[],
  ): Promise<readonly Skill[]> {
    const allowed =
      status === undefined ? null : new Set(typeof status === "string" ? [status] : status);
    return rankByTerms(
      [...this.rows.values()].filter(
        (row) => row.agentId === agentId && (allowed === null || allowed.has(row.status)),
      ),
      tokenizeQuery(query),
      (row) =>
        `${row.nome} ${row.descricao} ${row.slug} ${row.sqlModelo} ${row.params
          .map((param) => `${param.nome} ${param.descricao} ${param.tipo}`)
          .join(" ")}`,
      limite,
    );
  }
}

export class InMemoryAnotacaoGrafoRepository implements AnotacaoGrafoRepositoryPort {
  private readonly rows = new Map<string, AnotacaoGrafo>();

  async create(input: {
    agentId: string;
    tabelaId: string | null;
    tipo: string;
    titulo: string;
    texto: string;
    autorUsuarioId: string | null;
  }): Promise<AnotacaoGrafo> {
    const row: AnotacaoGrafo = {
      id: id(),
      ...input,
      createdAt: now(),
      updatedAt: now(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async list(agentId: string, tabelaId?: string | null): Promise<readonly AnotacaoGrafo[]> {
    return [...this.rows.values()].filter(
      (row) => row.agentId === agentId && (tabelaId === undefined || row.tabelaId === tabelaId),
    );
  }

  async findById(anotacaoId: string): Promise<AnotacaoGrafo | null> {
    return this.rows.get(anotacaoId) ?? null;
  }

  async deleteById(anotacaoId: string): Promise<boolean> {
    return this.rows.delete(anotacaoId);
  }

  async buscar(agentId: string, query: string, limite: number): Promise<readonly AnotacaoGrafo[]> {
    return rankByTerms(
      [...this.rows.values()].filter((row) => row.agentId === agentId),
      tokenizeQuery(query),
      (row) => `${row.titulo} ${row.texto}`,
      limite,
    );
  }
}

export class InMemoryAuditLog implements AuditLogPort {
  readonly entries: AuditLogEntry[] = [];

  async append(entry: NewAuditLog): Promise<AuditLogEntry> {
    const row: AuditLogEntry = { id: id(), createdAt: now(), ...entry };
    this.entries.push(row);
    return row;
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const before = this.entries.length;
    const keep = this.entries.filter((row) => row.createdAt >= cutoff);
    this.entries.length = 0;
    this.entries.push(...keep);
    return before - keep.length;
  }

  async listByUsuario(usuarioId: string, limite: number): Promise<readonly AuditLogEntry[]> {
    return this.entries
      .filter((row) => row.usuarioId === usuarioId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limite);
  }
}

export class InMemoryAprendizadoRepository implements AprendizadoRepositoryPort {
  private readonly consultas: ConsultaAprendida[] = [];
  private readonly sinonimos: Sinonimo[] = [];
  private readonly lacunas: LacunaConsulta[] = [];

  async salvarConsulta(input: {
    agentId: string;
    skillId: string | null;
    pergunta: string;
    sql: string;
    paramsContrato: readonly ParametroSkill[];
    autorUsuarioId: string | null;
  }): Promise<ConsultaAprendida> {
    const existing = this.consultas.find(
      (row) => row.agentId === input.agentId && row.sql === input.sql,
    );
    if (existing) {
      const next: ConsultaAprendida = {
        ...existing,
        execucoes: existing.execucoes + 1,
        ultimaExecucao: now(),
        pergunta:
          input.pergunta.trim().length > existing.pergunta.trim().length
            ? input.pergunta
            : existing.pergunta,
      };
      const idx = this.consultas.findIndex((row) => row.id === existing.id);
      this.consultas[idx] = next;
      return next;
    }
    const row: ConsultaAprendida = {
      id: id(),
      agentId: input.agentId,
      skillId: input.skillId,
      pergunta: input.pergunta,
      sql: input.sql,
      paramsContrato: input.paramsContrato,
      execucoes: 1,
      ultimaExecucao: now(),
      status: "ativa",
      autorUsuarioId: input.autorUsuarioId,
    };
    this.consultas.push(row);
    return row;
  }

  async listarConsultas(agentId: string, limite: number): Promise<readonly ConsultaAprendida[]> {
    return this.consultas
      .filter((row) => row.agentId === agentId)
      .sort((a, b) => b.execucoes - a.execucoes)
      .slice(0, limite);
  }

  async buscarConsultas(
    agentId: string,
    query: string,
    limite: number,
  ): Promise<readonly ConsultaAprendida[]> {
    const terms = tokenizeQuery(query);
    return rankByTerms(
      this.consultas.filter((row) => row.agentId === agentId),
      terms,
      (row) => `${row.pergunta} ${row.sql}`,
      limite,
    );
  }

  async registrarSinonimo(input: {
    agentId: string;
    termo: string;
    alvoTipo: string;
    alvoId: string;
  }): Promise<Sinonimo> {
    const row: Sinonimo = { id: id(), ...input };
    this.sinonimos.push(row);
    return row;
  }

  async listarSinonimos(agentId: string): Promise<readonly Sinonimo[]> {
    return this.sinonimos.filter((row) => row.agentId === agentId);
  }

  async registrarLacuna(agentId: string, pergunta: string): Promise<LacunaConsulta> {
    const row: LacunaConsulta = { id: id(), agentId, pergunta, createdAt: now() };
    this.lacunas.push(row);
    return row;
  }
}
