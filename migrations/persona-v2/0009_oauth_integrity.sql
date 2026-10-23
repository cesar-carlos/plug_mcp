-- Additive: existing v2 grants remain private and retain their original limits.
ALTER TABLE oauth_registro_v2 ADD CONSTRAINT oauth_v2_hash CHECK (id_hash ~ '^[a-f0-9]{64}$');
CREATE INDEX oauth_registro_v2_expiry_idx ON oauth_registro_v2(expires_at);
CREATE INDEX oauth_registro_v2_grant_idx ON oauth_registro_v2(persona_id,concessao_id);
CREATE INDEX oauth_concessao_v2_token_idx ON oauth_concessao_v2(persona_id,token_id);

CREATE FUNCTION oauth_v2_immutable_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.persona_id,NEW.token_id,NEW.token_version,NEW.permissoes,NEW.client_id,NEW.expires_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.persona_id,OLD.token_id,OLD.token_version,OLD.permissoes,OLD.client_id,OLD.expires_at)
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'OAuth v2 grant is immutable and cannot be restored';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER oauth_v2_grant_immutable BEFORE UPDATE ON oauth_concessao_v2
  FOR EACH ROW EXECUTE FUNCTION oauth_v2_immutable_grant();

CREATE FUNCTION oauth_v2_terminal_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id_hash,NEW.tipo,NEW.expires_at) IS DISTINCT FROM ROW(OLD.id_hash,OLD.tipo,OLD.expires_at)
     OR (OLD.consumed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD)
     OR (OLD.persona_id IS NOT NULL AND NEW.persona_id IS DISTINCT FROM OLD.persona_id)
     OR (OLD.concessao_id IS NOT NULL AND NEW.concessao_id IS DISTINCT FROM OLD.concessao_id) THEN
    RAISE EXCEPTION 'OAuth v2 record cannot change binding or be reused';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER oauth_v2_record_terminal BEFORE UPDATE ON oauth_registro_v2
  FOR EACH ROW EXECUTE FUNCTION oauth_v2_terminal_record();
