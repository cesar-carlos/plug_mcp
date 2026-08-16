-- Se7e MCP schema (Fase 1)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE dialeto AS ENUM ('mssql', 'sybase', 'postgres', 'firebird');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE status_acesso AS ENUM ('pending', 'approved', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS mcp_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ambiente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_account_id uuid NOT NULL REFERENCES mcp_account(id) ON DELETE CASCADE,
  nome_amigavel text NOT NULL,
  agent_id uuid NOT NULL,
  dialeto dialeto NOT NULL,
  client_token_encriptado text,
  status_acesso status_acesso NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ambiente_account_agent_idx ON ambiente (mcp_account_id, agent_id);

CREATE TABLE IF NOT EXISTS fonte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS fonte_sql_variant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte_id uuid NOT NULL REFERENCES fonte(id) ON DELETE CASCADE,
  dialeto dialeto NOT NULL,
  sql_base text NOT NULL,
  observacoes_dialeto text NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS fonte_sql_variant_fonte_dialeto_idx ON fonte_sql_variant (fonte_id, dialeto);

CREATE TABLE IF NOT EXISTS fonte_coluna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte_id uuid NOT NULL REFERENCES fonte(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL,
  descricao text NOT NULL,
  regra_negocio text,
  ordem integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fonte_relacionamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte_origem_id uuid NOT NULL REFERENCES fonte(id) ON DELETE CASCADE,
  coluna_origem text NOT NULL,
  fonte_destino_id uuid NOT NULL REFERENCES fonte(id) ON DELETE CASCADE,
  coluna_destino text NOT NULL,
  tipo_join text NOT NULL DEFAULT 'inner',
  descricao text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS regra_negocio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte_id uuid REFERENCES fonte(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text NOT NULL,
  expressao text
);

CREATE TABLE IF NOT EXISTS sinonimo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte_id uuid NOT NULL REFERENCES fonte(id) ON DELETE CASCADE,
  termo text NOT NULL,
  descricao text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_account_id uuid NOT NULL REFERENCES mcp_account(id) ON DELETE CASCADE,
  ambiente_id uuid REFERENCES ambiente(id) ON DELETE SET NULL,
  tool text NOT NULL,
  sql_enviado text,
  sucesso boolean NOT NULL,
  codigo_erro text,
  linhas_retornadas integer,
  duracao_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_client (
  client_id text PRIMARY KEY,
  client_secret_hash text,
  client_name text NOT NULL,
  redirect_uris text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_auth_code (
  code text PRIMARY KEY,
  client_id text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES mcp_account(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  resource text,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_refresh_token (
  token_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES mcp_account(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
