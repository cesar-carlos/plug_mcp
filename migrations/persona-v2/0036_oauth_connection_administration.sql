-- Historic connection dates are unknown; never invent them from migration time.
ALTER TABLE oauth_concessao_v2 ADD COLUMN created_at timestamptz;
ALTER TABLE oauth_concessao_v2 ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE INDEX oauth_connection_persona_page ON oauth_concessao_v2(persona_id,created_at DESC,id DESC);
ALTER TABLE audit_v2 ADD COLUMN oauth_grant_id uuid;
ALTER TABLE audit_v2 ADD FOREIGN KEY(persona_id,oauth_grant_id) REFERENCES oauth_concessao_v2(persona_id,id);
CREATE FUNCTION preserve_oauth_connection_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'OAuth revocation identity is permanent'; END IF;
 IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'OAuth creation clock is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER oauth_connection_history BEFORE UPDATE OR DELETE ON oauth_concessao_v2
 FOR EACH ROW EXECUTE FUNCTION preserve_oauth_connection_v2();
