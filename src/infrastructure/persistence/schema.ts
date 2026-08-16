import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** FTS column owned by Postgres (GENERATED ALWAYS AS in drizzle/0006_indice_busca.sql). */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * `embedding vector(1536)` is optional (`drizzle/optional/0007_pgvector.sql`).
 * Do not declare it on pgTable: Drizzle would emit the column on every INSERT
 * and seed/boot would fail without pgvector. Read/write goes through raw SQL.
 */

export const dialetoEnum = pgEnum("dialeto", ["mssql", "sybase", "postgres", "firebird"]);
export const statusAcessoEnum = pgEnum("status_acesso", ["pending", "approved", "revoked"]);

export const mcpAccount = pgTable("mcp_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ambiente = pgTable(
  "ambiente",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mcpAccountId: uuid("mcp_account_id")
      .notNull()
      .references(() => mcpAccount.id, { onDelete: "cascade" }),
    nomeAmigavel: text("nome_amigavel").notNull(),
    agentId: uuid("agent_id").notNull(),
    dialeto: dialetoEnum("dialeto").notNull(),
    clientTokenEncriptado: text("client_token_encriptado"),
    statusAcesso: statusAcessoEnum("status_acesso").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ambiente_account_agent_idx").on(t.mcpAccountId, t.agentId)],
);

export const fonte = pgTable(
  "fonte",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    mcpAccountId: uuid("mcp_account_id").references(() => mcpAccount.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id"),
    tsv: tsvector("tsv"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fonte_slug_global_idx")
      .on(t.slug)
      .where(sql`${t.mcpAccountId} is null`),
    uniqueIndex("fonte_slug_conta_agent_idx").on(t.mcpAccountId, t.agentId, t.slug),
    index("fonte_conta_agent_idx").on(t.mcpAccountId, t.agentId),
  ],
);

export const fonteSqlVariant = pgTable(
  "fonte_sql_variant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fonteId: uuid("fonte_id")
      .notNull()
      .references(() => fonte.id, { onDelete: "cascade" }),
    dialeto: dialetoEnum("dialeto").notNull(),
    sqlBase: text("sql_base").notNull(),
    observacoesDialeto: text("observacoes_dialeto").notNull().default(""),
  },
  (t) => [uniqueIndex("fonte_sql_variant_fonte_dialeto_idx").on(t.fonteId, t.dialeto)],
);

export const fonteColuna = pgTable(
  "fonte_coluna",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fonteId: uuid("fonte_id")
      .notNull()
      .references(() => fonte.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    tipo: text("tipo").notNull(),
    descricao: text("descricao").notNull(),
    regraNegocio: text("regra_negocio"),
    ordem: integer("ordem").notNull().default(0),
  },
  (t) => [index("fonte_coluna_fonte_idx").on(t.fonteId)],
);

export const fonteRelacionamento = pgTable(
  "fonte_relacionamento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fonteOrigemId: uuid("fonte_origem_id")
      .notNull()
      .references(() => fonte.id, { onDelete: "cascade" }),
    colunaOrigem: text("coluna_origem").notNull(),
    fonteDestinoId: uuid("fonte_destino_id").references(() => fonte.id, { onDelete: "cascade" }),
    tabelaDestino: text("tabela_destino"),
    colunaDestino: text("coluna_destino").notNull(),
    tipoJoin: text("tipo_join").notNull().default("inner"),
    descricao: text("descricao").notNull().default(""),
  },
  (t) => [index("fonte_relacionamento_origem_idx").on(t.fonteOrigemId)],
);

export const regraNegocio = pgTable(
  "regra_negocio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fonteId: uuid("fonte_id").references(() => fonte.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull(),
    expressao: text("expressao"),
  },
  (t) => [index("regra_negocio_fonte_idx").on(t.fonteId)],
);

export const fonteAnotacao = pgTable(
  "fonte_anotacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mcpAccountId: uuid("mcp_account_id")
      .notNull()
      .references(() => mcpAccount.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull(),
    fonteId: uuid("fonte_id").references(() => fonte.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull().default(""),
    texto: text("texto").notNull(),
    tsv: tsvector("tsv"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fonte_anotacao_conta_agent_fonte_idx").on(t.mcpAccountId, t.agentId, t.fonteId)],
);

export const consultaMemoria = pgTable(
  "consulta_memoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mcpAccountId: uuid("mcp_account_id")
      .notNull()
      .references(() => mcpAccount.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull(),
    pergunta: text("pergunta").notNull(),
    sqlExecutado: text("sql_executado").notNull(),
    fonteSlug: text("fonte_slug"),
    observacao: text("observacao").notNull().default(""),
    tsv: tsvector("tsv"),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consulta_memoria_conta_agent_idx").on(t.mcpAccountId, t.agentId)],
);

export const sinonimo = pgTable(
  "sinonimo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fonteId: uuid("fonte_id")
      .notNull()
      .references(() => fonte.id, { onDelete: "cascade" }),
    termo: text("termo").notNull(),
    descricao: text("descricao").notNull().default(""),
  },
  (t) => [index("sinonimo_fonte_idx").on(t.fonteId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mcpAccountId: uuid("mcp_account_id")
      .notNull()
      .references(() => mcpAccount.id, { onDelete: "cascade" }),
    ambienteId: uuid("ambiente_id").references(() => ambiente.id, { onDelete: "set null" }),
    tool: text("tool").notNull(),
    sqlEnviado: text("sql_enviado"),
    sucesso: boolean("sucesso").notNull(),
    codigoErro: text("codigo_erro"),
    linhasRetornadas: integer("linhas_retornadas"),
    duracaoMs: integer("duracao_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_account_created_idx").on(t.mcpAccountId, t.createdAt)],
);

export const oauthClient = pgTable("oauth_client", {
  clientId: text("client_id").primaryKey(),
  clientSecretHash: text("client_secret_hash"),
  clientName: text("client_name").notNull(),
  redirectUris: text("redirect_uris").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAuthCode = pgTable(
  "oauth_auth_code",
  {
    code: text("code").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mcpAccount.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    resource: text("resource"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("oauth_auth_code_expires_idx").on(t.expiresAt)],
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    tokenHash: text("token_hash").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mcpAccount.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("oauth_refresh_token_expires_idx").on(t.expiresAt)],
);
