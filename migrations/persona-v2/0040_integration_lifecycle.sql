-- Suspension is distinct from waiting for first publication. No authority backfill.
ALTER TABLE integracao ADD COLUMN versao_gestao integer NOT NULL DEFAULT 1 CHECK(versao_gestao>0);
ALTER TABLE integracao ADD COLUMN suspensa_em timestamptz;
ALTER TABLE integracao ADD CONSTRAINT integration_suspended_inactive CHECK(suspensa_em IS NULL OR ativa=false);
