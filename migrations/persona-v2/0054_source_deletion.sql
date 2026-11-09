-- Audit identities survive removal of an unused source without retaining its configuration.
CREATE TABLE fonte_audit_identity_v2 (
 persona_id uuid NOT NULL REFERENCES persona(id),
 id uuid NOT NULL UNIQUE,
 PRIMARY KEY(persona_id,id)
);
INSERT INTO fonte_audit_identity_v2(persona_id,id) SELECT persona_id,id FROM fonte;
ALTER TABLE audit_v2 DROP CONSTRAINT audit_v2_persona_id_fonte_id_fkey;
ALTER TABLE audit_v2 ADD CONSTRAINT audit_v2_source_identity_fkey
 FOREIGN KEY(persona_id,fonte_id) REFERENCES fonte_audit_identity_v2(persona_id,id);
CREATE FUNCTION preserve_source_audit_identity_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO fonte_audit_identity_v2(persona_id,id) VALUES(NEW.persona_id,NEW.id);
 RETURN NEW;
END $$;
CREATE TRIGGER source_audit_identity_v2 BEFORE INSERT ON fonte
 FOR EACH ROW EXECUTE FUNCTION preserve_source_audit_identity_v2();
