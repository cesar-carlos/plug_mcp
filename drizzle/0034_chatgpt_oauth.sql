-- Delegação opcional: migração aditiva; Bearers e publicações existentes preservados.
CREATE TABLE oauth_grant (
  id text PRIMARY KEY,
  acesso_id uuid NOT NULL REFERENCES acesso(id) ON DELETE CASCADE,
  grant_id text,
  expires_at timestamptz NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE INDEX oauth_grant_access_idx ON oauth_grant(acesso_id);
CREATE INDEX oauth_grant_expiry_idx ON oauth_grant(expires_at);
CREATE TABLE oauth_transaction (
  id text PRIMARY KEY,
  acesso_id uuid REFERENCES acesso(id) ON DELETE CASCADE,
  grant_id text REFERENCES oauth_grant(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE oauth_code (
  id text PRIMARY KEY,
  acesso_id uuid NOT NULL REFERENCES acesso(id) ON DELETE CASCADE,
  grant_id text REFERENCES oauth_grant(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE oauth_access_token (
  id text PRIMARY KEY,
  acesso_id uuid NOT NULL REFERENCES acesso(id) ON DELETE CASCADE,
  grant_id text NOT NULL REFERENCES oauth_grant(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE oauth_refresh_token (
  id text PRIMARY KEY,
  acesso_id uuid NOT NULL REFERENCES acesso(id) ON DELETE CASCADE,
  grant_id text NOT NULL REFERENCES oauth_grant(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE INDEX oauth_transaction_expiry_idx ON oauth_transaction(expires_at);
CREATE INDEX oauth_code_expiry_idx ON oauth_code(expires_at);
CREATE INDEX oauth_access_grant_idx ON oauth_access_token(grant_id);
CREATE INDEX oauth_refresh_grant_idx ON oauth_refresh_token(grant_id);
CREATE INDEX oauth_access_expiry_idx ON oauth_access_token(expires_at);
CREATE INDEX oauth_refresh_expiry_idx ON oauth_refresh_token(expires_at);
ALTER TABLE setup_operation ADD COLUMN oauth_grant_id text REFERENCES oauth_grant(id) ON DELETE CASCADE;

-- A credencial antiga nunca ressuscita concessões se um status/hash for restaurado.
CREATE FUNCTION invalidate_oauth_access() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE now_ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
BEGIN
  IF NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.status_acesso = 'revoked' THEN
    UPDATE oauth_grant SET data = jsonb_set(data,'{revokedAt}',to_jsonb(now_ms)) WHERE acesso_id=NEW.id;
    UPDATE oauth_code SET expires_at=to_timestamp(0),data=data || jsonb_build_object('expiresAt',0) WHERE acesso_id=NEW.id;
    UPDATE oauth_transaction SET expires_at=to_timestamp(0),data=data || jsonb_build_object('expiresAt',0) WHERE acesso_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER oauth_source_changed AFTER UPDATE OF token_hash,status_acesso ON acesso
FOR EACH ROW EXECUTE FUNCTION invalidate_oauth_access();
