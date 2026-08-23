-- Greenfield: drop OAuth/Fonte/conta MCP and create vault + shared graph.
CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS oauth_refresh_token CASCADE;
DROP TABLE IF EXISTS oauth_auth_code CASCADE;
DROP TABLE IF EXISTS oauth_client CASCADE;
DROP TABLE IF EXISTS fonte_sql_variant CASCADE;
DROP TABLE IF EXISTS fonte_coluna CASCADE;
DROP TABLE IF EXISTS fonte_relacionamento CASCADE;
DROP TABLE IF EXISTS fonte_sinonimo CASCADE;
DROP TABLE IF EXISTS fonte_regra_negocio CASCADE;
DROP TABLE IF EXISTS fonte_anotacao CASCADE;
DROP TABLE IF EXISTS consulta_memoria CASCADE;
DROP TABLE IF EXISTS fonte CASCADE;
DROP TABLE IF EXISTS sinonimo CASCADE;
DROP TABLE IF EXISTS regra_negocio CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS ambiente CASCADE;
DROP TABLE IF EXISTS mcp_account CASCADE;

CREATE TABLE IF NOT EXISTS usuario_mcp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_enc text NOT NULL,
  email_hash text NOT NULL,
  senha_enc text NOT NULL,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS usuario_mcp_email_hash_uidx ON usuario_mcp (email_hash);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_mcp_token_hash_uidx ON usuario_mcp (token_hash);

CREATE TABLE IF NOT EXISTS acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuario_mcp (id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  dialeto text NOT NULL,
  nome_amigavel text NOT NULL,
  client_token_enc text NOT NULL,
  client_token_hash text NOT NULL,
  status_acesso text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS acesso_usuario_agent_token_uidx
  ON acesso (usuario_id, agent_id, client_token_hash);
CREATE INDEX IF NOT EXISTS acesso_usuario_idx ON acesso (usuario_id);
CREATE INDEX IF NOT EXISTS acesso_agent_idx ON acesso (agent_id);

CREATE TABLE IF NOT EXISTS grafo_dialeto (
  agent_id uuid PRIMARY KEY,
  dialeto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grafo_lock (
  agent_id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS tabela_grafo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  origem text NOT NULL,
  status text NOT NULL DEFAULT 'vigente',
  autor_usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tabela_grafo_agent_nome_uidx ON tabela_grafo (agent_id, lower(nome));
CREATE INDEX IF NOT EXISTS tabela_grafo_agent_idx ON tabela_grafo (agent_id);

CREATE TABLE IF NOT EXISTS coluna_grafo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid NOT NULL REFERENCES tabela_grafo (id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text,
  descricao text,
  dicionario text,
  origem text NOT NULL,
  status text NOT NULL DEFAULT 'vigente',
  autor_usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coluna_grafo_tabela_nome_uidx ON coluna_grafo (tabela_id, lower(nome));

CREATE TABLE IF NOT EXISTS relacionamento_grafo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  tabela_origem_id uuid NOT NULL REFERENCES tabela_grafo (id) ON DELETE CASCADE,
  coluna_origem text NOT NULL,
  tabela_destino_id uuid NOT NULL REFERENCES tabela_grafo (id) ON DELETE CASCADE,
  coluna_destino text NOT NULL,
  tipo_join text NOT NULL DEFAULT 'inner',
  descricao text,
  origem text NOT NULL,
  status text NOT NULL DEFAULT 'vigente',
  autor_usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rel_grafo_uidx ON relacionamento_grafo (
  agent_id, tabela_origem_id, lower(coluna_origem), tabela_destino_id, lower(coluna_destino)
);
CREATE INDEX IF NOT EXISTS rel_grafo_agent_idx ON relacionamento_grafo (agent_id);

CREATE TABLE IF NOT EXISTS skill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  slug text NOT NULL,
  nome text NOT NULL,
  descricao text NOT NULL,
  sql_modelo text NOT NULL,
  versao integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'rascunho',
  autor_usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS skill_agent_slug_uidx ON skill (agent_id, slug);
CREATE INDEX IF NOT EXISTS skill_agent_idx ON skill (agent_id);

CREATE TABLE IF NOT EXISTS anotacao_grafo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  tabela_id uuid REFERENCES tabela_grafo (id) ON DELETE SET NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  texto text NOT NULL,
  autor_usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anotacao_grafo_agent_idx ON anotacao_grafo (agent_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid,
  acesso_id uuid,
  tool text NOT NULL,
  sql_enviado text,
  sucesso integer NOT NULL,
  codigo_erro text,
  linhas_retornadas integer,
  duracao_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_usuario_idx ON audit_log (usuario_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at);
