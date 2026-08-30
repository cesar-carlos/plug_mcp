import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ParametroSkill } from "../../domain/entities/skill.js";
import type { ConsultaSemantica } from "../../domain/entities/consulta-semantica.js";
import type { PoliticaConsulta } from "../../domain/entities/politica-consulta.js";
import type { EscopoSkill } from "../../domain/entities/escopo.js";
import type { PerfilColuna } from "../../domain/entities/escopo.js";
import type { EscopoValidacaoRel } from "../../domain/entities/grafo.js";

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
    escopoPadrao: jsonb("escopo_padrao"),
    timezone: text("timezone"),
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
    nullable: boolean("nullable"),
    descricao: text("descricao"),
    dicionario: text("dicionario"),
    papel: text("papel"),
    formato: text("formato"),
    perfil: jsonb("perfil").$type<PerfilColuna | null>(),
    sensibilidade: text("sensibilidade").notNull().default("livre"),
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
    paresFingerprint: text("pares_fingerprint").notNull(),
    tipoJoin: text("tipo_join").notNull().default("inner"),
    cardinalidade: text("cardinalidade"),
    descricao: text("descricao"),
    escopoValidacao: jsonb("escopo_validacao").$type<EscopoValidacaoRel | null>(),
    origem: text("origem").notNull(),
    status: text("status").notNull().default("vigente"),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("rel_grafo_pares_uidx").on(
      t.agentId,
      t.tabelaOrigemId,
      t.tabelaDestinoId,
      t.paresFingerprint,
    ),
    index("rel_grafo_agent_idx").on(t.agentId),
  ],
);

export const relacionamentoGrafoPar = pgTable(
  "relacionamento_grafo_par",
  {
    relacionamentoId: uuid("relacionamento_id")
      .notNull()
      .references(() => relacionamentoGrafo.id, { onDelete: "cascade" }),
    ordem: integer("ordem").notNull(),
    colunaOrigem: text("coluna_origem").notNull(),
    colunaDestino: text("coluna_destino").notNull(),
  },
  (t) => [primaryKey({ columns: [t.relacionamentoId, t.ordem] })],
);

export const schemaSnapshot = pgTable(
  "schema_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    tabelaNome: text("tabela_nome").notNull(),
    assinatura: text("assinatura").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("schema_snapshot_agent_tabela_uidx").on(t.agentId, t.tabelaNome)],
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
    escopo: jsonb("escopo").$type<EscopoSkill>().notNull().default({
      tabelas: [],
      colunasPorTabela: {},
      relacionamentos: [],
      graoPorTabela: {},
      graoResultado: [],
      metricasSaida: [],
      pacoteVersao: 2,
    }),
    versao: integer("versao").notNull().default(1),
    pacoteVersao: integer("pacote_versao").notNull().default(2),
    status: text("status").notNull().default("rascunho"),
    motivoRevalidacao: text("motivo_revalidacao"),
    consultaSemantica: jsonb("consulta_semantica").$type<ConsultaSemantica | null>(),
    politicaConsulta: jsonb("politica_consulta").$type<PoliticaConsulta | null>(),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("skill_agent_slug_uidx").on(t.agentId, t.slug),
    index("skill_agent_idx").on(t.agentId),
    // search_tsv GENERATED ALWAYS — drizzle/0016_conhecimento_fts.sql (não mapear no insert)
  ],
);

export const anotacaoGrafo = pgTable(
  "anotacao_grafo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    tabelaId: uuid("tabela_id").references(() => tabelaGrafo.id, { onDelete: "set null" }),
    skillId: uuid("skill_id").references(() => skill.id, { onDelete: "set null" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    texto: text("texto").notNull(),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [
    index("anotacao_grafo_agent_idx").on(t.agentId),
    index("anotacao_grafo_skill_idx").on(t.skillId),
  ],
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

export const consultaAprendida = pgTable(
  "consulta_aprendida",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    pergunta: text("pergunta").notNull(),
    sql: text("sql").notNull(),
    paramsContrato: jsonb("params_contrato").$type<ParametroSkill[]>().notNull().default([]),
    execucoes: integer("execucoes").notNull().default(1),
    ultimaExecucao: timestamp("ultima_execucao", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("ativa"),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [index("consulta_aprendida_agent_idx").on(t.agentId)],
);

export const consultaAprendidaSkill = pgTable(
  "consulta_aprendida_skill",
  {
    consultaId: uuid("consulta_id")
      .notNull()
      .references(() => consultaAprendida.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skill.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.consultaId, t.skillId] }),
    index("consulta_aprendida_skill_skill_idx").on(t.skillId),
  ],
);

export const sinonimo = pgTable(
  "sinonimo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    termo: text("termo").notNull(),
    alvoTipo: text("alvo_tipo").notNull(),
    alvoId: text("alvo_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sinonimo_agent_idx").on(t.agentId)],
);

export const lacunaConsulta = pgTable(
  "lacuna_consulta",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    pergunta: text("pergunta").notNull(),
    tipo: text("tipo").notNull().default("skill_gap"),
    contrato: jsonb("contrato").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lacuna_consulta_agent_idx").on(t.agentId)],
);
