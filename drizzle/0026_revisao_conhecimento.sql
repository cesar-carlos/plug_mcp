-- Agenda de revisão opcional. Não muda a vigência nem autoriza consultas;
-- anotações existentes seguem ativas sem prazo/cadência inventados.
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS revisar_em date;
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS periodo_revisao_dias integer;

ALTER TABLE anotacao_grafo DROP CONSTRAINT IF EXISTS anotacao_grafo_periodo_revisao_check;
ALTER TABLE anotacao_grafo ADD CONSTRAINT anotacao_grafo_periodo_revisao_check
  CHECK (periodo_revisao_dias IS NULL OR periodo_revisao_dias BETWEEN 1 AND 3650);

CREATE INDEX IF NOT EXISTS anotacao_grafo_revisao_idx
  ON anotacao_grafo (acesso_id, status, revisar_em);
