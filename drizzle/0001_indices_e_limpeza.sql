-- Índices para leitura do catálogo, varredura de auditoria e limpeza OAuth.
CREATE INDEX IF NOT EXISTS audit_log_account_created_idx
  ON audit_log (mcp_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS oauth_auth_code_expires_idx
  ON oauth_auth_code (expires_at);

CREATE INDEX IF NOT EXISTS oauth_refresh_token_expires_idx
  ON oauth_refresh_token (expires_at);

CREATE INDEX IF NOT EXISTS fonte_coluna_fonte_idx
  ON fonte_coluna (fonte_id);

CREATE INDEX IF NOT EXISTS fonte_relacionamento_origem_idx
  ON fonte_relacionamento (fonte_origem_id);

CREATE INDEX IF NOT EXISTS sinonimo_fonte_idx
  ON sinonimo (fonte_id);

CREATE INDEX IF NOT EXISTS regra_negocio_fonte_idx
  ON regra_negocio (fonte_id);
