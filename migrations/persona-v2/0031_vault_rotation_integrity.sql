-- Key IDs cannot be rebound and completed maintenance runs are permanent evidence.
CREATE TRIGGER persona_vault_binding_immutable BEFORE UPDATE OR DELETE ON persona_vault_key_binding_v2
 FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
CREATE FUNCTION persona_vault_rotation_integrity_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Vault rotation journal is permanent'; END IF;
 IF ROW(NEW.id,NEW.key_id,NEW.fingerprint,NEW.required_keys,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.key_id,OLD.fingerprint,OLD.required_keys,OLD.created_at)
  OR (OLD.status='completed' AND NEW IS DISTINCT FROM OLD)
  OR NEW.table_index<OLD.table_index OR NEW.checked<OLD.checked OR NEW.changed<OLD.changed
  THEN RAISE EXCEPTION 'Vault rotation identity/progress is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER persona_vault_rotation_integrity BEFORE UPDATE OR DELETE ON persona_vault_rotation_v2
 FOR EACH ROW EXECUTE FUNCTION persona_vault_rotation_integrity_v2();
