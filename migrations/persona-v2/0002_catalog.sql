-- A preview is short-lived, bound to one exact draft/base and consumed atomically.
ALTER TABLE publicacao_fonte ADD COLUMN source_fingerprint text;
ALTER TABLE publicacao_fonte ADD CONSTRAINT publicacao_fonte_fingerprint_format
  CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[a-f0-9]{64}$');
CREATE TRIGGER publicacao_fonte_immutable BEFORE UPDATE OR DELETE ON publicacao_fonte
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
CREATE TRIGGER publicacao_dependencia_immutable BEFORE UPDATE OR DELETE ON publicacao_dependencia
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
CREATE TRIGGER publicacao_integracao_immutable BEFORE UPDATE OR DELETE ON publicacao_integracao
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
ALTER TABLE relatorio_teste_v2 ADD COLUMN casos_hash text;
ALTER TABLE audit_v2 ADD COLUMN responsavel_id uuid REFERENCES responsavel(id);
ALTER TABLE audit_v2 ADD COLUMN skill_id uuid;
ALTER TABLE audit_v2 ADD COLUMN publicacao_id uuid;
ALTER TABLE audit_v2 ADD FOREIGN KEY (persona_id,skill_id) REFERENCES skill_v2(persona_id,id);
ALTER TABLE audit_v2 ADD FOREIGN KEY (persona_id,publicacao_id) REFERENCES publicacao(persona_id,id);
ALTER TABLE audit_v2 ADD FOREIGN KEY (persona_id,skill_id,publicacao_id) REFERENCES publicacao(persona_id,skill_id,id);
CREATE TABLE publicacao_preview_v2 (
  hash text PRIMARY KEY CHECK (hash ~ '^[a-f0-9]{64}$'),
  persona_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  revisao integer NOT NULL CHECK (revisao > 0),
  persona_version integer NOT NULL CHECK (persona_version > 0),
  pacote_hash text NOT NULL CHECK (pacote_hash ~ '^[a-f0-9]{64}$'),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  publicacao_anterior_id uuid,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  FOREIGN KEY (persona_id,skill_id) REFERENCES skill_v2(persona_id,id),
  FOREIGN KEY (persona_id,skill_id,publicacao_anterior_id) REFERENCES publicacao(persona_id,skill_id,id)
);
CREATE INDEX publicacao_preview_v2_expiry_idx ON publicacao_preview_v2(expires_at);
CREATE FUNCTION validate_catalog_preview_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM persona WHERE id=NEW.persona_id AND responsavel_id=NEW.responsavel_id) THEN
    RAISE EXCEPTION 'Publication preview owner mismatch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER publicacao_preview_v2_owner BEFORE INSERT OR UPDATE ON publicacao_preview_v2
  FOR EACH ROW EXECUTE FUNCTION validate_catalog_preview_owner();
