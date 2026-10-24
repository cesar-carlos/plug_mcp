ALTER TABLE persona ADD CONSTRAINT persona_owner_identity UNIQUE(id,responsavel_id);
CREATE TABLE responsavel_delegacao_v2 (
  persona_id uuid PRIMARY KEY REFERENCES persona(id),
  responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  hub_id uuid NOT NULL,
  credential_enc text NOT NULL,
  expires_at timestamptz NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  revoked_at timestamptz,
  FOREIGN KEY(persona_id,responsavel_id) REFERENCES persona(id,responsavel_id)
);
CREATE INDEX setup_v2_expiry ON setup_v2(expires_at);
CREATE FUNCTION preserve_setup_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'consumed_at') IS DISTINCT FROM (to_jsonb(OLD)-'consumed_at')
    OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL
  THEN RAISE EXCEPTION 'Setup is immutable except first consumption'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER setup_v2_immutable BEFORE UPDATE ON setup_v2
FOR EACH ROW EXECUTE FUNCTION preserve_setup_v2();
