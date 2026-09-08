ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS metadata jsonb;
CREATE INDEX IF NOT EXISTS audit_log_acesso_created_idx
  ON audit_log (acesso_id, created_at DESC);
