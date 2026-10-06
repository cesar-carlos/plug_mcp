import {
  boolean,
  date,
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
import type { AuditMetadata } from "../../domain/entities/audit-log.js";
import type { SetupPurpose } from "../../domain/ports/setup-operation.port.js";
import type { OAuthRecords } from "../../domain/ports/oauth.port.js";
import type {
  CategoriaAlertaOperacional,
  MetadadosAlertaOperacional,
  SeveridadeAlertaOperacional,
  StatusAlertaOperacional,
  TipoEventoWebhook,
} from "../../domain/entities/operacoes.js";

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
    ...timestamps,
  },
  (t) => [uniqueIndex("usuario_mcp_email_hash_uidx").on(t.emailHash)],
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
    tokenHash: text("token_hash").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    statusAcesso: text("status_acesso").notNull().default("pending"),
    escopoPadrao: jsonb("escopo_padrao"),
    timezone: text("timezone"),
    nomePersona: text("nome_persona"),
    instrucoesPersona: text("instrucoes_persona"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("acesso_usuario_agent_token_uidx").on(t.usuarioId, t.agentId, t.clientTokenHash),
    uniqueIndex("acesso_token_hash_uidx").on(t.tokenHash),
    index("acesso_usuario_idx").on(t.usuarioId),
    index("acesso_agent_idx").on(t.agentId),
  ],
);

export const oauthGrant = pgTable(
  "oauth_grant",
  {
    id: text("id").primaryKey(),
    acessoId: uuid("acesso_id")
      .notNull()
      .references(() => acesso.id, { onDelete: "cascade" }),
    grantId: text("grant_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    data: jsonb("data").$type<OAuthRecords["grant"]>().notNull(),
  },
  (t) => [
    index("oauth_grant_access_idx").on(t.acessoId),
    index("oauth_grant_expiry_idx").on(t.expiresAt),
  ],
);

export const oauthTransaction = pgTable(
  "oauth_transaction",
  {
    id: text("id").primaryKey(),
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
    grantId: text("grant_id").references(() => oauthGrant.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    data: jsonb("data").$type<OAuthRecords["transaction"]>().notNull(),
  },
  (t) => [index("oauth_transaction_expiry_idx").on(t.expiresAt)],
);

export const oauthCode = pgTable(
  "oauth_code",
  {
    id: text("id").primaryKey(),
    acessoId: uuid("acesso_id")
      .notNull()
      .references(() => acesso.id, { onDelete: "cascade" }),
    grantId: text("grant_id").references(() => oauthGrant.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    data: jsonb("data").$type<OAuthRecords["code"]>().notNull(),
  },
  (t) => [index("oauth_code_expiry_idx").on(t.expiresAt)],
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    acessoId: uuid("acesso_id")
      .notNull()
      .references(() => acesso.id, { onDelete: "cascade" }),
    grantId: text("grant_id")
      .notNull()
      .references(() => oauthGrant.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    data: jsonb("data").$type<OAuthRecords["access"]>().notNull(),
  },
  (t) => [
    index("oauth_access_grant_idx").on(t.grantId),
    index("oauth_access_expiry_idx").on(t.expiresAt),
  ],
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    acessoId: uuid("acesso_id")
      .notNull()
      .references(() => acesso.id, { onDelete: "cascade" }),
    grantId: text("grant_id")
      .notNull()
      .references(() => oauthGrant.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    data: jsonb("data").$type<OAuthRecords["refresh"]>().notNull(),
  },
  (t) => [
    index("oauth_refresh_grant_idx").on(t.grantId),
    index("oauth_refresh_expiry_idx").on(t.expiresAt),
  ],
);

export const setupOperation = pgTable(
  "setup_operation",
  {
    codeHash: text("code_hash").primaryKey(),
    purpose: text("purpose").$type<SetupPurpose>().notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarioMcp.id, { onDelete: "cascade" }),
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
    bearerHash: text("bearer_hash"),
    oauthGrantId: text("oauth_grant_id").references(() => oauthGrant.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    csrfHash: text("csrf_hash"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => [index("setup_operation_expiry_idx").on(t.expiresAt)],
);

export const mcpSetup = pgTable(
  "mcp_setup",
  {
    code: text("code").primaryKey(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
  },
  (t) => [index("mcp_setup_expires_idx").on(t.expiresAt)],
);

export const grafoDialeto = pgTable("grafo_dialeto", {
  acessoId: uuid("acesso_id")
    .primaryKey()
    .references(() => acesso.id, { onDelete: "cascade" }),
  dialeto: text("dialeto").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tabelaGrafo = pgTable(
  "tabela_grafo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    origem: text("origem").notNull(),
    status: text("status").notNull().default("vigente"),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tabela_grafo_acesso_nome_uidx").on(t.acessoId, t.nome),
    index("tabela_grafo_acesso_idx").on(t.acessoId),
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
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
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
      t.acessoId,
      t.tabelaOrigemId,
      t.tabelaDestinoId,
      t.paresFingerprint,
    ),
    index("rel_grafo_acesso_idx").on(t.acessoId),
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
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
    tabelaNome: text("tabela_nome").notNull(),
    assinatura: text("assinatura").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("schema_snapshot_acesso_tabela_uidx").on(t.acessoId, t.tabelaNome)],
);

export const skill = pgTable(
  "skill",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
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
    publicacaoAtivaId: uuid("publicacao_ativa_id"),
    motivoRevalidacao: text("motivo_revalidacao"),
    consultaSemantica: jsonb("consulta_semantica").$type<ConsultaSemantica | null>(),
    politicaConsulta: jsonb("politica_consulta").$type<PoliticaConsulta | null>(),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("skill_acesso_slug_uidx").on(t.acessoId, t.slug),
    index("skill_acesso_idx").on(t.acessoId),
    // search_tsv GENERATED ALWAYS — drizzle/0016_conhecimento_fts.sql (não mapear no insert)
    // GIN composto (acesso_id, search_tsv) — drizzle/0022_catalogo_por_acesso.sql
    // pesos A/B/C + pg_trgm — drizzle/0018_fts_rank_trgm.sql
  ],
);

export const anotacaoGrafo = pgTable(
  "anotacao_grafo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
    tabelaId: uuid("tabela_id").references(() => tabelaGrafo.id, { onDelete: "set null" }),
    skillId: uuid("skill_id").references(() => skill.id, { onDelete: "set null" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    texto: text("texto").notNull(),
    fonteTipo: text("fonte_tipo").notNull().default("usuario"),
    fonteReferencia: text("fonte_referencia"),
    responsavel: text("responsavel"),
    validadoEm: timestamp("validado_em", { withTimezone: true }),
    vigenteDe: date("vigente_de"),
    vigenteAte: date("vigente_ate"),
    revisarEm: date("revisar_em"),
    periodoRevisaoDias: integer("periodo_revisao_dias"),
    status: text("status").notNull().default("vigente"),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [
    index("anotacao_grafo_acesso_idx").on(t.acessoId),
    index("anotacao_grafo_skill_idx").on(t.skillId),
    index("anotacao_grafo_vigencia_idx").on(t.acessoId, t.status, t.vigenteDe, t.vigenteAte),
    index("anotacao_grafo_revisao_idx").on(t.acessoId, t.status, t.revisarEm),
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
    metadata: jsonb("metadata").$type<AuditMetadata | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_usuario_idx").on(t.usuarioId),
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_acesso_created_idx").on(t.acessoId, t.createdAt),
  ],
);

export const skillPublicacao = pgTable(
  "skill_publicacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acessoId: uuid("acesso_id")
      .notNull()
      .references(() => acesso.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skill.id, { onDelete: "cascade" }),
    publicacaoVersao: integer("publicacao_versao").notNull(),
    skillVersao: integer("skill_versao").notNull(),
    pacote: jsonb("pacote").$type<Record<string, unknown>>().notNull(),
    pacoteHash: text("pacote_hash").notNull(),
    origem: text("origem").notNull().default("publicacao"),
    autorUsuarioId: uuid("autor_usuario_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("skill_publicacao_skill_versao_uidx").on(t.skillId, t.publicacaoVersao),
    index("skill_publicacao_acesso_skill_idx").on(t.acessoId, t.skillId, t.publicacaoVersao),
  ],
);

export const alertaOperacional = pgTable(
  "alerta_operacional",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acessoId: uuid("acesso_id")
      .notNull()
      .references(() => acesso.id, { onDelete: "cascade" }),
    categoria: text("categoria").$type<CategoriaAlertaOperacional>().notNull(),
    severidade: text("severidade").$type<SeveridadeAlertaOperacional>().notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").$type<StatusAlertaOperacional>().notNull().default("aberto"),
    metadados: jsonb("metadados").$type<MetadadosAlertaOperacional>().notNull().default({}),
    ocorrencias: integer("ocorrencias").notNull().default(1),
    versao: integer("versao").notNull().default(1),
    reconhecidoEm: timestamp("reconhecido_em", { withTimezone: true }),
    resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("alerta_operacional_chave_uidx").on(t.acessoId, t.categoria, t.fingerprint),
    index("alerta_operacional_acesso_status_idx").on(t.acessoId, t.status, t.updatedAt),
  ],
);

export const webhookOperacional = pgTable(
  "webhook_operacional",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acessoId: uuid("acesso_id")
      .notNull()
      .references(() => acesso.id, { onDelete: "cascade" }),
    urlEnc: text("url_enc").notNull(),
    urlHash: text("url_hash").notNull(),
    segredoEnc: text("segredo_enc").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("webhook_operacional_acesso_uidx").on(t.acessoId)],
);

export const webhookOperacionalOutbox = pgTable(
  "webhook_operacional_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acessoId: uuid("acesso_id")
      .notNull()
      .references(() => acesso.id, { onDelete: "cascade" }),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhookOperacional.id, { onDelete: "cascade" }),
    alertaId: uuid("alerta_id")
      .notNull()
      .references(() => alertaOperacional.id, { onDelete: "cascade" }),
    alertaVersao: integer("alerta_versao").notNull(),
    tipoEvento: text("tipo_evento").$type<TipoEventoWebhook>().notNull(),
    tentativas: integer("tentativas").notNull().default(0),
    proximaTentativaEm: timestamp("proxima_tentativa_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseAte: timestamp("lease_ate", { withTimezone: true }),
    leasePor: text("lease_por"),
    entregueEm: timestamp("entregue_em", { withTimezone: true }),
    falhaPermanenteEm: timestamp("falha_permanente_em", { withTimezone: true }),
    ultimoErroCodigo: text("ultimo_erro_codigo"),
    ultimoStatusHttp: integer("ultimo_status_http"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("webhook_operacional_outbox_evento_uidx").on(
      t.webhookId,
      t.alertaId,
      t.alertaVersao,
    ),
    index("webhook_operacional_outbox_pendente_idx").on(t.proximaTentativaEm, t.createdAt),
  ],
);

export const grafoLock = pgTable("grafo_lock", {
  acessoId: uuid("acesso_id")
    .primaryKey()
    .references(() => acesso.id, { onDelete: "cascade" }),
});

export const consultaAprendida = pgTable(
  "consulta_aprendida",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
    versao: integer("versao").notNull().default(1),
    fingerprint: text("fingerprint"),
    motivoInativacao: text("motivo_inativacao"),
    pergunta: text("pergunta").notNull(),
    sql: text("sql").notNull(),
    paramsContrato: jsonb("params_contrato").$type<ParametroSkill[]>().notNull().default([]),
    execucoes: integer("execucoes").notNull().default(1),
    ultimaExecucao: timestamp("ultima_execucao", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("candidata"),
    publicacoes: jsonb("publicacoes")
      .$type<{ skillId: string; id: string; hash: string }[]>()
      .notNull()
      .default([]),
    confirmadaEm: timestamp("confirmada_em", { withTimezone: true }),
    autorUsuarioId: uuid("autor_usuario_id"),
    ...timestamps,
  },
  (t) => [index("consulta_aprendida_acesso_idx").on(t.acessoId)],
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
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
    termo: text("termo").notNull(),
    alvoTipo: text("alvo_tipo").notNull(),
    alvoId: text("alvo_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sinonimo_acesso_idx").on(t.acessoId)],
);

export const lacunaConsulta = pgTable(
  "lacuna_consulta",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acessoId: uuid("acesso_id").references(() => acesso.id, { onDelete: "cascade" }),
    ocorrencias: integer("ocorrencias").notNull().default(1),
    pergunta: text("pergunta").notNull(),
    perguntaChave: text("pergunta_chave").notNull(),
    tipo: text("tipo").notNull().default("skill_gap"),
    status: text("status").notNull().default("aberta"),
    contrato: jsonb("contrato").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lacuna_consulta_acesso_idx").on(t.acessoId),
    uniqueIndex("lacuna_consulta_acesso_tipo_chave_uidx").on(t.acessoId, t.tipo, t.perguntaChave),
  ],
);
