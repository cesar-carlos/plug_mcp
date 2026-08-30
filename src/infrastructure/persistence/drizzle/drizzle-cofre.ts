import { AsyncLocalStorage } from "node:async_hooks";
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { rankFetched, tokenizeQuery } from "../busca-termos.js";
import type { Db } from "./db.js";
import { condicaoFtsOuIlike } from "./fts-busca.js";
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
  SchemaSnapshotGrafo,
  StatusFato,
  TabelaGrafo,
} from "../../../domain/entities/grafo.js";
import { decidirMerge, sensibilidadeAposMerge } from "../../../domain/entities/merge-fato.js";
import { parseParametroSkillList } from "../../../domain/entities/skill.js";
import { parseEscopoPadrao, parseEscopoSkill } from "../../../domain/entities/escopo.js";
import type { Cardinalidade, PapelColuna } from "../../../domain/entities/escopo.js";
import {
  fingerprintPares,
  fingerprintParesInvertidos,
  paresDeInput,
  type ParRelacionamento,
} from "../../../domain/entities/relacionamento.js";
import { parseSensibilidadeColuna } from "../../../domain/entities/privacidade.js";
import { parseConsultaSemantica } from "../../../domain/entities/consulta-semantica.js";
import { parsePoliticaConsulta } from "../../../domain/entities/politica-consulta.js";
import type { AcessoRepositoryPort } from "../../../domain/ports/acesso-repository.port.js";
import type { UsuarioRepositoryPort } from "../../../domain/ports/usuario-repository.port.js";
import type {
  GrafoRepositoryPort,
  MergeColunaInput,
  MergeRelacionamentoInput,
  MergeTabelaInput,
  ConflitoGrafo,
} from "../../../domain/ports/grafo-repository.port.js";
import { montarListaConflitos } from "../montar-conflitos.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../../domain/ports/skill-repository.port.js";
import type { AuditLogPort } from "../../../domain/ports/audit-log.port.js";
import type { AuditLogEntry, NewAuditLog } from "../../../domain/entities/audit-log.js";
import type {
  ConsultaAprendida,
  LacunaConsulta,
  Sinonimo,
} from "../../../domain/entities/aprendizado.js";
import type { AprendizadoRepositoryPort } from "../../../domain/ports/aprendizado-repository.port.js";
import type { ParametroSkill } from "../../../domain/entities/skill.js";

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
  escopoPadrao: parseEscopoPadrao(row.escopoPadrao),
  timezone: row.timezone,
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

  async updateDialeto(id: string, dialeto: string): Promise<void> {
    await this.db
      .update(schema.acesso)
      .set({ dialeto, updatedAt: new Date() })
      .where(eq(schema.acesso.id, id));
  }

  async updateEscopoPadrao(
    id: string,
    escopoPadrao: Acesso["escopoPadrao"],
    timezone: string | null,
  ): Promise<void> {
    await this.db
      .update(schema.acesso)
      .set({ escopoPadrao, timezone, updatedAt: new Date() })
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

const toColuna = (row: typeof schema.colunaGrafo.$inferSelect): ColunaGrafo => ({
  id: row.id,
  tabelaId: row.tabelaId,
  nome: row.nome,
  tipo: row.tipo,
  nullable: row.nullable ?? null,
  descricao: row.descricao,
  dicionario: row.dicionario,
  papel: (row.papel as PapelColuna | null) ?? null,
  formato: row.formato,
  perfil: row.perfil ?? null,
  sensibilidade: parseSensibilidadeColuna(row.sensibilidade),
  origem: row.origem as OrigemFato,
  status: row.status as StatusFato,
  autorUsuarioId: row.autorUsuarioId,
});

const toRelacionamento = (
  row: typeof schema.relacionamentoGrafo.$inferSelect,
  pares: readonly ParRelacionamento[] = [],
): RelacionamentoGrafo => {
  const resolved =
    pares.length > 0
      ? pares
      : [{ colunaOrigem: row.colunaOrigem, colunaDestino: row.colunaDestino }];
  return {
    id: row.id,
    agentId: row.agentId,
    tabelaOrigemId: row.tabelaOrigemId,
    colunaOrigem: row.colunaOrigem,
    tabelaDestinoId: row.tabelaDestinoId,
    colunaDestino: row.colunaDestino,
    pares: resolved,
    paresFingerprint: row.paresFingerprint,
    tipoJoin: row.tipoJoin,
    cardinalidade: (row.cardinalidade as Cardinalidade | null) ?? null,
    descricao: row.descricao,
    escopoValidacao: row.escopoValidacao ?? null,
    origem: row.origem as OrigemFato,
    status: row.status as StatusFato,
    autorUsuarioId: row.autorUsuarioId,
  };
};

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
          nullable: input.nullable ?? null,
          descricao: input.descricao ?? null,
          dicionario: input.dicionario ?? null,
          papel: input.papel ?? null,
          formato: input.formato ?? null,
          perfil: input.perfil ?? null,
          sensibilidade: parseSensibilidadeColuna(input.sensibilidade ?? "livre"),
          origem: input.origem,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        })
        .returning();
      return {
        coluna: toColuna(row!),
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
        formato: existing.formato,
      },
      {
        origem: input.origem,
        status: "vigente",
        descricao: input.descricao ?? null,
        dicionario: input.dicionario ?? null,
        tipo: input.tipo ?? null,
        formato: input.formato ?? null,
      },
    );
    if (!merge.aplicar) {
      return { coluna: existing, conflito: false };
    }
    const [row] = await this.conn()
      .update(schema.colunaGrafo)
      .set({
        tipo: merge.tipo ?? existing.tipo,
        nullable: input.nullable ?? existing.nullable,
        descricao: merge.descricao,
        dicionario: merge.dicionario ?? existing.dicionario,
        papel: input.papel ?? existing.papel,
        formato: merge.formato ?? existing.formato,
        perfil: input.perfil ?? existing.perfil,
        sensibilidade: sensibilidadeAposMerge({
          existenteOrigem: existing.origem,
          existenteSensibilidade: existing.sensibilidade,
          incomingOrigem: input.origem,
          incomingSensibilidade: input.sensibilidade,
        }),
        origem: merge.origem,
        status: merge.status,
        autorUsuarioId: input.autorUsuarioId,
        updatedAt: new Date(),
      })
      .where(eq(schema.colunaGrafo.id, existing.id))
      .returning();
    return {
      coluna: toColuna(row!),
      conflito: merge.conflito,
    };
  }

  async mergeRelacionamento(
    input: MergeRelacionamentoInput,
  ): Promise<{ relacionamento: RelacionamentoGrafo; conflito: boolean }> {
    const pares = paresDeInput(input);
    if (pares.length === 0) {
      throw new Error("relacionamento exige ao menos um par de colunas");
    }
    const fp = fingerprintPares(pares);
    const fpInv = fingerprintParesInvertidos(pares);
    const first = pares[0]!;
    const [existing] = await this.conn()
      .select()
      .from(schema.relacionamentoGrafo)
      .where(
        and(
          eq(schema.relacionamentoGrafo.agentId, input.agentId),
          or(
            and(
              eq(schema.relacionamentoGrafo.tabelaOrigemId, input.tabelaOrigemId),
              eq(schema.relacionamentoGrafo.tabelaDestinoId, input.tabelaDestinoId),
              eq(schema.relacionamentoGrafo.paresFingerprint, fp),
            ),
            and(
              eq(schema.relacionamentoGrafo.tabelaOrigemId, input.tabelaDestinoId),
              eq(schema.relacionamentoGrafo.tabelaDestinoId, input.tabelaOrigemId),
              eq(schema.relacionamentoGrafo.paresFingerprint, fpInv),
            ),
          ),
        ),
      )
      .limit(1);
    const writePares = async (relacionamentoId: string): Promise<void> => {
      await this.conn()
        .delete(schema.relacionamentoGrafoPar)
        .where(eq(schema.relacionamentoGrafoPar.relacionamentoId, relacionamentoId));
      await this.conn()
        .insert(schema.relacionamentoGrafoPar)
        .values(
          pares.map((par, ordem) => ({
            relacionamentoId,
            ordem,
            colunaOrigem: par.colunaOrigem,
            colunaDestino: par.colunaDestino,
          })),
        );
    };
    if (!existing) {
      const [row] = await this.conn()
        .insert(schema.relacionamentoGrafo)
        .values({
          agentId: input.agentId,
          tabelaOrigemId: input.tabelaOrigemId,
          colunaOrigem: first.colunaOrigem,
          tabelaDestinoId: input.tabelaDestinoId,
          colunaDestino: first.colunaDestino,
          paresFingerprint: fp,
          tipoJoin: input.tipoJoin,
          cardinalidade: input.cardinalidade ?? null,
          descricao: input.descricao ?? null,
          escopoValidacao: input.escopoValidacao ?? null,
          origem: input.origem,
          autorUsuarioId: input.autorUsuarioId,
        })
        .returning();
      await writePares(row!.id);
      return {
        relacionamento: toRelacionamento(row!, pares),
        conflito: false,
      };
    }
    const merge = decidirMerge(
      {
        origem: existing.origem as OrigemFato,
        status: existing.status as StatusFato,
        descricao: existing.descricao,
      },
      {
        origem: input.origem,
        status: "vigente",
        descricao: input.descricao ?? null,
      },
    );
    if (!merge.aplicar && input.cardinalidade == null && input.escopoValidacao == null) {
      return { relacionamento: toRelacionamento(existing, pares), conflito: false };
    }
    const [row] = await this.conn()
      .update(schema.relacionamentoGrafo)
      .set({
        tipoJoin: input.tipoJoin,
        cardinalidade: input.cardinalidade ?? existing.cardinalidade,
        descricao: merge.descricao,
        escopoValidacao: input.escopoValidacao ?? existing.escopoValidacao,
        origem: merge.origem,
        status: merge.status,
        autorUsuarioId: input.autorUsuarioId,
        updatedAt: new Date(),
      })
      .where(eq(schema.relacionamentoGrafo.id, existing.id))
      .returning();
    await writePares(existing.id);
    return {
      relacionamento: toRelacionamento(row!, pares),
      conflito: merge.conflito,
    };
  }

  async deleteRelacionamento(id: string): Promise<boolean> {
    const rows = await this.conn()
      .delete(schema.relacionamentoGrafo)
      .where(eq(schema.relacionamentoGrafo.id, id))
      .returning({ id: schema.relacionamentoGrafo.id });
    return rows.length > 0;
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
    return rows.map(toColuna);
  }

  async listRelacionamentos(agentId: string): Promise<readonly RelacionamentoGrafo[]> {
    const rows = await this.conn()
      .select()
      .from(schema.relacionamentoGrafo)
      .where(eq(schema.relacionamentoGrafo.agentId, agentId));
    if (rows.length === 0) {
      return [];
    }
    const paresRows = await this.conn()
      .select()
      .from(schema.relacionamentoGrafoPar)
      .where(
        inArray(
          schema.relacionamentoGrafoPar.relacionamentoId,
          rows.map((row) => row.id),
        ),
      );
    const byId = new Map<string, ParRelacionamento[]>();
    for (const par of [...paresRows].sort((a, b) => a.ordem - b.ordem)) {
      const list = byId.get(par.relacionamentoId) ?? [];
      list.push({ colunaOrigem: par.colunaOrigem, colunaDestino: par.colunaDestino });
      byId.set(par.relacionamentoId, list);
    }
    return rows.map((row) => toRelacionamento(row, byId.get(row.id) ?? []));
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

  async listConflitos(agentId: string): Promise<readonly ConflitoGrafo[]> {
    const tabelas = await this.listTabelas(agentId);
    const tabelaIds = tabelas.map((tabela) => tabela.id);
    const colunas =
      tabelaIds.length === 0
        ? []
        : await this.conn()
            .select()
            .from(schema.colunaGrafo)
            .where(inArray(schema.colunaGrafo.tabelaId, tabelaIds));
    const rels = await this.listRelacionamentos(agentId);
    return montarListaConflitos(tabelas, colunas.map(toColuna), rels);
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
    return toColuna(row);
  }

  async saveSchemaSnapshot(input: {
    agentId: string;
    tabelaNome: string;
    assinatura: string;
  }): Promise<{ drifted: boolean; anterior: string | null }> {
    const [existing] = await this.conn()
      .select()
      .from(schema.schemaSnapshot)
      .where(
        and(
          eq(schema.schemaSnapshot.agentId, input.agentId),
          eq(schema.schemaSnapshot.tabelaNome, input.tabelaNome),
        ),
      )
      .limit(1);
    const anterior = existing?.assinatura ?? null;
    const drifted = anterior !== null && anterior !== input.assinatura;
    if (!existing) {
      await this.conn().insert(schema.schemaSnapshot).values({
        agentId: input.agentId,
        tabelaNome: input.tabelaNome,
        assinatura: input.assinatura,
      });
    } else {
      await this.conn()
        .update(schema.schemaSnapshot)
        .set({ assinatura: input.assinatura, updatedAt: new Date() })
        .where(eq(schema.schemaSnapshot.id, existing.id));
    }
    return { drifted, anterior };
  }

  async listSchemaSnapshots(agentId: string): Promise<readonly SchemaSnapshotGrafo[]> {
    const rows = await this.conn()
      .select()
      .from(schema.schemaSnapshot)
      .where(eq(schema.schemaSnapshot.agentId, agentId));
    return rows.map((row) => ({
      agentId: row.agentId,
      tabelaNome: row.tabelaNome,
      assinatura: row.assinatura,
    }));
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
    const likes = terms.flatMap((term) => {
      const like = `%${term}%`;
      return [ilike(schema.tabelaGrafo.nome, like), ilike(schema.tabelaGrafo.descricao, like)];
    });
    const busca = condicaoFtsOuIlike({
      qualifiedTable: "tabela_grafo",
      query,
      ilike: likes,
    });
    if (!busca) {
      return [];
    }
    const rows = await this.conn()
      .select()
      .from(schema.tabelaGrafo)
      .where(and(eq(schema.tabelaGrafo.agentId, agentId), busca))
      .limit(Math.max(limite * 4, 32));
    return rankFetched(
      rows.map(toTabela),
      terms.length > 0 ? terms : tokenizeQuery(query),
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
        escopo: input.escopo ?? {
          tabelas: [],
          colunasPorTabela: {},
          relacionamentos: [],
          graoPorTabela: {},
          graoResultado: [],
          metricasSaida: [],
          pacoteVersao: 2,
        },
        pacoteVersao: input.pacoteVersao ?? input.escopo?.pacoteVersao ?? 2,
        motivoRevalidacao: input.motivoRevalidacao ?? null,
        consultaSemantica: input.consultaSemantica ?? null,
        politicaConsulta: input.politicaConsulta ?? null,
        autorUsuarioId: input.autorUsuarioId,
      })
      .returning();
    return this.toSkill(row!);
  }

  async update(
    id: string,
    patch: Partial<
      Pick<
        Skill,
        | "nome"
        | "descricao"
        | "sqlModelo"
        | "params"
        | "status"
        | "escopo"
        | "pacoteVersao"
        | "motivoRevalidacao"
        | "consultaSemantica"
        | "politicaConsulta"
        | "slug"
      >
    >,
  ): Promise<Skill> {
    const { params, escopo, ...rest } = patch;
    const [row] = await this.db
      .update(schema.skill)
      .set({
        ...rest,
        ...(params !== undefined ? { params: [...params] } : {}),
        ...(escopo !== undefined ? { escopo } : {}),
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

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.skill).where(eq(schema.skill.id, id)).returning();
    return rows.length > 0;
  }

  async buscar(
    agentId: string,
    query: string,
    limite: number,
    status?: StatusSkill | readonly StatusSkill[],
  ): Promise<readonly Skill[]> {
    const terms = tokenizeQuery(query);
    const likes = terms.flatMap((term) => {
      const like = `%${term}%`;
      return [
        ilike(schema.skill.nome, like),
        ilike(schema.skill.descricao, like),
        ilike(schema.skill.slug, like),
        sql`${schema.skill.params}::text ilike ${like}`,
      ];
    });
    const busca = condicaoFtsOuIlike({
      qualifiedTable: "skill",
      query,
      ilike: likes,
    });
    if (!busca) {
      return [];
    }
    const statusFilter =
      status === undefined
        ? undefined
        : typeof status === "string"
          ? eq(schema.skill.status, status)
          : inArray(schema.skill.status, [...status]);
    const rows = await this.db
      .select()
      .from(schema.skill)
      .where(and(eq(schema.skill.agentId, agentId), statusFilter, busca))
      .limit(Math.max(limite * 4, 32));
    const rankTerms = terms.length > 0 ? terms : [query.trim().toLowerCase()].filter(Boolean);
    return rankFetched(
      rows.map((row) => this.toSkill(row)),
      rankTerms,
      (row) =>
        `${row.nome} ${row.descricao} ${row.slug} ${row.params
          .map((param) => `${param.nome} ${param.descricao} ${param.tipo}`)
          .join(" ")} ${row.escopo.metricasSaida
          .map((item) => `${item.alias} ${item.definicao ?? ""} ${item.grao ?? ""}`)
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
      escopo: parseEscopoSkill(row.escopo),
      versao: row.versao,
      pacoteVersao: row.pacoteVersao,
      status: row.status as StatusSkill,
      motivoRevalidacao: row.motivoRevalidacao,
      consultaSemantica: parseConsultaSemantica(row.consultaSemantica),
      politicaConsulta: parsePoliticaConsulta(row.politicaConsulta),
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
    skillId?: string | null;
    tipo: string;
    titulo: string;
    texto: string;
    autorUsuarioId: string | null;
  }): Promise<AnotacaoGrafo> {
    const [row] = await this.db
      .insert(schema.anotacaoGrafo)
      .values({
        agentId: input.agentId,
        tabelaId: input.tabelaId,
        skillId: input.skillId ?? null,
        tipo: input.tipo,
        titulo: input.titulo,
        texto: input.texto,
        autorUsuarioId: input.autorUsuarioId,
      })
      .returning();
    return this.toAnotacao(row!);
  }

  async list(
    agentId: string,
    tabelaId?: string | null,
    skillId?: string | null,
  ): Promise<readonly AnotacaoGrafo[]> {
    const filters = [eq(schema.anotacaoGrafo.agentId, agentId)];
    if (tabelaId === null) {
      filters.push(isNull(schema.anotacaoGrafo.tabelaId));
    } else if (tabelaId !== undefined) {
      filters.push(eq(schema.anotacaoGrafo.tabelaId, tabelaId));
    }
    if (skillId === null) {
      filters.push(isNull(schema.anotacaoGrafo.skillId));
    } else if (skillId !== undefined) {
      filters.push(eq(schema.anotacaoGrafo.skillId, skillId));
    }
    const rows = await this.db
      .select()
      .from(schema.anotacaoGrafo)
      .where(and(...filters));
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
    const likes = terms.flatMap((term) => {
      const like = `%${term}%`;
      return [ilike(schema.anotacaoGrafo.titulo, like), ilike(schema.anotacaoGrafo.texto, like)];
    });
    const busca = condicaoFtsOuIlike({
      qualifiedTable: "anotacao_grafo",
      query,
      ilike: likes,
    });
    if (!busca) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(schema.anotacaoGrafo)
      .where(and(eq(schema.anotacaoGrafo.agentId, agentId), busca))
      .limit(Math.max(limite * 4, 32));
    return rankFetched(
      rows.map((row) => this.toAnotacao(row)),
      terms.length > 0 ? terms : tokenizeQuery(query),
      (row) => `${row.titulo} ${row.texto}`,
      limite,
    );
  }

  private toAnotacao(row: typeof schema.anotacaoGrafo.$inferSelect): AnotacaoGrafo {
    return {
      id: row.id,
      agentId: row.agentId,
      tabelaId: row.tabelaId,
      skillId: row.skillId,
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

  async listByUsuario(usuarioId: string, limite: number): Promise<readonly AuditLogEntry[]> {
    const rows = await this.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.usuarioId, usuarioId))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(limite);
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      usuarioId: row.usuarioId,
      acessoId: row.acessoId,
      tool: row.tool,
      sqlEnviado: row.sqlEnviado,
      sucesso: row.sucesso === 1,
      codigoErro: row.codigoErro,
      linhasRetornadas: row.linhasRetornadas,
      duracaoMs: row.duracaoMs,
    }));
  }
}

const toConsultaAprendida = (
  row: typeof schema.consultaAprendida.$inferSelect,
  skillIds: readonly string[] = [],
): ConsultaAprendida => ({
  id: row.id,
  agentId: row.agentId,
  skillIds,
  pergunta: row.pergunta,
  sql: row.sql,
  paramsContrato: parseParametroSkillList(row.paramsContrato),
  execucoes: row.execucoes,
  ultimaExecucao: row.ultimaExecucao,
  status: row.status,
  autorUsuarioId: row.autorUsuarioId,
});

export class DrizzleAprendizadoRepository implements AprendizadoRepositoryPort {
  constructor(private readonly db: Db) {}

  private async skillIdsOf(consultaIds: readonly string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (consultaIds.length === 0) {
      return out;
    }
    const rows = await this.db
      .select()
      .from(schema.consultaAprendidaSkill)
      .where(inArray(schema.consultaAprendidaSkill.consultaId, [...consultaIds]));
    for (const row of rows) {
      const list = out.get(row.consultaId) ?? [];
      list.push(row.skillId);
      out.set(row.consultaId, list);
    }
    return out;
  }

  private async hydrate(
    rows: readonly (typeof schema.consultaAprendida.$inferSelect)[],
  ): Promise<ConsultaAprendida[]> {
    const ids = await this.skillIdsOf(rows.map((row) => row.id));
    return rows.map((row) => toConsultaAprendida(row, ids.get(row.id) ?? []));
  }

  async salvarConsulta(input: {
    agentId: string;
    skillIds: readonly string[];
    pergunta: string;
    sql: string;
    paramsContrato: readonly ParametroSkill[];
    autorUsuarioId: string | null;
  }): Promise<ConsultaAprendida> {
    const [existing] = await this.db
      .select()
      .from(schema.consultaAprendida)
      .where(
        and(
          eq(schema.consultaAprendida.agentId, input.agentId),
          eq(schema.consultaAprendida.sql, input.sql),
        ),
      )
      .limit(1);
    if (existing) {
      const [row] = await this.db
        .update(schema.consultaAprendida)
        .set({
          execucoes: existing.execucoes + 1,
          ultimaExecucao: new Date(),
          pergunta:
            input.pergunta.trim().length > existing.pergunta.trim().length
              ? input.pergunta
              : existing.pergunta,
          updatedAt: new Date(),
        })
        .where(eq(schema.consultaAprendida.id, existing.id))
        .returning();
      if (input.skillIds.length > 0) {
        await this.db
          .insert(schema.consultaAprendidaSkill)
          .values(input.skillIds.map((skillId) => ({ consultaId: existing.id, skillId })))
          .onConflictDoNothing();
      }
      const [hydrated] = await this.hydrate([row!]);
      return hydrated!;
    }
    const [row] = await this.db
      .insert(schema.consultaAprendida)
      .values({
        agentId: input.agentId,
        pergunta: input.pergunta,
        sql: input.sql,
        paramsContrato: [...input.paramsContrato],
        autorUsuarioId: input.autorUsuarioId,
      })
      .returning();
    if (input.skillIds.length > 0) {
      await this.db
        .insert(schema.consultaAprendidaSkill)
        .values(input.skillIds.map((skillId) => ({ consultaId: row!.id, skillId })))
        .onConflictDoNothing();
    }
    const [hydrated] = await this.hydrate([row!]);
    return hydrated!;
  }

  async listarConsultas(agentId: string, limite: number): Promise<readonly ConsultaAprendida[]> {
    const rows = await this.db
      .select()
      .from(schema.consultaAprendida)
      .where(eq(schema.consultaAprendida.agentId, agentId))
      .orderBy(desc(schema.consultaAprendida.execucoes))
      .limit(limite);
    return this.hydrate(rows);
  }

  async listarConsultasDaSkill(
    agentId: string,
    skillId: string,
    limite: number,
  ): Promise<readonly ConsultaAprendida[]> {
    const links = await this.db
      .select({ consultaId: schema.consultaAprendidaSkill.consultaId })
      .from(schema.consultaAprendidaSkill)
      .where(eq(schema.consultaAprendidaSkill.skillId, skillId));
    const ids = links.map((link) => link.consultaId);
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(schema.consultaAprendida)
      .where(
        and(
          eq(schema.consultaAprendida.agentId, agentId),
          inArray(schema.consultaAprendida.id, ids),
        ),
      )
      .orderBy(desc(schema.consultaAprendida.execucoes))
      .limit(limite);
    return this.hydrate(rows);
  }

  async buscarConsultas(
    agentId: string,
    query: string,
    limite: number,
  ): Promise<readonly ConsultaAprendida[]> {
    const terms = tokenizeQuery(query);
    const likes = terms.map((term) => ilike(schema.consultaAprendida.pergunta, `%${term}%`));
    const busca = condicaoFtsOuIlike({
      qualifiedTable: "consulta_aprendida",
      query,
      ilike: likes,
    });
    if (!busca) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(schema.consultaAprendida)
      .where(and(eq(schema.consultaAprendida.agentId, agentId), busca))
      .limit(Math.max(limite * 4, 32));
    return rankFetched(
      await this.hydrate(rows),
      terms.length > 0 ? terms : tokenizeQuery(query),
      (row) => row.pergunta,
      limite,
    );
  }

  async registrarSinonimo(input: {
    agentId: string;
    termo: string;
    alvoTipo: string;
    alvoId: string;
  }): Promise<Sinonimo> {
    const [row] = await this.db.insert(schema.sinonimo).values(input).returning();
    return {
      id: row!.id,
      agentId: row!.agentId,
      termo: row!.termo,
      alvoTipo: row!.alvoTipo,
      alvoId: row!.alvoId,
    };
  }

  async listarSinonimos(agentId: string): Promise<readonly Sinonimo[]> {
    const rows = await this.db
      .select()
      .from(schema.sinonimo)
      .where(eq(schema.sinonimo.agentId, agentId));
    return rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      termo: row.termo,
      alvoTipo: row.alvoTipo,
      alvoId: row.alvoId,
    }));
  }

  async desvincularSkill(
    agentId: string,
    skillId: string,
  ): Promise<{ consultas: number; sinonimos: number }> {
    const consultas = await this.db
      .delete(schema.consultaAprendidaSkill)
      .where(eq(schema.consultaAprendidaSkill.skillId, skillId))
      .returning();
    const sinonimos = await this.db
      .delete(schema.sinonimo)
      .where(
        and(
          eq(schema.sinonimo.agentId, agentId),
          eq(schema.sinonimo.alvoTipo, "skill"),
          eq(schema.sinonimo.alvoId, skillId),
        ),
      )
      .returning();
    return { consultas: consultas.length, sinonimos: sinonimos.length };
  }

  async registrarLacuna(
    agentId: string,
    pergunta: string,
    tipo: "skill_gap" | "ferramenta" = "skill_gap",
    contrato: Record<string, unknown> | null = null,
  ): Promise<LacunaConsulta> {
    const [row] = await this.db
      .insert(schema.lacunaConsulta)
      .values({ agentId, pergunta, tipo, contrato })
      .returning();
    return {
      id: row!.id,
      agentId: row!.agentId,
      pergunta: row!.pergunta,
      tipo: row!.tipo === "ferramenta" ? "ferramenta" : "skill_gap",
      contrato: row!.contrato ?? null,
      createdAt: row!.createdAt,
    };
  }

  async listarLacunas(agentId: string, limite: number): Promise<readonly LacunaConsulta[]> {
    const rows = await this.db
      .select()
      .from(schema.lacunaConsulta)
      .where(eq(schema.lacunaConsulta.agentId, agentId))
      .orderBy(desc(schema.lacunaConsulta.createdAt))
      .limit(limite);
    return rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      pergunta: row.pergunta,
      tipo: row.tipo === "ferramenta" ? "ferramenta" : "skill_gap",
      contrato: row.contrato ?? null,
      createdAt: row.createdAt,
    }));
  }
}
