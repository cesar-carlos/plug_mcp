CREATE TABLE external_runner_v2 (
  id uuid PRIMARY KEY, persona_id uuid NOT NULL, skill_id uuid NOT NULL,
  fixture_integracao_id uuid NOT NULL, fixture_origin_hash text NOT NULL,
  manifesto jsonb NOT NULL, estado text NOT NULL CHECK (estado IN ('running','passed','failed','unknown')),
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE(persona_id,id),
  FOREIGN KEY(persona_id,skill_id) REFERENCES skill_v2(persona_id,id),
  FOREIGN KEY(persona_id,fixture_integracao_id) REFERENCES integracao(persona_id,id)
);
-- An uncertain run cannot be replayed or overlap another run on the same fixture origin.
CREATE UNIQUE INDEX external_runner_active_fixture ON external_runner_v2(fixture_origin_hash)
  WHERE estado IN ('running','unknown');
CREATE FUNCTION protect_external_runner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External runner history is immutable'; END IF;
  IF OLD.estado<>'running' OR NEW.estado NOT IN ('passed','failed','unknown')
    OR NEW.completed_at IS NULL OR ROW(NEW.id,NEW.persona_id,NEW.skill_id,NEW.fixture_integracao_id,
      NEW.fixture_origin_hash,NEW.manifesto,NEW.created_at) IS DISTINCT FROM
      ROW(OLD.id,OLD.persona_id,OLD.skill_id,OLD.fixture_integracao_id,OLD.fixture_origin_hash,OLD.manifesto,OLD.created_at) THEN
    RAISE EXCEPTION 'Invalid external runner transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER external_runner_immutable BEFORE UPDATE OR DELETE ON external_runner_v2
  FOR EACH ROW EXECUTE FUNCTION protect_external_runner();
ALTER TABLE relatorio_teste_v2 ADD COLUMN external_run_id uuid;
ALTER TABLE relatorio_teste_v2 ADD FOREIGN KEY(persona_id,external_run_id) REFERENCES external_runner_v2(persona_id,id);
-- Editorial snapshots are separate from audit metadata and survive case edits/removals.
CREATE TABLE external_case_history_v2 (
  persona_id uuid NOT NULL, skill_id uuid NOT NULL, caso_id uuid NOT NULL,
  revisao_anterior integer NOT NULL CHECK (revisao_anterior>0),
  obrigatorio boolean NOT NULL, caso jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(persona_id,skill_id,caso_id,revisao_anterior),
  FOREIGN KEY(persona_id,skill_id) REFERENCES skill_v2(persona_id,id)
);
CREATE TRIGGER external_case_history_immutable BEFORE UPDATE OR DELETE ON external_case_history_v2
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
