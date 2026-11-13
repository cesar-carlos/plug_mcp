-- Preserve CAS revisions while distinguishing editorial updates from authority changes.
-- Existing stale OAuth records are not resurrected by this migration.
ALTER TABLE persona ADD COLUMN oauth_version_floor integer;
UPDATE persona SET oauth_version_floor=authorization_version;
ALTER TABLE persona ALTER COLUMN oauth_version_floor SET NOT NULL;
ALTER TABLE persona ADD CONSTRAINT persona_oauth_version_floor_check
  CHECK (oauth_version_floor > 0 AND oauth_version_floor <= authorization_version);

CREATE FUNCTION guard_persona_oauth_profile_context_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.oauth_version_floor := NEW.authorization_version;
  ELSIF NEW.authorization_version < OLD.authorization_version THEN
    RAISE EXCEPTION 'Persona revision cannot decrease';
  ELSIF NEW.authorization_version = OLD.authorization_version THEN
    NEW.oauth_version_floor := OLD.oauth_version_floor;
  ELSIF NEW.ativa = OLD.ativa AND NEW.responsavel_id = OLD.responsavel_id
    AND (NEW.nome,NEW.especialidade,NEW.instrucoes) IS DISTINCT FROM (OLD.nome,OLD.especialidade,OLD.instrucoes)
    AND (to_jsonb(NEW)-ARRAY['nome','especialidade','instrucoes','authorization_version','updated_at','oauth_version_floor'])
      = (to_jsonb(OLD)-ARRAY['nome','especialidade','instrucoes','authorization_version','updated_at','oauth_version_floor']) THEN
    NEW.oauth_version_floor := OLD.oauth_version_floor;
  ELSE
    NEW.oauth_version_floor := NEW.authorization_version;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER persona_oauth_profile_context_v2 BEFORE INSERT OR UPDATE ON persona
  FOR EACH ROW EXECUTE FUNCTION guard_persona_oauth_profile_context_v2();
