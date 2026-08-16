-- Memória de perguntas aprovadas pelo usuário: pergunta + SQL, sem linhas de resultado.
-- Sempre escopada por conta + agentId — o SQL é específico daquele banco.

CREATE TABLE IF NOT EXISTS consulta_memoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_account_id uuid NOT NULL REFERENCES mcp_account(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  pergunta text NOT NULL,
  sql_executado text NOT NULL,
  fonte_slug text,
  observacao text NOT NULL DEFAULT '',
  aprovado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consulta_memoria_conta_agent_idx
  ON consulta_memoria (mcp_account_id, agent_id);
