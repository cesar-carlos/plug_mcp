-- Preserve old bindings and their immutable publications; replacement never rebinds them.
ALTER TABLE fonte ADD COLUMN substituida_por_id uuid;
ALTER TABLE fonte ADD CONSTRAINT fonte_substituta_mesma_persona_fk
  FOREIGN KEY (persona_id,substituida_por_id) REFERENCES fonte(persona_id,id);
ALTER TABLE fonte ADD CONSTRAINT fonte_substituida_inativa_check
  CHECK (substituida_por_id IS NULL OR (NOT ativa AND substituida_por_id <> id));
CREATE INDEX fonte_substituta_idx ON fonte(persona_id,substituida_por_id)
  WHERE substituida_por_id IS NOT NULL;

CREATE FUNCTION preserve_source_replacement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.substituida_por_id IS NOT NULL
     AND NEW.substituida_por_id IS DISTINCT FROM OLD.substituida_por_id THEN
    RAISE EXCEPTION 'A historical source replacement is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fonte_substituicao_immutable BEFORE UPDATE ON fonte
  FOR EACH ROW EXECUTE FUNCTION preserve_source_replacement();
