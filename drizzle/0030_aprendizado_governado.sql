ALTER TABLE consulta_aprendida ADD COLUMN publicacoes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE consulta_aprendida ADD COLUMN confirmada_em timestamptz;
ALTER TABLE consulta_aprendida ALTER COLUMN status SET DEFAULT 'candidata';
-- Execução legada não constitui evidência de confirmação humana.
UPDATE consulta_aprendida SET status = 'candidata' WHERE status = 'ativa';
ALTER TABLE consulta_aprendida ADD CONSTRAINT consulta_aprendida_status_check CHECK (status IN ('candidata','confirmada','inativa'));
CREATE INDEX consulta_aprendida_candidata_expiry_idx ON consulta_aprendida(ultima_execucao) WHERE status = 'candidata';
