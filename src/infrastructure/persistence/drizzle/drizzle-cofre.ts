import { createHash } from "node:crypto";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import { identidadeConsulta } from "../../../domain/entities/consulta-fingerprint.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { rankByTermsHits, tokenizeQuery } from "../busca-termos.js";
import type { Db } from "./db.js";
import {
  condicaoFtsOuIlike,
  existeIlikeJsonbArray,
  exprTsRank,
  janelaBuscaFts,
  ordemPorTsRank,
  toRankFts,
} from "./fts-busca.js";
import type { HitBusca } from "../../../domain/entities/hit-busca.js";
import * as schema from "../schema.js";
import type { Acesso, NovoAcesso, StatusAcesso } from "../../../domain/entities/acesso.js";
import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type { NovoUsuarioMcp, UsuarioMcp } from "../../../domain/entities/usuario-mcp.js";
import type {
  AnotacaoGrafo,
  GovernancaConhecimento,
  NovaSkill,
  Skill,
  StatusConhecimento,
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
import { decidirMerge, mergeCamposColuna } from "../../../domain/entities/merge-fato.js";
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
import type { McpSetupRepositoryPort } from "../../../domain/ports/mcp-setup-repository.port.js";
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
  StatusLacuna,
  TipoLacuna,
} from "../../../domain/entities/aprendizado.js";
import { chavePerguntaLacuna } from "../../../domain/entities/aprendizado.js";
import type { AprendizadoRepositoryPort } from "../../../domain/ports/aprendizado-repository.port.js";
import { asAcessoId } from "../as-acesso-id.js";
import { skillDoSnapshot } from "../skill-publicada.js";

const toUsuario = (row: typeof schema.usuarioMcp.$inferSelect): UsuarioMcp => ({
  id: row.id,
  emailEnc: row.emailEnc,
  emailHash: row.emailHash,
  senhaEnc: row.senhaEnc,
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
  tokenHash: row.tokenHash,
  tokenExpiresAt: row.tokenExpiresAt ?? null,
  statusAcesso: row.statusAcesso as StatusAcesso,
  escopoPadrao: parseEscopoPadrao(row.escopoPadrao),
  timezone: row.timezone,
  nomePersona: row.nomePersona ?? null,
  instrucoesPersona: row.instrucoesPersona ?? null,
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

  async findByEmailHash(emailHash: string): Promise<UsuarioMcp | null> {
    const [row] = await this.db
      .select()
      .from(schema.usuarioMcp)
      .where(eq(schema.usuarioMcp.emailHash, emailHash))
      .limit(1);
    return row ? toUsuario(row) : null;
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
    const [row] = await this.db
      .insert(schema.acesso)
      .values({
        ...input,
        nomePersona: input.nomePersona ?? null,
        instrucoesPersona: input.instrucoesPersona ?? null,
      })
      .returning();
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

  async findByTokenHash(tokenHash: string): Promise<Acesso | null> {
    const [row] = await this.db
      .select()
      .from(schema.acesso)
      .where(eq(schema.acesso.tokenHash, tokenHash))
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

  async listAll(): Promise<readonly Acesso[]> {
    const rows = await this.db.select().from(schema.acesso);
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

  async updateTokenHash(
    id: string,
    tokenHash: string,
    tokenExpiresAt?: Date | null,
  ): Promise<void> {
    await this.db
      .update(schema.acesso)
      .set({
        tokenHash,
        ...(tokenExpiresAt !== undefined ? { tokenExpiresAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.acesso.id, id));
  }

  async updateStatus(id: string, status: StatusAcesso): Promise<void> {
    await this.db
      .update(schema.acesso)
      .set({ statusAcesso: status, updatedAt: new Date() })
      .where(eq(schema.acesso.id, id));
  }

  async compareAndRotateToken(
    id: string,
    expectedHash: string,
    tokenHash: string,
    tokenExpiresAt: Date | null,
  ): Promise<boolean> {
    const rows = await this.db
      .update(schema.acesso)
      .set({ tokenHash, tokenExpiresAt, updatedAt: new Date() })
      .where(and(eq(schema.acesso.id, id), eq(schema.acesso.tokenHash, expectedHash)))
      .returning({ id: schema.acesso.id });
    return rows.length === 1;
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

  async updatePersona(
    id: string,
    nomePersona: string | null,
    instrucoesPersona: string | null,
  ): Promise<void> {
    await this.db
      .update(schema.acesso)
      .set({ nomePersona, instrucoesPersona, updatedAt: new Date() })
      .where(eq(schema.acesso.id, id));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(schema.acesso).where(eq(schema.acesso.id, id));
  }
}

export class DrizzleMcpSetupRepository implements McpSetupRepositoryPort {
  constructor(private readonly db: Db) {}

  async issue(input: {
    code: string;
    token: string;
    expiresAt: Date;
    acessoId: string | null;
  }): Promise<void> {
    await this.purgeExpired();
    await this.db.insert(schema.mcpSetup).values({
      code: input.code,
      token: input.token,
      expiresAt: input.expiresAt,
      acessoId: input.acessoId,
    });
  }

  async consume(code: string): Promise<string | null> {
    const deleted = await this.db
      .delete(schema.mcpSetup)
      .where(eq(schema.mcpSetup.code, code))
      .returning();
    const row = deleted[0];
    if (!row) {
      return null;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return row.token;
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const deleted = await this.db
      .delete(schema.mcpSetup)
      .where(lte(schema.mcpSetup.expiresAt, now))
      .returning({ code: schema.mcpSetup.code });
    return deleted.length;
  }
}

const toTabela = (row: typeof schema.tabelaGrafo.$inferSelect): TabelaGrafo => ({
  id: row.id,
  acessoId: asAcessoId(row.acessoId),
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

const colunaNaoPersistida = (input: MergeColunaInput): ColunaGrafo => ({
  id: input.tabelaId,
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
    acessoId: asAcessoId(row.acessoId),
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

  async withAcessoLock<T>(acessoId: string, fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.insert(schema.grafoLock).values({ acessoId }).onConflictDoNothing();
      await tx.execute(
        sql`select acesso_id from grafo_lock where acesso_id = ${acessoId}::uuid for update`,
      );
      return grafoTx.run(tx, fn);
    });
  }

  async getDialeto(acessoId: string): Promise<GrafoDialeto | null> {
    const [row] = await this.conn()
      .select()
      .from(schema.grafoDialeto)
      .where(eq(schema.grafoDialeto.acessoId, acessoId))
      .limit(1);
    return row ? { acessoId: asAcessoId(row.acessoId), dialeto: row.dialeto } : null;
  }

  async setDialeto(acessoId: string, dialeto: string): Promise<void> {
    await this.conn()
      .insert(schema.grafoDialeto)
      .values({ acessoId, dialeto })
      .onConflictDoUpdate({ target: schema.grafoDialeto.acessoId, set: { dialeto } });
  }

  async deleteByAcesso(acessoId: string): Promise<void> {
    await this.conn()
      .delete(schema.relacionamentoGrafo)
      .where(eq(schema.relacionamentoGrafo.acessoId, acessoId));
    await this.conn().delete(schema.tabelaGrafo).where(eq(schema.tabelaGrafo.acessoId, acessoId));
    await this.conn()
      .delete(schema.schemaSnapshot)
      .where(eq(schema.schemaSnapshot.acessoId, acessoId));
    await this.conn().delete(schema.grafoDialeto).where(eq(schema.grafoDialeto.acessoId, acessoId));
    await this.conn().delete(schema.grafoLock).where(eq(schema.grafoLock.acessoId, acessoId));
  }

  private async tabelaDoAcesso(acessoId: string, tabelaId: string): Promise<TabelaGrafo | null> {
    const [row] = await this.conn()
      .select()
      .from(schema.tabelaGrafo)
      .where(and(eq(schema.tabelaGrafo.id, tabelaId), eq(schema.tabelaGrafo.acessoId, acessoId)))
      .limit(1);
    return row ? toTabela(row) : null;
  }

  async mergeTabela(input: MergeTabelaInput): Promise<{ tabela: TabelaGrafo; conflito: boolean }> {
    const existing = await this.findTabelaByNome(input.acessoId, input.nome);
    if (!existing) {
      const [row] = await this.conn()
        .insert(schema.tabelaGrafo)
        .values({
          acessoId: input.acessoId,
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
    if (!(await this.tabelaDoAcesso(input.acessoId, input.tabelaId))) {
      return { coluna: colunaNaoPersistida(input), conflito: false };
    }
    const existing = await this.findColuna(input.acessoId, input.tabelaId, input.nome);
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
    const merged = mergeCamposColuna(existing, input);
    if (!merged) {
      return { coluna: existing, conflito: false };
    }
    const [row] = await this.conn()
      .update(schema.colunaGrafo)
      .set({
        tipo: merged.campos.tipo,
        nullable: merged.campos.nullable,
        descricao: merged.campos.descricao,
        dicionario: merged.campos.dicionario,
        papel: merged.campos.papel,
        formato: merged.campos.formato,
        perfil: merged.campos.perfil,
        sensibilidade: merged.campos.sensibilidade,
        origem: merged.campos.origem,
        status: merged.campos.status,
        autorUsuarioId: input.autorUsuarioId,
        updatedAt: new Date(),
      })
      .where(eq(schema.colunaGrafo.id, existing.id))
      .returning();
    return {
      coluna: toColuna(row!),
      conflito: merged.conflito,
    };
  }

  async mergeRelacionamento(
    input: MergeRelacionamentoInput,
  ): Promise<{ relacionamento: RelacionamentoGrafo; conflito: boolean }> {
    const pares = paresDeInput(input);
    if (pares.length === 0) {
      throw new Error("relacionamento exige ao menos um par de colunas");
    }
    const origemOk = await this.tabelaDoAcesso(input.acessoId, input.tabelaOrigemId);
    const destinoOk = await this.tabelaDoAcesso(input.acessoId, input.tabelaDestinoId);
    if (!origemOk || !destinoOk) {
      const first = pares[0]!;
      return {
        relacionamento: toRelacionamento(
          {
            id: input.tabelaOrigemId,
            acessoId: input.acessoId,
            tabelaOrigemId: input.tabelaOrigemId,
            colunaOrigem: first.colunaOrigem,
            tabelaDestinoId: input.tabelaDestinoId,
            colunaDestino: first.colunaDestino,
            paresFingerprint: fingerprintPares(pares),
            tipoJoin: input.tipoJoin,
            cardinalidade: input.cardinalidade ?? null,
            descricao: input.descricao ?? null,
            escopoValidacao: input.escopoValidacao ?? null,
            origem: input.origem,
            status: "vigente",
            autorUsuarioId: input.autorUsuarioId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          pares,
        ),
        conflito: false,
      };
    }
    const fp = fingerprintPares(pares);
    const fpInv = fingerprintParesInvertidos(pares);
    const first = pares[0]!;
    const [existing] = await this.conn()
      .select()
      .from(schema.relacionamentoGrafo)
      .where(
        and(
          eq(schema.relacionamentoGrafo.acessoId, input.acessoId),
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
          acessoId: input.acessoId,
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
        tipoJoin: existing.tipoJoin,
      },
      {
        origem: input.origem,
        status: "vigente",
        descricao: input.descricao ?? null,
        tipoJoin: input.tipoJoin,
      },
    );
    if (!merge.aplicar && input.cardinalidade == null && input.escopoValidacao == null) {
      return { relacionamento: toRelacionamento(existing, pares), conflito: false };
    }
    const [row] = await this.conn()
      .update(schema.relacionamentoGrafo)
      .set({
        tipoJoin: merge.tipoJoin ?? existing.tipoJoin,
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

  async deleteRelacionamento(acessoId: string, id: string): Promise<boolean> {
    const rows = await this.conn()
      .delete(schema.relacionamentoGrafo)
      .where(
        and(
          eq(schema.relacionamentoGrafo.id, id),
          eq(schema.relacionamentoGrafo.acessoId, acessoId),
        ),
      )
      .returning({ id: schema.relacionamentoGrafo.id });
    return rows.length > 0;
  }

  async listTabelas(acessoId: string): Promise<readonly TabelaGrafo[]> {
    const rows = await this.conn()
      .select()
      .from(schema.tabelaGrafo)
      .where(eq(schema.tabelaGrafo.acessoId, acessoId));
    return rows.map(toTabela);
  }

  async listColunas(acessoId: string, tabelaId: string): Promise<readonly ColunaGrafo[]> {
    const rows = await this.conn()
      .select({ coluna: schema.colunaGrafo })
      .from(schema.colunaGrafo)
      .innerJoin(schema.tabelaGrafo, eq(schema.colunaGrafo.tabelaId, schema.tabelaGrafo.id))
      .where(
        and(eq(schema.colunaGrafo.tabelaId, tabelaId), eq(schema.tabelaGrafo.acessoId, acessoId)),
      );
    return rows.map((row) => toColuna(row.coluna));
  }

  async listRelacionamentos(acessoId: string): Promise<readonly RelacionamentoGrafo[]> {
    const rows = await this.conn()
      .select()
      .from(schema.relacionamentoGrafo)
      .where(eq(schema.relacionamentoGrafo.acessoId, acessoId));
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

  async countConflitos(acessoId: string): Promise<number> {
    const conn = this.conn();
    const [tabelas] = await conn
      .select({ n: count() })
      .from(schema.tabelaGrafo)
      .where(
        and(eq(schema.tabelaGrafo.acessoId, acessoId), eq(schema.tabelaGrafo.status, "conflito")),
      );
    const [colunas] = await conn
      .select({ n: count() })
      .from(schema.colunaGrafo)
      .innerJoin(schema.tabelaGrafo, eq(schema.colunaGrafo.tabelaId, schema.tabelaGrafo.id))
      .where(
        and(eq(schema.tabelaGrafo.acessoId, acessoId), eq(schema.colunaGrafo.status, "conflito")),
      );
    const [rels] = await conn
      .select({ n: count() })
      .from(schema.relacionamentoGrafo)
      .where(
        and(
          eq(schema.relacionamentoGrafo.acessoId, acessoId),
          eq(schema.relacionamentoGrafo.status, "conflito"),
        ),
      );
    return (tabelas?.n ?? 0) + (colunas?.n ?? 0) + (rels?.n ?? 0);
  }

  async listConflitos(acessoId: string): Promise<readonly ConflitoGrafo[]> {
    const tabelas = await this.listTabelas(acessoId);
    const tabelaIds = tabelas.map((tabela) => tabela.id);
    const colunas =
      tabelaIds.length === 0
        ? []
        : await this.conn()
            .select()
            .from(schema.colunaGrafo)
            .where(inArray(schema.colunaGrafo.tabelaId, tabelaIds));
    const rels = await this.listRelacionamentos(acessoId);
    return montarListaConflitos(tabelas, colunas.map(toColuna), rels);
  }

  async findTabelaByNome(acessoId: string, nome: string): Promise<TabelaGrafo | null> {
    const rows = await this.conn()
      .select()
      .from(schema.tabelaGrafo)
      .where(eq(schema.tabelaGrafo.acessoId, acessoId));
    const row = rows.find((item) => item.nome.toLowerCase() === nome.toLowerCase());
    return row ? toTabela(row) : null;
  }

  async findColuna(acessoId: string, tabelaId: string, nome: string): Promise<ColunaGrafo | null> {
    const rows = await this.conn()
      .select({ coluna: schema.colunaGrafo })
      .from(schema.colunaGrafo)
      .innerJoin(schema.tabelaGrafo, eq(schema.colunaGrafo.tabelaId, schema.tabelaGrafo.id))
      .where(
        and(eq(schema.colunaGrafo.tabelaId, tabelaId), eq(schema.tabelaGrafo.acessoId, acessoId)),
      );
    const row = rows.find((item) => item.coluna.nome.toLowerCase() === nome.toLowerCase());
    if (!row) {
      return null;
    }
    return toColuna(row.coluna);
  }

  async saveSchemaSnapshot(input: {
    acessoId: string;
    tabelaNome: string;
    assinatura: string;
  }): Promise<{ drifted: boolean; anterior: string | null }> {
    const [existing] = await this.conn()
      .select()
      .from(schema.schemaSnapshot)
      .where(
        and(
          eq(schema.schemaSnapshot.acessoId, input.acessoId),
          eq(schema.schemaSnapshot.tabelaNome, input.tabelaNome),
        ),
      )
      .limit(1);
    const anterior = existing?.assinatura ?? null;
    const drifted = anterior !== null && anterior !== input.assinatura;
    if (!existing) {
      await this.conn().insert(schema.schemaSnapshot).values({
        acessoId: input.acessoId,
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

  async listSchemaSnapshots(acessoId: string): Promise<readonly SchemaSnapshotGrafo[]> {
    const rows = await this.conn()
      .select()
      .from(schema.schemaSnapshot)
      .where(eq(schema.schemaSnapshot.acessoId, acessoId));
    return rows.map((row) => ({
      acessoId: asAcessoId(row.acessoId),
      tabelaNome: row.tabelaNome,
      assinatura: row.assinatura,
    }));
  }

  async resolverConflito(input: {
    acessoId: string;
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
        .where(
          and(
            eq(schema.tabelaGrafo.id, input.tabelaId),
            eq(schema.tabelaGrafo.acessoId, input.acessoId),
          ),
        );
    }
    if (input.colunaId) {
      const tabelas = await this.conn()
        .select({ id: schema.tabelaGrafo.id })
        .from(schema.tabelaGrafo)
        .where(eq(schema.tabelaGrafo.acessoId, input.acessoId));
      const tabelaIds = tabelas.map((item) => item.id);
      if (tabelaIds.length === 0) {
        return;
      }
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
        .where(
          and(
            eq(schema.colunaGrafo.id, input.colunaId),
            inArray(schema.colunaGrafo.tabelaId, tabelaIds),
          ),
        );
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
        .where(
          and(
            eq(schema.relacionamentoGrafo.id, input.relacionamentoId),
            eq(schema.relacionamentoGrafo.acessoId, input.acessoId),
          ),
        );
    }
  }

  async buscar(
    acessoId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<TabelaGrafo>[]> {
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
      .select({
        item: schema.tabelaGrafo,
        rank: exprTsRank("tabela_grafo", query),
      })
      .from(schema.tabelaGrafo)
      .where(and(eq(schema.tabelaGrafo.acessoId, acessoId), busca))
      .orderBy(ordemPorTsRank("tabela_grafo", query))
      .limit(janelaBuscaFts(limite));
    return rows
      .map((row) => ({ item: toTabela(row.item), rank: toRankFts(row.rank) }))
      .slice(0, limite);
  }
}

export class DrizzleSkillRepository implements SkillRepositoryPort {
  constructor(private readonly db: Db) {}

  async findPublicadaById(id: string): Promise<Skill | null> {
    const [row] = await this.db
      .select({ draft: schema.skill, publication: schema.skillPublicacao })
      .from(schema.skill)
      .innerJoin(
        schema.skillPublicacao,
        and(
          eq(schema.skill.publicacaoAtivaId, schema.skillPublicacao.id),
          eq(schema.skill.id, schema.skillPublicacao.skillId),
          eq(schema.skill.acessoId, schema.skillPublicacao.acessoId),
        ),
      )
      .where(eq(schema.skill.id, id))
      .limit(1);
    return row ? skillDoSnapshot(this.toSkill(row.draft), row.publication) : null;
  }
  async listPublicadas(acessoId: string): Promise<readonly Skill[]> {
    const rows = await this.db
      .select({ draft: schema.skill, publication: schema.skillPublicacao })
      .from(schema.skill)
      .innerJoin(
        schema.skillPublicacao,
        and(
          eq(schema.skill.publicacaoAtivaId, schema.skillPublicacao.id),
          eq(schema.skill.id, schema.skillPublicacao.skillId),
          eq(schema.skill.acessoId, schema.skillPublicacao.acessoId),
        ),
      )
      .where(eq(schema.skill.acessoId, acessoId));
    return rows.map((row) => skillDoSnapshot(this.toSkill(row.draft), row.publication));
  }
  async suspenderPublicacao(id: string): Promise<void> {
    await this.db
      .update(schema.skill)
      .set({ publicacaoAtivaId: null, updatedAt: new Date() })
      .where(eq(schema.skill.id, id));
  }

  async buscarPublicadas(
    acessoId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<Skill>[]> {
    return rankByTermsHits(
      await this.listPublicadas(acessoId),
      tokenizeQuery(query),
      (item) =>
        [
          item.nome,
          item.slug,
          item.descricao,
          ...item.params.map((param) => param.descricao),
          ...item.escopo.metricasSaida.map((metric) => metric.definicao ?? metric.alias),
        ].join(" "),
      limite,
    );
  }

  async create(input: NovaSkill): Promise<Skill> {
    const [row] = await this.db
      .insert(schema.skill)
      .values({
        acessoId: input.acessoId,
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
        ...(patch.status === "rascunho_revalidacao" ? { publicacaoAtivaId: null } : {}),
        ...(patch.status === undefined || patch.status === "publicada"
          ? {
              status: sql`CASE WHEN ${schema.skill.status} = 'publicada' THEN 'rascunho' ELSE ${schema.skill.status} END`,
            }
          : {}),
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
        ...(status === "rascunho_revalidacao" ? { publicacaoAtivaId: null } : {}),
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

  async findBySlug(acessoId: string, slug: string): Promise<Skill | null> {
    const [row] = await this.db
      .select()
      .from(schema.skill)
      .where(and(eq(schema.skill.acessoId, acessoId), eq(schema.skill.slug, slug)))
      .limit(1);
    return row ? this.toSkill(row) : null;
  }

  async listByAcesso(acessoId: string): Promise<readonly Skill[]> {
    const rows = await this.db
      .select()
      .from(schema.skill)
      .where(eq(schema.skill.acessoId, acessoId));
    return rows.map((row) => this.toSkill(row));
  }

  async deleteByAcesso(acessoId: string): Promise<void> {
    await this.db.delete(schema.skill).where(eq(schema.skill.acessoId, acessoId));
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.skill).where(eq(schema.skill.id, id)).returning();
    return rows.length > 0;
  }

  async buscar(
    acessoId: string,
    query: string,
    limite: number,
    status?: StatusSkill | readonly StatusSkill[],
  ): Promise<readonly HitBusca<Skill>[]> {
    const terms = tokenizeQuery(query);
    const likes = terms.flatMap((term) => {
      const like = `%${term}%`;
      return [
        ilike(schema.skill.nome, like),
        ilike(schema.skill.descricao, like),
        ilike(schema.skill.slug, like),
        existeIlikeJsonbArray(
          sql`coalesce(${schema.skill.params}, '[]'::jsonb)`,
          ["nome", "descricao"],
          like,
        ),
        existeIlikeJsonbArray(
          sql`coalesce(${schema.skill.escopo}->'metricasSaida', '[]'::jsonb)`,
          ["alias", "definicao", "grao"],
          like,
        ),
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
      .select({
        item: schema.skill,
        rank: exprTsRank("skill", query),
      })
      .from(schema.skill)
      .where(and(eq(schema.skill.acessoId, acessoId), statusFilter, busca))
      .orderBy(ordemPorTsRank("skill", query))
      .limit(janelaBuscaFts(limite));
    return rows
      .map((row) => ({ item: this.toSkill(row.item), rank: toRankFts(row.rank) }))
      .slice(0, limite);
  }

  private toSkill(row: typeof schema.skill.$inferSelect): Skill {
    return {
      publicacaoAtivaId: row.publicacaoAtivaId,
      id: row.id,
      acessoId: asAcessoId(row.acessoId),
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
    acessoId: string;
    tabelaId: string | null;
    skillId?: string | null;
    tipo: string;
    titulo: string;
    texto: string;
    autorUsuarioId: string | null;
    governanca?: GovernancaConhecimento;
  }): Promise<AnotacaoGrafo> {
    const [row] = await this.db
      .insert(schema.anotacaoGrafo)
      .values({
        acessoId: input.acessoId,
        tabelaId: input.tabelaId,
        skillId: input.skillId ?? null,
        tipo: input.tipo,
        titulo: input.titulo,
        texto: input.texto,
        fonteTipo: input.governanca?.fonteTipo ?? "usuario",
        fonteReferencia: input.governanca?.fonteReferencia ?? null,
        responsavel: input.governanca?.responsavel ?? null,
        validadoEm: input.governanca?.validadoEm ?? null,
        vigenteDe: input.governanca?.vigenteDe ?? null,
        vigenteAte: input.governanca?.vigenteAte ?? null,
        revisarEm: input.governanca?.revisarEm ?? null,
        periodoRevisaoDias: input.governanca?.periodoRevisaoDias ?? null,
        status: input.governanca?.status ?? "vigente",
        autorUsuarioId: input.autorUsuarioId,
      })
      .returning();
    return this.toAnotacao(row!);
  }

  async update(
    id: string,
    patch: Partial<Pick<AnotacaoGrafo, "tipo" | "titulo" | "texto"> & GovernancaConhecimento>,
  ): Promise<AnotacaoGrafo> {
    const [row] = await this.db
      .update(schema.anotacaoGrafo)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.anotacaoGrafo.id, id))
      .returning();
    return this.toAnotacao(row!);
  }

  async list(
    acessoId: string,
    tabelaId?: string | null,
    skillId?: string | null,
    options?: { status?: StatusConhecimento; ativasEm?: Date },
  ): Promise<readonly AnotacaoGrafo[]> {
    const filters = [eq(schema.anotacaoGrafo.acessoId, acessoId)];
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
    if (options?.status) {
      filters.push(eq(schema.anotacaoGrafo.status, options.status));
    }
    if (options?.ativasEm) {
      const dia = options.ativasEm.toISOString().slice(0, 10);
      filters.push(
        or(isNull(schema.anotacaoGrafo.vigenteDe), lte(schema.anotacaoGrafo.vigenteDe, dia))!,
        or(isNull(schema.anotacaoGrafo.vigenteAte), gte(schema.anotacaoGrafo.vigenteAte, dia))!,
        eq(schema.anotacaoGrafo.status, "vigente"),
      );
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

  async deleteByAcesso(acessoId: string): Promise<void> {
    await this.db.delete(schema.anotacaoGrafo).where(eq(schema.anotacaoGrafo.acessoId, acessoId));
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(schema.anotacaoGrafo)
      .where(eq(schema.anotacaoGrafo.id, id))
      .returning();
    return rows.length > 0;
  }

  async buscar(
    acessoId: string,
    query: string,
    limite: number,
    options?: { ativasEm?: Date },
  ): Promise<readonly HitBusca<AnotacaoGrafo>[]> {
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
    const filters = [eq(schema.anotacaoGrafo.acessoId, acessoId), busca];
    if (options?.ativasEm) {
      const dia = options.ativasEm.toISOString().slice(0, 10);
      filters.push(
        eq(schema.anotacaoGrafo.status, "vigente"),
        or(isNull(schema.anotacaoGrafo.vigenteDe), lte(schema.anotacaoGrafo.vigenteDe, dia))!,
        or(isNull(schema.anotacaoGrafo.vigenteAte), gte(schema.anotacaoGrafo.vigenteAte, dia))!,
      );
    }
    const rows = await this.db
      .select({
        item: schema.anotacaoGrafo,
        rank: exprTsRank("anotacao_grafo", query),
      })
      .from(schema.anotacaoGrafo)
      .where(and(...filters))
      .orderBy(ordemPorTsRank("anotacao_grafo", query))
      .limit(janelaBuscaFts(limite));
    return rows
      .map((row) => ({ item: this.toAnotacao(row.item), rank: toRankFts(row.rank) }))
      .slice(0, limite);
  }

  private toAnotacao(row: typeof schema.anotacaoGrafo.$inferSelect): AnotacaoGrafo {
    return {
      id: row.id,
      acessoId: asAcessoId(row.acessoId),
      tabelaId: row.tabelaId,
      skillId: row.skillId,
      tipo: row.tipo,
      titulo: row.titulo,
      texto: row.texto,
      fonteTipo: row.fonteTipo as AnotacaoGrafo["fonteTipo"],
      fonteReferencia: row.fonteReferencia,
      responsavel: row.responsavel,
      validadoEm: row.validadoEm,
      vigenteDe: row.vigenteDe,
      vigenteAte: row.vigenteAte,
      revisarEm: row.revisarEm,
      periodoRevisaoDias: row.periodoRevisaoDias,
      status: row.status as AnotacaoGrafo["status"],
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
        metadata: entry.metadata ?? null,
      })
      .returning();
    return {
      id: row!.id,
      createdAt: row!.createdAt,
      usuarioId: row!.usuarioId,
      acessoId: asAcessoId(row!.acessoId),
      tool: row!.tool,
      sqlEnviado: row!.sqlEnviado,
      sucesso: row!.sucesso === 1,
      codigoErro: row!.codigoErro,
      linhasRetornadas: row!.linhasRetornadas,
      duracaoMs: row!.duracaoMs,
      metadata: row!.metadata,
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
      acessoId: asAcessoId(row.acessoId),
      tool: row.tool,
      sqlEnviado: row.sqlEnviado,
      sucesso: row.sucesso === 1,
      codigoErro: row.codigoErro,
      linhasRetornadas: row.linhasRetornadas,
      duracaoMs: row.duracaoMs,
      metadata: row.metadata,
    }));
  }

  async listByAcesso(acessoId: string, limite: number): Promise<readonly AuditLogEntry[]> {
    const rows = await this.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.acessoId, acessoId))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(limite);
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      usuarioId: row.usuarioId,
      acessoId: asAcessoId(row.acessoId),
      tool: row.tool,
      sqlEnviado: row.sqlEnviado,
      sucesso: row.sucesso === 1,
      codigoErro: row.codigoErro,
      linhasRetornadas: row.linhasRetornadas,
      duracaoMs: row.duracaoMs,
      metadata: row.metadata,
    }));
  }
}

const toConsultaAprendida = (
  row: typeof schema.consultaAprendida.$inferSelect,
  skillIds: readonly string[] = [],
): ConsultaAprendida => ({
  id: row.id,
  acessoId: asAcessoId(row.acessoId),
  skillIds,
  pergunta: row.pergunta,
  sql: row.sql,
  paramsContrato: parseParametroSkillList(row.paramsContrato),
  execucoes: row.execucoes,
  ultimaExecucao: row.ultimaExecucao,
  versao: row.versao,
  motivoInativacao: row.motivoInativacao,
  status: row.status,
  publicacoes: row.publicacoes,
  confirmadaEm: row.confirmadaEm,
  autorUsuarioId: row.autorUsuarioId,
});

const toLacuna = (row: typeof schema.lacunaConsulta.$inferSelect): LacunaConsulta => ({
  ocorrencias: row.ocorrencias,
  id: row.id,
  acessoId: asAcessoId(row.acessoId),
  pergunta: row.pergunta,
  tipo: row.tipo === "ferramenta" ? "ferramenta" : "skill_gap",
  status: row.status === "arquivada" ? "arquivada" : "aberta",
  contrato: row.contrato ?? null,
  createdAt: row.createdAt,
});

export class DrizzleAprendizadoRepository implements AprendizadoRepositoryPort {
  async purgeCandidatasAntesDe(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(schema.consultaAprendida)
      .where(
        and(
          eq(schema.consultaAprendida.status, "candidata"),
          lt(schema.consultaAprendida.ultimaExecucao, cutoff),
        ),
      )
      .returning({ id: schema.consultaAprendida.id });
    return deleted.length;
  }
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

  async salvarConsulta(
    input: Parameters<AprendizadoRepositoryPort["salvarConsulta"]>[0],
  ): Promise<ConsultaAprendida> {
    const fingerprint = createHash("sha256").update(identidadeConsulta(input)).digest("hex");
    const row = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.acessoId + fingerprint},0))`,
      );
      const [existing] = await tx
        .select()
        .from(schema.consultaAprendida)
        .where(
          and(
            eq(schema.consultaAprendida.acessoId, input.acessoId),
            eq(schema.consultaAprendida.fingerprint, fingerprint),
          ),
        )
        .for("update");
      if (existing) {
        const [updated] = await tx
          .update(schema.consultaAprendida)
          .set({
            execucoes: existing.execucoes + (input.registroExecucao === false ? 0 : 1),
            ultimaExecucao: input.registroExecucao === false ? existing.ultimaExecucao : new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.consultaAprendida.id, existing.id))
          .returning();
        return updated!;
      }
      const [created] = await tx
        .insert(schema.consultaAprendida)
        .values({
          acessoId: input.acessoId,
          fingerprint,
          pergunta: input.pergunta,
          sql: input.sql,
          paramsContrato: [...input.paramsContrato],
          execucoes: input.registroExecucao === false ? 0 : 1,
          status: input.status ?? "candidata",
          publicacoes: [...(input.publicacoes ?? [])],
          confirmadaEm: input.status === "confirmada" ? new Date() : null,
          autorUsuarioId: input.autorUsuarioId,
        })
        .returning();
      if (input.skillIds.length)
        await tx
          .insert(schema.consultaAprendidaSkill)
          .values(input.skillIds.map((skillId) => ({ consultaId: created!.id, skillId })))
          .onConflictDoNothing();
      return created!;
    });
    return (await this.hydrate([row]))[0]!;
  }
  alterarEstado: AprendizadoRepositoryPort["alterarEstado"] = async (input) => {
    const row = await this.db.transaction(async (tx) => {
      for (const pub of [...(input.status === "confirmada" ? input.publicacoes : [])].sort((a, b) =>
        a.skillId.localeCompare(b.skillId),
      )) {
        const [skill] = await tx
          .select()
          .from(schema.skill)
          .where(and(eq(schema.skill.id, pub.skillId), eq(schema.skill.acessoId, input.acessoId)))
          .for("update");
        const [snapshot] = await tx
          .select()
          .from(schema.skillPublicacao)
          .where(eq(schema.skillPublicacao.id, pub.id));
        if (skill?.publicacaoAtivaId !== pub.id || snapshot?.pacoteHash !== pub.hash)
          throw new DomainError({
            code: ERROR_CODES.CONFIRMACAO_DESATUALIZADA,
            message: "Publicação mudou.",
            hint: "Gere novo preview.",
          });
      }
      const [old] = await tx
        .select()
        .from(schema.consultaAprendida)
        .where(
          and(
            eq(schema.consultaAprendida.id, input.id),
            eq(schema.consultaAprendida.acessoId, input.acessoId),
          ),
        )
        .for("update");
      if (
        old?.versao !== input.expectedVersion ||
        (input.status === "confirmada" && old.status !== "candidata")
      )
        throw new DomainError({
          code: ERROR_CODES.CONFIRMACAO_DESATUALIZADA,
          message: "Candidata mudou.",
          hint: "Gere novo preview.",
        });
      const [updated] = await tx
        .update(schema.consultaAprendida)
        .set({
          status: input.status,
          versao: old.versao + 1,
          autorUsuarioId: input.autorUsuarioId,
          confirmadaEm: input.status === "confirmada" ? new Date() : old.confirmadaEm,
          motivoInativacao: input.motivo ?? null,
        })
        .where(eq(schema.consultaAprendida.id, old.id))
        .returning();
      return updated!;
    });
    return (await this.hydrate([row]))[0]!;
  };

  paginarConsultas: AprendizadoRepositoryPort["paginarConsultas"] = async (input) => {
    const filter = and(
      eq(schema.consultaAprendida.acessoId, input.acessoId),
      input.estado ? eq(schema.consultaAprendida.status, input.estado) : undefined,
      input.skillId
        ? sql`EXISTS (SELECT 1 FROM consulta_aprendida_skill cas WHERE cas.consulta_id=${schema.consultaAprendida.id} AND cas.skill_id=${input.skillId})`
        : undefined,
    );
    const count = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.consultaAprendida)
      .where(filter);
    const rows = await this.db
      .select()
      .from(schema.consultaAprendida)
      .where(filter)
      .orderBy(schema.consultaAprendida.id)
      .limit(input.limite)
      .offset((input.pagina - 1) * input.limite);
    return { total: count[0]?.total ?? 0, consultas: await this.hydrate(rows) };
  };
  async listarConsultas(acessoId: string, limite: number): Promise<readonly ConsultaAprendida[]> {
    const rows = await this.db
      .select()
      .from(schema.consultaAprendida)
      .where(eq(schema.consultaAprendida.acessoId, acessoId))
      .orderBy(desc(schema.consultaAprendida.execucoes))
      .limit(limite);
    return this.hydrate(rows);
  }

  async listarConsultasDaSkill(
    acessoId: string,
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
          eq(schema.consultaAprendida.acessoId, acessoId),
          inArray(schema.consultaAprendida.id, ids),
          eq(schema.consultaAprendida.status, "confirmada"),
        ),
      )
      .orderBy(desc(schema.consultaAprendida.execucoes))
      .limit(limite);
    return this.hydrate(rows);
  }

  async obterConsulta(acessoId: string, id: string): Promise<ConsultaAprendida | null> {
    const [row] = await this.db
      .select()
      .from(schema.consultaAprendida)
      .where(
        and(eq(schema.consultaAprendida.acessoId, acessoId), eq(schema.consultaAprendida.id, id)),
      )
      .limit(1);
    if (!row) {
      return null;
    }
    const [hydrated] = await this.hydrate([row]);
    return hydrated ?? null;
  }

  async buscarConsultas(
    acessoId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<ConsultaAprendida>[]> {
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
      .select({
        item: schema.consultaAprendida,
        rank: exprTsRank("consulta_aprendida", query),
      })
      .from(schema.consultaAprendida)
      .where(
        and(
          eq(schema.consultaAprendida.acessoId, acessoId),
          eq(schema.consultaAprendida.status, "confirmada"),
          busca,
        ),
      )
      .orderBy(ordemPorTsRank("consulta_aprendida", query))
      .limit(janelaBuscaFts(limite));
    const hydrated = await this.hydrate(rows.map((row) => row.item));
    const rankById = new Map(rows.map((row) => [row.item.id, toRankFts(row.rank)]));
    return hydrated.slice(0, limite).map((item) => ({
      item,
      rank: rankById.get(item.id) ?? 0,
    }));
  }

  async registrarSinonimo(input: {
    acessoId: string;
    termo: string;
    alvoTipo: string;
    alvoId: string;
  }): Promise<Sinonimo> {
    const [row] = await this.db.insert(schema.sinonimo).values(input).returning();
    return {
      id: row!.id,
      acessoId: asAcessoId(row!.acessoId),
      termo: row!.termo,
      alvoTipo: row!.alvoTipo,
      alvoId: row!.alvoId,
    };
  }

  async listarSinonimos(acessoId: string): Promise<readonly Sinonimo[]> {
    const rows = await this.db
      .select()
      .from(schema.sinonimo)
      .where(eq(schema.sinonimo.acessoId, acessoId));
    return rows.map((row) => ({
      id: row.id,
      acessoId: asAcessoId(row.acessoId),
      termo: row.termo,
      alvoTipo: row.alvoTipo,
      alvoId: row.alvoId,
    }));
  }

  async desvincularSkill(
    acessoId: string,
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
          eq(schema.sinonimo.acessoId, acessoId),
          eq(schema.sinonimo.alvoTipo, "skill"),
          eq(schema.sinonimo.alvoId, skillId),
        ),
      )
      .returning();
    return { consultas: consultas.length, sinonimos: sinonimos.length };
  }

  async registrarLacuna(
    acessoId: string,
    pergunta: string,
    tipo: TipoLacuna = "skill_gap",
    contrato: Record<string, unknown> | null = null,
  ): Promise<LacunaConsulta> {
    const perguntaChave = chavePerguntaLacuna(pergunta);
    const [row] = await this.db
      .insert(schema.lacunaConsulta)
      .values({
        acessoId,
        pergunta,
        perguntaChave,
        tipo,
        status: "aberta",
        contrato,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.lacunaConsulta.acessoId,
          schema.lacunaConsulta.tipo,
          schema.lacunaConsulta.perguntaChave,
        ],
        set: {
          ocorrencias: sql`${schema.lacunaConsulta.ocorrencias} + 1`,
          pergunta,
          contrato,
          status: "aberta",
          updatedAt: new Date(),
        },
      })
      .returning();
    return toLacuna(row!);
  }

  async arquivarLacunaSkillGap(acessoId: string, pergunta: string): Promise<number> {
    const perguntaChave = chavePerguntaLacuna(pergunta);
    if (!perguntaChave) {
      return 0;
    }
    const rows = await this.db
      .update(schema.lacunaConsulta)
      .set({ status: "arquivada", updatedAt: new Date() })
      .where(
        and(
          eq(schema.lacunaConsulta.acessoId, acessoId),
          eq(schema.lacunaConsulta.tipo, "skill_gap"),
          eq(schema.lacunaConsulta.perguntaChave, perguntaChave),
          eq(schema.lacunaConsulta.status, "aberta"),
        ),
      )
      .returning({ id: schema.lacunaConsulta.id });
    return rows.length;
  }

  async listarLacunas(
    acessoId: string,
    limite: number,
    status: StatusLacuna = "aberta",
  ): Promise<readonly LacunaConsulta[]> {
    const rows = await this.db
      .select()
      .from(schema.lacunaConsulta)
      .where(
        and(eq(schema.lacunaConsulta.acessoId, acessoId), eq(schema.lacunaConsulta.status, status)),
      )
      .orderBy(desc(schema.lacunaConsulta.createdAt))
      .limit(limite);
    return rows.map(toLacuna);
  }

  async deleteByAcesso(acessoId: string): Promise<void> {
    await this.db
      .delete(schema.consultaAprendida)
      .where(eq(schema.consultaAprendida.acessoId, acessoId));
    await this.db.delete(schema.sinonimo).where(eq(schema.sinonimo.acessoId, acessoId));
    await this.db.delete(schema.lacunaConsulta).where(eq(schema.lacunaConsulta.acessoId, acessoId));
  }
}
