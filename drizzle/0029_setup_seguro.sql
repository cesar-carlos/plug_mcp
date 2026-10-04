-- Invalida operações legadas que persistiam o Bearer. Tokens de acesso não mudam.
DELETE FROM mcp_setup;
CREATE TABLE setup_operation (
  code_hash text PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('registrar','adicionar','credenciais','rotacionar')),
  usuario_id uuid REFERENCES usuario_mcp(id) ON DELETE CASCADE,
  acesso_id uuid REFERENCES acesso(id) ON DELETE CASCADE,
  bearer_hash text,
  expires_at timestamptz NOT NULL,
  csrf_hash text,
  claimed_at timestamptz,
  CHECK ((purpose = 'registrar' AND usuario_id IS NULL AND acesso_id IS NULL) OR (purpose <> 'registrar' AND usuario_id IS NOT NULL AND acesso_id IS NOT NULL))
);
CREATE INDEX setup_operation_expiry_idx ON setup_operation(expires_at);
