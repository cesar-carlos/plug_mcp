-- Anotações incrementais e glossário, sempre escopados por conta + agentId.
-- fonte_id NULL = glossário daquele agente (não da conta).

CREATE TABLE IF NOT EXISTS fonte_anotacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_account_id uuid NOT NULL REFERENCES mcp_account(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  fonte_id uuid REFERENCES fonte(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL DEFAULT '',
  texto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fonte_anotacao_tipo_chk CHECK (
    tipo IN ('uso', 'codigo', 'alerta', 'glossario', 'preferencia')
  )
);

CREATE INDEX IF NOT EXISTS fonte_anotacao_conta_agent_fonte_idx
  ON fonte_anotacao (mcp_account_id, agent_id, fonte_id);
