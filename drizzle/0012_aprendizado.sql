CREATE TABLE IF NOT EXISTS consulta_aprendida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  skill_id uuid,
  pergunta text NOT NULL,
  sql text NOT NULL,
  params_contrato jsonb NOT NULL DEFAULT '[]'::jsonb,
  execucoes integer NOT NULL DEFAULT 1,
  ultima_execucao timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ativa',
  autor_usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consulta_aprendida_agent_idx ON consulta_aprendida (agent_id);

CREATE TABLE IF NOT EXISTS sinonimo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  termo text NOT NULL,
  alvo_tipo text NOT NULL,
  alvo_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sinonimo_agent_idx ON sinonimo (agent_id);

CREATE TABLE IF NOT EXISTS lacuna_consulta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  pergunta text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lacuna_consulta_agent_idx ON lacuna_consulta (agent_id);
