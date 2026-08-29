ALTER TABLE coluna_grafo ADD COLUMN IF NOT EXISTS sensibilidade text NOT NULL DEFAULT 'livre';

ALTER TABLE relacionamento_grafo ADD COLUMN IF NOT EXISTS pares_fingerprint text;
ALTER TABLE relacionamento_grafo ADD COLUMN IF NOT EXISTS escopo_validacao jsonb;

CREATE TABLE IF NOT EXISTS relacionamento_grafo_par (
  relacionamento_id uuid NOT NULL REFERENCES relacionamento_grafo(id) ON DELETE CASCADE,
  ordem integer NOT NULL,
  coluna_origem text NOT NULL,
  coluna_destino text NOT NULL,
  PRIMARY KEY (relacionamento_id, ordem)
);

UPDATE relacionamento_grafo
SET pares_fingerprint = lower(coluna_origem) || '=' || lower(coluna_destino)
WHERE pares_fingerprint IS NULL OR pares_fingerprint = '';

INSERT INTO relacionamento_grafo_par (relacionamento_id, ordem, coluna_origem, coluna_destino)
SELECT id, 0, coluna_origem, coluna_destino
FROM relacionamento_grafo
WHERE NOT EXISTS (
  SELECT 1 FROM relacionamento_grafo_par p WHERE p.relacionamento_id = relacionamento_grafo.id
);

ALTER TABLE relacionamento_grafo ALTER COLUMN pares_fingerprint SET NOT NULL;

DROP INDEX IF EXISTS rel_grafo_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS rel_grafo_pares_uidx
  ON relacionamento_grafo (agent_id, tabela_origem_id, tabela_destino_id, pares_fingerprint);

ALTER TABLE skill ADD COLUMN IF NOT EXISTS consulta_semantica jsonb;

CREATE TABLE IF NOT EXISTS schema_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  tabela_nome text NOT NULL,
  assinatura text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS schema_snapshot_agent_tabela_uidx
  ON schema_snapshot (agent_id, tabela_nome);
