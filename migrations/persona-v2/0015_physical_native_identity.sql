-- fonte_fisica.identity_hash is hub-scoped, not the native proof hash.
-- Keep the two identities distinct and enforce their verified association.
CREATE TABLE physical_native_identity_v2 (
 physical_source_id uuid PRIMARY KEY REFERENCES fonte_fisica(id),
 identity_hash text NOT NULL CHECK(identity_hash ~ '^[a-f0-9]{64}$'),
 UNIQUE(physical_source_id,identity_hash)
);
INSERT INTO physical_native_identity_v2(physical_source_id,identity_hash)
 SELECT DISTINCT fonte_fisica_id,identity_hash FROM fonte WHERE identity_hash IS NOT NULL;
CREATE FUNCTION preserve_physical_native_identity_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.identity_hash IS NOT NULL THEN
  INSERT INTO physical_native_identity_v2(physical_source_id,identity_hash)
   VALUES(NEW.fonte_fisica_id,NEW.identity_hash) ON CONFLICT(physical_source_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM physical_native_identity_v2 WHERE physical_source_id=NEW.fonte_fisica_id AND identity_hash=NEW.identity_hash) THEN
   RAISE EXCEPTION 'Physical source native identity differs';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER fonte_native_identity_v2 BEFORE INSERT OR UPDATE OF fonte_fisica_id,identity_hash ON fonte
 FOR EACH ROW EXECUTE FUNCTION preserve_physical_native_identity_v2();
ALTER TABLE physical_profile_v2 DROP CONSTRAINT physical_profile_v2_physical_source_id_identity_hash_fkey;
ALTER TABLE physical_profile_v2 ADD CONSTRAINT profile_native_identity_fk
 FOREIGN KEY(physical_source_id,identity_hash) REFERENCES physical_native_identity_v2(physical_source_id,identity_hash);
