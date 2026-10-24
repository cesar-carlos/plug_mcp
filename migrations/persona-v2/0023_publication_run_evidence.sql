-- Old reports remain historical; no approval or transport proof is backfilled.
ALTER TABLE relatorio_teste_v2 ADD COLUMN evidencia jsonb;
ALTER TABLE relatorio_teste_v2 ADD CONSTRAINT relatorio_teste_v2_evidence_object
  CHECK (evidencia IS NULL OR (jsonb_typeof(evidencia) = 'object' AND evidencia->>'version' = '1'));
