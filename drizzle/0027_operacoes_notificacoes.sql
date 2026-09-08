-- Operação é estritamente por acesso. O conteúdo do alerta é metadado seguro;
-- URL e segredo de webhook são cifrados pela aplicação antes de persistir.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS alerta_operacional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acesso_id uuid NOT NULL REFERENCES acesso(id) ON DELETE CASCADE,
  categoria text NOT NULL,
  severidade text NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrencias integer NOT NULL DEFAULT 1,
  versao integer NOT NULL DEFAULT 1,
  reconhecido_em timestamptz,
  resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alerta_operacional_categoria_check CHECK (categoria IN ('slo', 'revisao')),
  CONSTRAINT alerta_operacional_severidade_check CHECK (severidade IN ('atencao', 'critica')),
  CONSTRAINT alerta_operacional_status_check CHECK (status IN ('aberto', 'reconhecido', 'resolvido')),
  CONSTRAINT alerta_operacional_ocorrencias_check CHECK (ocorrencias > 0),
  CONSTRAINT alerta_operacional_versao_check CHECK (versao > 0),
  UNIQUE (acesso_id, categoria, fingerprint)
);
CREATE INDEX IF NOT EXISTS alerta_operacional_acesso_status_idx
  ON alerta_operacional (acesso_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS webhook_operacional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acesso_id uuid NOT NULL REFERENCES acesso(id) ON DELETE CASCADE,
  url_enc text NOT NULL,
  url_hash text NOT NULL,
  segredo_enc text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (acesso_id)
);
CREATE INDEX IF NOT EXISTS webhook_operacional_ativo_idx
  ON webhook_operacional (ativo) WHERE ativo = true;

CREATE TABLE IF NOT EXISTS webhook_operacional_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acesso_id uuid NOT NULL REFERENCES acesso(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES webhook_operacional(id) ON DELETE CASCADE,
  alerta_id uuid NOT NULL REFERENCES alerta_operacional(id) ON DELETE CASCADE,
  alerta_versao integer NOT NULL,
  tipo_evento text NOT NULL,
  tentativas integer NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  lease_ate timestamptz,
  lease_por text,
  entregue_em timestamptz,
  falha_permanente_em timestamptz,
  ultimo_erro_codigo text,
  ultimo_status_http integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_operacional_outbox_evento_check CHECK (tipo_evento IN ('aberto', 'atualizado', 'resolvido')),
  CONSTRAINT webhook_operacional_outbox_tentativas_check CHECK (tentativas >= 0),
  UNIQUE (webhook_id, alerta_id, alerta_versao)
);
CREATE INDEX IF NOT EXISTS webhook_operacional_outbox_pendente_idx
  ON webhook_operacional_outbox (proxima_tentativa_em, created_at)
  WHERE entregue_em IS NULL AND falha_permanente_em IS NULL;
