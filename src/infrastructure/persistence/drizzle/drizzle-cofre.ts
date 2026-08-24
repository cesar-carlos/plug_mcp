import { AsyncLocalStorage } from "node:async_hooks";
import { and, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { rankByTerms, tokenizeQuery } from "../busca-termos.js";
import type { Db } from "./db.js";
import * as schema from "../schema.js";
import type { Acesso, NovoAcesso, StatusAcesso } from "../../../domain/entities/acesso.js";
import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type { NovoUsuarioMcp, UsuarioMcp } from "../../../domain/entities/usuario-mcp.js";
import type {
  AnotacaoGrafo,
  NovaSkill,
  Skill,
  StatusSkill,
} from "../../../domain/entities/skill.js";
import type {
  ColunaGrafo,
  GrafoDialeto,
  OrigemFato,
  RelacionamentoGrafo,
  StatusFato,
  TabelaGrafo,
} from "../../../domain/entities/grafo.js";
import { decidirMerge } from "../../../domain/entities/merge-fato.js";
import { parseParametroSkillList } from "../../../domain/entities/skill.js";
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
import type { AuditLogEntry, NewAuditLog } from "../../../domain/entities/audit-log.js";

const toUsuario = (row: typeof schema.usuarioMcp.$inferSelect): UsuarioMcp => ({
  id: row.id,
  emailEnc: row.emailEnc,
  emailHash: row.emailHash,
  senhaEnc: row.senhaEnc,
  tokenHash: row.tokenHash,
  tokenExpiresAt: row.tokenExpiresAt ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toAcesso = (row: typeof schema.acesso.$inferSelect): Acesso => ({
  id: row.id,
  usuarioId: row.usuarioId,
  agentId: row.agentId,
  dialeto: row.dialeto as Dialeto,
  nomeAmigavel: row.nomeAmigavel,
  clientTokenEnc: row.clientTokenEnc,
  clientTokenHash: row.clientTokenHash,
  statusAcesso: row.statusAcesso as StatusAcesso,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class DrizzleUsuarioRepository implements UsuarioRepositoryPort {
  constructor(private readonly db: Db) {}

  async create(input: NovoUsuarioMcp): Promise<UsuarioMcp> {
    const [row] = await this.db.insert(schema.usuarioMcp).values(input).returning();
    return toUsuario(row!);
  }

  async findById(id: string): Promise<UsuarioMcp | null> {
    const [row] = await this.db
      .select()
      .from(schema.usuarioMcp)
      .where(eq(schema.usuarioMcp.id, id))
      .limit(1);
    return row ? toUsuario(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<UsuarioMcp | null> {
    const [row] = await this.db
      .select()
      .from(schema.usuarioMcp)
      .where(eq(schema.usuarioMcp.tokenHash, tokenHash))
      .limit(1);
    return row ? toUsuario(row) : null;
  }

  async findByEmailHash(emailHash: string): Promise<UsuarioMcp | null> {
    const [row] = await this.db
      .select()
      .from(schema.usuarioMcp)
      .where(eq(schema.usuarioMcp.emailHash, emailHash))
      .limit(1);
    return row ? toUsuario(row) : null;
  }

  async updateTokenHash(
    id: string,
    tokenHash: string,
    tokenExpiresAt?: Date | null,
  ): Promise<void> {
    await this.db
      .update(schema.usuarioMcp)
      .set({
        tokenHash,
        ...(tokenExpiresAt !== undefined ? { tokenExpiresAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.usuarioMcp.id, id));
  }

  async updateCredenciais(id: string, emailEnc: string, senhaEnc: string): Promise<void> {
    await this.db
      .update(schema.usuarioMcp)
      .set({ emailEnc, senhaEnc, updatedAt: new Date() })
      .where(eq(schema.usuarioMcp.id, id));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(schema.usuarioMcp).where(eq(schema.usuarioMcp.id, id));
  }
}

export class DrizzleAcessoRepository implements AcessoRepositoryPort {
  constructor(private readonly db: Db) {}

  async create(input: NovoAcesso): Promise<Acesso> {
    const [row] = await this.db.insert(schema.acesso).values(input).returning();
    return toAcesso(row!);
  }

  async findById(id: string): Promise<Acesso | null> {
    const [row] = await this.db
      .select()
      .from(schema.acesso)
      .where(eq(schema.acesso.id, id))
      .limit(1);
    return row ? toAcesso(row) : null;
  }

  async findByIdForUsuario(id: string, usuarioId: string): Promise<Acesso | null> {
    const [row] = await this.db
      .select()
      .from(schema.acesso)
      .where(and(eq(schema.acesso.id, id), eq(schema.acesso.usuarioId, usuarioId)))
      .limit(1);
    return row ? toAcesso(row) : null;
  }

  async listByUsuario(usuarioId: string): Promise<readonly Acesso[]> {
    const rows = await this.db
      .select()
      .from(schema.acesso)
      .where(eq(schema.acesso.usuarioId, usuarioId));
    return rows.map(toAcesso);
  }

  async findByUsuarioAgentTokenHash(
    usuarioId: string,
    agentId: string,
    clientTokenHash: string,
  ): Promise<Acesso | null> {
    const [row] = await this.db
      .select()
      .from(schema.acesso)
      .where(
        and(
          eq(schema.acesso.usuarioId, usuarioId),
          eq(schema.acesso.agentId, agentId),
          eq(schema.acesso.clientTokenHash, clientTokenHash),
        ),
      )
      .limit(1);
    return row ? toAcesso(row) : null;
  }

  async updateStatus(id: string, status: StatusAcesso): Promise<void> {
    await this.db
      .update(schema.acesso)
      .set({ statusAcesso: status, updatedAt: new Date() })
      .where(eq(schema.acesso.id, id));
  }

  async updateClientToken(
    id: string,
    clientTokenEnc: string,
    clientTokenHash: string,
  ): Promise<void> {
    await this.db
      .update(schema.acesso)
      .set({ clientTokenEnc, clientTokenHash, updatedAt: new Date() })
      .where(eq(schema.acesso.id, id));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(schema.acesso).where(eq(schema.acesso.id, id));
  }
}

const toTabela = (row: typeof schema.tabelaGrafo.$inferSelect): TabelaGrafo => ({
  id: row.id,
  agentId: row.agentId,
  nome: row.nome,
  descricao: row.descricao,
  origem: row.origem as OrigemFato,
  status: row.status as StatusFato,
  autorUsuarioId: row.autorUsuarioId,
});

const grafoTx = new AsyncLocalStorage<Db>();

export class DrizzleGrafoRepository implements GrafoRepositoryPort {
  constructor(private readonly db: Db) {}

  private conn(): Db {
    return grafoTx.getStore() ?? this.db;
  }

  async withAgentLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.insert(schema.grafoLock).values({ agentId }).onConflictDoNothing();
      await tx.execute(
        sql`select agent_id from grafo_lock where agent_id = ${agentId}::uuid for update`,
      );
      return grafoTx.run(tx as unknown as Db, fn);
    });
  }

  async getDialeto(agentId: string): Promise<GrafoDialeto | null> {
    const [row] = await this.conn()
      .select()
      .from(schema.grafoDialeto)
      .where(eq(schema.grafoDialeto.agentId, agentId))
      .limit(1);
    return row ? { agentId: row.agentId, dialeto: row.dialeto } : null;
  }

  async setDialeto(agentId: string, dialeto: string): Promise<void> {
    await this.conn()
      .insert(schema.grafoDialeto)
      .values({ agentId, dialeto })
      .onConflictDoUpdate({ target: schema.grafoDialeto.agentId, set: { dialeto } });
  }

  async mergeTabela(input: MergeTabelaInput): Promise<{ tabela: TabelaGrafo; conflito: boolean }> {
    const existing = await this.findTabelaByNome(input.agentId, input.nome);
    if (!existing) {
      const [row] = await this.conn()
        .insert(schema.tabelaGrafo)
        .values({
          agentId: input.agentId,
          nome: input.nome,
          descricao: input.descricao ?? null,
          origem: input.origem,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        })
        .returning();
      return { tabela: toTabela(row!), conflito: false };
    }
    const merge = decidirMerge(
      { origem: existing.origem, status: existing.status, descricao: existing.descricao },
      { origem: input.origem, status: "vigente", descricao: input.descricao ?? null },
    );
    if (!merge.aplicar) {
      return { tabela: existing, conflito: false };
    }
    const [row] = await this.conn()
      .update(schema.tabelaGrafo)
      .set({
        descricao: merge.descricao,
        origem: merge.origem,
        status: merge.status,
        autorUsuarioId: input.autorUsuarioId,
        updatedAt: new Date(),
      })
      .where(eq(schema.tabelaGrafo.id, existing.id))
      .returning();
    return { tabela: toTabela(row!), conflito: merge.conflito };
  }

  async mergeColuna(input: MergeColunaInput): Promise<{ coluna: ColunaGrafo; conflito: boolean }> {
    const existing = await this.findColuna(input.tabelaId, input.nome);
    if (!existing) {
      const [row] = await this.conn()
        .insert(schema.colunaGrafo)
        .values({
          tabelaId: input.tabelaId,
          nome: input.nome,
          tipo: input.tipo ?? null,
          descricao: input.descricao ?? null,
          dicionario: input.dicionario ?? null,
          origem: input.origem,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        })
        .returning();
      return {
        coluna: {
          id: row!.id,
          tabelaId: row!.tabelaId,
          nome: row!.nome,
          tipo: row!.tipo,
          descricao: row!.descricao,
          dicionario: row!.dicionario,
          origem: row!.origem as OrigemFato,
          status: row!.status as StatusFato,
          autorUsuarioId: row!.autorUsuarioId,
        },
        conflito: false,
      };
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
    const [row] = await this.conn()
      .update(schema.colunaGrafo)
      .set({
        tipo: merge.tipo ?? existing.tipo,
        descricao: merge.descricao,
        dicionario: merge.dicionario ?? existing.dicionario,
        origem: merge.origem,
        status: merge.status,
        autorUsuarioId: input.autorUsuarioId,
        updatedAt: new Date(),
      })
      .where(eq(schema.colunaGrafo.id, existing.id))
      .returning();
    return {
      coluna: {
        id: row!.id,
        tabelaId: row!.tabelaId,
        nome: row!.nome,
        tipo: row!.tipo,
        descricao: row!.descricao,
        dicionario: row!.dicionario,
        origem: row!.origem as OrigemFato,
        status: row!.status as StatusFato,
        autorUsuarioId: row!.autorUsuarioId,
      },
      conflito: merge.conflito,
    };
  }

  async mergeRelacionamento(
    input: MergeRelacionamentoInput,
  ): Promise<{ relacionamento: RelacionamentoGrafo; conflito: boolean }> {
    const [existing] = await this.conn()
      .select()
      .from(schema.relacionamentoGrafo)
      .where(
        and(
          eq(schema.relacionamentoGrafo.agentId, input.agentId),
          eq(schema.relacionamentoGrafo.tabelaOrigemId, input.tabelaOrigemId),
          eq(schema.relacionamentoGrafo.tabelaDestinoId, input.tabelaDestinoId),
          eq(schema.relacionamentoGrafo.colunaOrigem, input.colunaOrigem),
          eq(schema.relacionamentoGrafo.colunaDestino, input.colunaDestino),
        ),
      )
      .limit(1);
    if (!existing) {
      const [row] = await this.conn()
        .insert(schema.relacionamentoGrafo)
        .values({
          agentId: input.agentId,
          tabelaOrigemId: input.tabelaOrigemId,
          colunaOrigem: input.colunaOrigem,
          tabelaDestinoId: input.tabelaDestinoId,
          colunaDestino: input.colunaDestino,
          tipoJoin: input.tipoJoin,
          descricao: input.descricao ?? null,
          origem: input.origem,
          autorUsuarioId: input.autorUsuarioId,
        })
        .returning();
      return {
        relacionamento: {
          id: row!.id,
          agentId: row!.agentId,
          tabelaOrigemId: row!.tabelaOrigemId,
          colunaOrigem: row!.colunaOrigem,
          tabelaDestinoId: row!.tabelaDestinoId,
          colunaDestino: row!.colunaDestino,
          tipoJoin: row!.tipoJoin,
          descricao: row!.descricao,
          origem: row!.origem as OrigemFato,
          status: row!.status as StatusFato,
          autorUsuarioId: row!.autorUsuarioId,
        },
        conflito: false,
      };
    }
    return {
      relacionamento: {
        id: existing.id,
        agentId: existing.agentId,
        tabelaOrigemId: existing.tabelaOrigemId,
        colunaOrigem: existing.colunaOrigem,
        tabelaDestinoId: existing.tabelaDestinoId,
        colunaDestino: existing.colunaDestino,
        tipoJoin: existing.tipoJoin,
        descricao: existing.descricao,
        origem: existing.origem as OrigemFato,
        status: existing.status as StatusFato,
        autorUsuarioId: existing.autorUsuarioId,
      },
      conflito: false,
    };
  }

  async listTabelas(agentId: string): Promise<readonly TabelaGrafo[]> {
    const rows = await this.conn()
      .select()
      .from(schema.tabelaGrafo)
      .where(eq(schema.tabelaGrafo.agentId, agentId));
    return rows.map(toTabela);
  }

  async listColunas(tabelaId: string): Promise<readonly ColunaGrafo[]> {
    const rows = await this.conn()
      .select()
      .from(schema.colunaGrafo)
      .where(eq(schema.colunaGrafo.tabelaId, tabelaId));
    return rows.map((row) => ({
      id: row.id,
      tabelaId: row.tabelaId,
      nome: row.nome,
      tipo: row.tipo,
      descricao: row.descricao,
      dicionario: row.dicionario,
      origem: row.origem as OrigemFato,
      status: row.status as StatusFato,
      autorUsuarioId: row.autorUsuarioId,
    }));
  }

  async listRelacionamentos(agentId: string): Promise<readonly RelacionamentoGrafo[]> {
    const rows = await this.conn()
      .select()
      .from(schema.relacionamentoGrafo)
      .where(eq(schema.relacionamentoGrafo.agentId, agentId));
    return rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      tabelaOrigemId: row.tabelaOrigemId,
      colunaOrigem: row.colunaOrigem,
      tabelaDestinoId: row.tabelaDestinoId,
      colunaDestino: row.colunaDestino,
      tipoJoin: row.tipoJoin,
      descricao: row.descricao,
      origem: row.origem as OrigemFato,
      status: row.status as StatusFato,
      autorUsuarioId: row.autorUsuarioId,
    }));
  }

  async countConflitos(agentId: string): Promise<number> {
    const conn = this.conn();
    const [tabelas] = await conn
      .select({ n: count() })
      .from(schema.tabelaGrafo)
      .where(
        and(eq(schema.tabelaGrafo.agentId, agentId), eq(schema.tabelaGrafo.status, "conflito")),
      );
    const [colunas] = await conn
      .select({ n: count() })
      .from(schema.colunaGrafo)
      .innerJoin(schema.tabelaGrafo, eq(schema.colunaGrafo.tabelaId, schema.tabelaGrafo.id))
      .where(
        and(eq(schema.tabelaGrafo.agentId, agentId), eq(schema.colunaGrafo.status, "conflito")),
      );
    const [rels] = await conn
      .select({ n: count() })
      .from(schema.relacionamentoGrafo)
      .where(
        and(
          eq(schema.relacionamentoGrafo.agentId, agentId),
          eq(schema.relacionamentoGrafo.status, "conflito"),
        ),
      );
    return (tabelas?.n ?? 0) + (colunas?.n ?? 0) + (rels?.n ?? 0);
  }

  async findTabelaByNome(agentId: string, nome: string): Promise<TabelaGrafo | null> {
    const rows = await this.conn()
      .select()
      .from(schema.tabelaGrafo)
      .where(eq(schema.tabelaGrafo.agentId, agentId));
    const row = rows.find((item) => item.nome.toLowerCase() === nome.toLowerCase());
    return row ? toTabela(row) : null;
  }

  async findColuna(tabelaId: string, nome: string): Promise<ColunaGrafo | null> {
    const rows = await this.conn()
      .select()
      .from(schema.colunaGrafo)
      .where(eq(schema.colunaGrafo.tabelaId, tabelaId));
    const row = rows.find((item) => item.nome.toLowerCase() === nome.toLowerCase());
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      tabelaId: row.tabelaId,
      nome: row.nome,
      tipo: row.tipo,
      descricao: row.descricao,
      dicionario: row.dicionario,
      origem: row.origem as OrigemFato,
      status: row.status as StatusFato,
      autorUsuarioId: row.autorUsuarioId,
    };
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
      await this.conn()
        .update(schema.tabelaGrafo)
        .set({
          origem: input.origem,
          descricao: input.descricao,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
          updatedAt: new Date(),
        })
        .where(eq(schema.tabelaGrafo.id, input.tabelaId));
    }
    if (input.colunaId) {
      await this.conn()
        .update(schema.colunaGrafo)
        .set({
          origem: input.origem,
          descricao: input.descricao,
          dicionario: input.dicionario,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
          updatedAt: new Date(),
        })
        .where(eq(schema.colunaGrafo.id, input.colunaId));
    }
    if (input.relacionamentoId) {
      await this.conn()
        .update(schema.relacionamentoGrafo)
        .set({
          origem: input.origem,
          descricao: input.descricao,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
          updatedAt: new Date(),
        })
        .where(eq(schema.relacionamentoGrafo.id, input.relacionamentoId));
    }
  }

  async buscar(agentId: string, query: string, limite: number): Promise<readonly TabelaGrafo[]> {
    const terms = tokenizeQuery(query);
    if (terms.length === 0) {
      return [];
    }
    const likes = terms.flatMap((term) => {
      const like = `%${term}%`;
      return [ilike(schema.tabelaGrafo.nome, like), ilike(schema.tabelaGrafo.descricao, like)];
    });
    const rows = await this.conn()
      .select()
      .from(schema.tabelaGrafo)
      .where(and(eq(schema.tabelaGrafo.agentId, agentId), or(...likes)))
      .limit(Math.max(limite * 4, 32));
    return rankByTerms(
      rows.map(toTabela),
      terms,
      (row) => `${row.nome} ${row.descricao ?? ""}`,
      limite,
    );
  }
}

export class DrizzleSkillRepository implements SkillRepositoryPort {
  constructor(private readonly db: Db) {}

  async create(input: NovaSkill): Promise<Skill> {
    const [row] = await this.db
      .insert(schema.skill)
      .values({
        agentId: input.agentId,
        slug: input.slug,
        nome: input.nome,
        descricao: input.descricao,
        sqlModelo: input.sqlModelo,
        params: input.params ? [...input.params] : [],
        autorUsuarioId: input.autorUsuarioId,
      })
      .returning();
    return this.toSkill(row!);
  }

  async update(
    id: string,
    patch: Partial<Pick<Skill, "nome" | "descricao" | "sqlModelo" | "params" | "status">>,
  ): Promise<Skill> {
    const { params, ...rest } = patch;
    const [row] = await this.db
      .update(schema.skill)
      .set({
        ...rest,
        ...(params !== undefined ? { params: [...params] } : {}),
        versao: sql`${schema.skill.versao} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.skill.id, id))
      .returning();
    return this.toSkill(row!);
  }

  async setStatus(id: string, status: StatusSkill, versao?: number): Promise<Skill> {
    const [row] = await this.db
      .update(schema.skill)
      .set({
        status,
        ...(versao !== undefined ? { versao } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.skill.id, id))
      .returning();
    return this.toSkill(row!);
  }

  async findById(id: string): Promise<Skill | null> {
    const [row] = await this.db.select().from(schema.skill).where(eq(schema.skill.id, id)).limit(1);
    return row ? this.toSkill(row) : null;
  }

  async findBySlug(agentId: string, slug: string): Promise<Skill | null> {
    const [row] = await this.db
      .select()
      .from(schema.skill)
      .where(and(eq(schema.skill.agentId, agentId), eq(schema.skill.slug, slug)))
      .limit(1);
    return row ? this.toSkill(row) : null;
  }

  async listByAgent(agentId: string): Promise<readonly Skill[]> {
    const rows = await this.db.select().from(schema.skill).where(eq(schema.skill.agentId, agentId));
    return rows.map((row) => this.toSkill(row));
  }

  async buscar(
    agentId: string,
    query: string,
    limite: number,
    status?: StatusSkill | readonly StatusSkill[],
  ): Promise<readonly Skill[]> {
    const terms = tokenizeQuery(query);
    if (terms.length === 0) {
      return [];
    }
    const likes = terms.flatMap((term) => {
      const like = `%${term}%`;
      return [
        ilike(schema.skill.nome, like),
        ilike(schema.skill.descricao, like),
        ilike(schema.skill.slug, like),
        ilike(schema.skill.sqlModelo, like),
      ];
    });
    const statusFilter =
      status === undefined
        ? undefined
        : typeof status === "string"
          ? eq(schema.skill.status, status)
          : inArray(schema.skill.status, [...status]);
    const rows = await this.db
      .select()
      .from(schema.skill)
      .where(and(eq(schema.skill.agentId, agentId), statusFilter, or(...likes)))
      .limit(Math.max(limite * 4, 32));
    return rankByTerms(
      rows.map((row) => this.toSkill(row)),
      terms,
      (row) =>
        `${row.nome} ${row.descricao} ${row.slug} ${row.sqlModelo} ${row.params
          .map((param) => `${param.nome} ${param.descricao} ${param.tipo}`)
          .join(" ")}`,
      limite,
    );
  }

  private toSkill(row: typeof schema.skill.$inferSelect): Skill {
    return {
      id: row.id,
      agentId: row.agentId,
      slug: row.slug,
      nome: row.nome,
      descricao: row.descricao,
      sqlModelo: row.sqlModelo,
      params: parseParametroSkillList(row.params),
      versao: row.versao,
      status: row.status as StatusSkill,
      autorUsuarioId: row.autorUsuarioId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export class DrizzleAnotacaoGrafoRepository implements AnotacaoGrafoRepositoryPort {
  constructor(private readonly db: Db) {}

  async create(input: {
    agentId: string;
    tabelaId: string | null;
    tipo: string;
    titulo: string;
    texto: string;
    autorUsuarioId: string | null;
  }): Promise<AnotacaoGrafo> {
    const [row] = await this.db.insert(schema.anotacaoGrafo).values(input).returning();
    return this.toAnotacao(row!);
  }

  async list(agentId: string, tabelaId?: string | null): Promise<readonly AnotacaoGrafo[]> {
    const rows = await this.db
      .select()
      .from(schema.anotacaoGrafo)
      .where(
        tabelaId === undefined
          ? eq(schema.anotacaoGrafo.agentId, agentId)
          : tabelaId === null
            ? and(eq(schema.anotacaoGrafo.agentId, agentId), isNull(schema.anotacaoGrafo.tabelaId))
            : and(
                eq(schema.anotacaoGrafo.agentId, agentId),
                eq(schema.anotacaoGrafo.tabelaId, tabelaId),
              ),
      );
    return rows.map((row) => this.toAnotacao(row));
  }

  async findById(id: string): Promise<AnotacaoGrafo | null> {
    const [row] = await this.db
      .select()
      .from(schema.anotacaoGrafo)
      .where(eq(schema.anotacaoGrafo.id, id))
      .limit(1);
    return row ? this.toAnotacao(row) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(schema.anotacaoGrafo)
      .where(eq(schema.anotacaoGrafo.id, id))
      .returning();
    return rows.length > 0;
  }

  async buscar(agentId: string, query: string, limite: number): Promise<readonly AnotacaoGrafo[]> {
    const terms = tokenizeQuery(query);
    if (terms.length === 0) {
      return [];
    }
    const likes = terms.flatMap((term) => {
      const like = `%${term}%`;
      return [ilike(schema.anotacaoGrafo.titulo, like), ilike(schema.anotacaoGrafo.texto, like)];
    });
    const rows = await this.db
      .select()
      .from(schema.anotacaoGrafo)
      .where(and(eq(schema.anotacaoGrafo.agentId, agentId), or(...likes)))
      .limit(Math.max(limite * 4, 32));
    return rankByTerms(
      rows.map((row) => this.toAnotacao(row)),
      terms,
      (row) => `${row.titulo} ${row.texto}`,
      limite,
    );
  }

  private toAnotacao(row: typeof schema.anotacaoGrafo.$inferSelect): AnotacaoGrafo {
    return {
      id: row.id,
      agentId: row.agentId,
      tabelaId: row.tabelaId,
      tipo: row.tipo,
      titulo: row.titulo,
      texto: row.texto,
      autorUsuarioId: row.autorUsuarioId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export class DrizzleAuditLog implements AuditLogPort {
  constructor(private readonly db: Db) {}

  async append(entry: NewAuditLog): Promise<AuditLogEntry> {
    const [row] = await this.db
      .insert(schema.auditLog)
      .values({
        usuarioId: entry.usuarioId,
        acessoId: entry.acessoId,
        tool: entry.tool,
        sqlEnviado: entry.sqlEnviado,
        sucesso: entry.sucesso ? 1 : 0,
        codigoErro: entry.codigoErro,
        linhasRetornadas: entry.linhasRetornadas,
        duracaoMs: entry.duracaoMs,
      })
      .returning();
    return {
      id: row!.id,
      createdAt: row!.createdAt,
      usuarioId: row!.usuarioId,
      acessoId: row!.acessoId,
      tool: row!.tool,
      sqlEnviado: row!.sqlEnviado,
      sucesso: row!.sucesso === 1,
      codigoErro: row!.codigoErro,
      linhasRetornadas: row!.linhasRetornadas,
      duracaoMs: row!.duracaoMs,
    };
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(schema.auditLog)
      .where(sql`${schema.auditLog.createdAt} < ${cutoff}`)
      .returning();
    return rows.length;
  }
}
