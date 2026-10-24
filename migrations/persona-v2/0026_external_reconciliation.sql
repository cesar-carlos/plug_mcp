-- Evidence is append-only and cannot rewrite the dispatch journal/technical receipt.
CREATE TABLE external_action_reconciliation_v2 (
  id uuid PRIMARY KEY, persona_id uuid NOT NULL, operacao_id uuid NOT NULL,
  publicacao_id uuid NOT NULL, fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  contract_hash text NOT NULL CHECK (contract_hash ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('applied_verified','inconclusive')),
  reason text NOT NULL CHECK (reason IN ('trained_evidence_matches','incomplete','not_unique',
    'correlation_mismatch','outcome_unconfirmed','provider_unavailable')),
  response_hash text CHECK (response_hash ~ '^[a-f0-9]{64}$'),
  FOREIGN KEY(persona_id,operacao_id) REFERENCES external_action_v2(persona_id,id),
  FOREIGN KEY(persona_id,publicacao_id) REFERENCES publicacao(persona_id,id),
  CHECK ((status='applied_verified') = (reason='trained_evidence_matches')),
  CHECK ((response_hash IS NULL) = (reason='provider_unavailable'))
);
CREATE INDEX external_reconciliation_action_idx ON external_action_reconciliation_v2(persona_id,operacao_id,observed_at DESC,id DESC);
CREATE FUNCTION validate_external_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM external_action_v2 a JOIN publicacao p ON p.persona_id=a.persona_id AND p.id=a.publicacao_id
    WHERE a.persona_id=NEW.persona_id AND a.id=NEW.operacao_id AND a.fingerprint=NEW.fingerprint
      AND a.publicacao_id=NEW.publicacao_id AND p.pacote_hash=NEW.contract_hash
      AND a.estado IN ('resultado_desconhecido','concluida')) THEN
    RAISE EXCEPTION 'Invalid external reconciliation binding';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER external_reconciliation_binding BEFORE INSERT ON external_action_reconciliation_v2
  FOR EACH ROW EXECUTE FUNCTION validate_external_reconciliation();
CREATE TRIGGER external_reconciliation_immutable BEFORE UPDATE OR DELETE ON external_action_reconciliation_v2
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
