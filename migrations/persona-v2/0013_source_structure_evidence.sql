-- Immutable technical observations only. No business rows, SQL, defaults or credentials.
CREATE TABLE source_structure_evidence_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL,
  fonte_id uuid NOT NULL,
  source_version integer NOT NULL CHECK(source_version>0),
  credential_version integer NOT NULL CHECK(credential_version>0),
  identity_hash text NOT NULL CHECK(identity_hash ~ '^[a-f0-9]{64}$'),
  scope jsonb NOT NULL,
  evidence jsonb NOT NULL,
  evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(persona_id,id),
  FOREIGN KEY(persona_id,fonte_id) REFERENCES fonte(persona_id,id)
);
CREATE INDEX source_structure_evidence_expiry ON source_structure_evidence_v2(expires_at);
CREATE TRIGGER source_structure_evidence_immutable BEFORE UPDATE OR DELETE ON source_structure_evidence_v2
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
