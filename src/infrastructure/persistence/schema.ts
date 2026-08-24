import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ParametroSkill } from "../../domain/entities/skill.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const usuarioMcp = pgTable(
  "usuario_mcp",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailEnc: text("email_enc").notNull(),
    emailHash: text("email_hash").notNull(),
    senhaEnc: text("senha_enc").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("usuario_mcp_email_hash_uidx").on(t.emailHash),
    uniqueIndex("usuario_mcp_token_hash_uidx").on(t.tokenHash),
  ],
);

export const acesso = pgTable(
  "acesso",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarioMcp.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull(),
    dialeto: text("dialeto").notNull(),
    nomeAmigavel: text("nome_amigavel").notNull(),
    clientTokenEnc: text("client_token_enc").notNull(),
    clientTokenHash: text("client_token_hash").notNull(),
    statusAcesso: text("status_acesso").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("acesso_usuario_agent_token_uidx").on(t.usuarioId, t.agentId, t.clientTokenHash),
    index("acesso_usuario_idx").on(t.usuarioId),
    index("acesso_agent_idx").on(t.agentId),
  ],
);

export const grafoDialeto = pgTable("grafo_dialeto", {
  agentId: uuid("agent_id").primaryKey(),
  dialeto: text("dialeto").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tabelaGrafo = pgTable(
  "tabela_grafo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    origem: text("origem").notNull(),
    status: text("status").notNull().default("vigente"),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tabela_grafo_agent_nome_uidx").on(t.agentId, t.nome),
    index("tabela_grafo_agent_idx").on(t.agentId),
  ],
);

export const colunaGrafo = pgTable(
  "coluna_grafo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tabelaId: uuid("tabela_id")
      .notNull()
      .references(() => tabelaGrafo.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    tipo: text("tipo"),
    descricao: text("descricao"),
    dicionario: text("dicionario"),
    origem: text("origem").notNull(),
    status: text("status").notNull().default("vigente"),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("coluna_grafo_tabela_nome_uidx").on(t.tabelaId, t.nome)],
);

export const relacionamentoGrafo = pgTable(
  "relacionamento_grafo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    tabelaOrigemId: uuid("tabela_origem_id")
      .notNull()
      .references(() => tabelaGrafo.id, { onDelete: "cascade" }),
    colunaOrigem: text("coluna_origem").notNull(),
    tabelaDestinoId: uuid("tabela_destino_id")
      .notNull()
      .references(() => tabelaGrafo.id, { onDelete: "cascade" }),
    colunaDestino: text("coluna_destino").notNull(),
    tipoJoin: text("tipo_join").notNull().default("inner"),
    descricao: text("descricao"),
    origem: text("origem").notNull(),
    status: text("status").notNull().default("vigente"),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("rel_grafo_uidx").on(
      t.agentId,
      t.tabelaOrigemId,
      t.colunaOrigem,
      t.tabelaDestinoId,
      t.colunaDestino,
    ),
    index("rel_grafo_agent_idx").on(t.agentId),
  ],
);

export const skill = pgTable(
  "skill",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    slug: text("slug").notNull(),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull(),
    sqlModelo: text("sql_modelo").notNull(),
    params: jsonb("params").$type<ParametroSkill[]>().notNull().default([]),
    versao: integer("versao").notNull().default(1),
    status: text("status").notNull().default("rascunho"),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("skill_agent_slug_uidx").on(t.agentId, t.slug),
    index("skill_agent_idx").on(t.agentId),
  ],
);

export const anotacaoGrafo = pgTable(
  "anotacao_grafo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    tabelaId: uuid("tabela_id").references(() => tabelaGrafo.id, { onDelete: "set null" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    texto: text("texto").notNull(),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [index("anotacao_grafo_agent_idx").on(t.agentId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id"),
    acessoId: uuid("acesso_id"),
    tool: text("tool").notNull(),
    sqlEnviado: text("sql_enviado"),
    sucesso: integer("sucesso").notNull(),
    codigoErro: text("codigo_erro"),
    linhasRetornadas: integer("linhas_retornadas"),
    duracaoMs: integer("duracao_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_usuario_idx").on(t.usuarioId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

export const grafoLock = pgTable("grafo_lock", {
  agentId: uuid("agent_id").primaryKey(),
});
