-- Relacionamento pode apontar para outra fonte do catálogo OU para uma tabela crua do ERP.

ALTER TABLE fonte_relacionamento
  ALTER COLUMN fonte_destino_id DROP NOT NULL;

ALTER TABLE fonte_relacionamento
  ADD COLUMN IF NOT EXISTS tabela_destino text;

ALTER TABLE fonte_relacionamento
  DROP CONSTRAINT IF EXISTS fonte_relacionamento_destino_chk;

ALTER TABLE fonte_relacionamento
  ADD CONSTRAINT fonte_relacionamento_destino_chk CHECK (
    (fonte_destino_id IS NOT NULL AND tabela_destino IS NULL)
    OR (fonte_destino_id IS NULL AND tabela_destino IS NOT NULL)
  );
