-- Fontes registradas pelo usuário: dono + agente, slug único por escopo.
-- O UNIQUE global antigo (fonte_slug_key) é substituído por índice parcial
-- para as fontes do seed (mcp_account_id IS NULL).

ALTER TABLE fonte ADD COLUMN IF NOT EXISTS mcp_account_id uuid REFERENCES mcp_account(id) ON DELETE CASCADE;
ALTER TABLE fonte ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE fonte ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE fonte ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE fonte DROP CONSTRAINT IF EXISTS fonte_slug_key;
ALTER TABLE fonte DROP CONSTRAINT IF EXISTS fonte_slug_unique;

CREATE UNIQUE INDEX IF NOT EXISTS fonte_slug_global_idx
  ON fonte (slug) WHERE mcp_account_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fonte_slug_conta_agent_idx
  ON fonte (mcp_account_id, agent_id, slug);

CREATE INDEX IF NOT EXISTS fonte_conta_agent_idx
  ON fonte (mcp_account_id, agent_id);
