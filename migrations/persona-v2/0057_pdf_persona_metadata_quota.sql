-- Prevent one persona from permanently consuming the global idempotency budget.
-- Existing tombstones remain immutable; reaching this quota requires operator planning,
-- not deleting history or silently making old request IDs executable again.
CREATE INDEX persona_pdf_jobs_persona_v2 ON persona_pdf_job_v2(persona_id);
CREATE FUNCTION guard_persona_pdf_metadata_quota_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(19370060);
 IF (SELECT count(*) FROM persona_pdf_job_v2 WHERE persona_id=NEW.persona_id)>=1000 THEN
  RAISE EXCEPTION USING ERRCODE='PAV01',MESSAGE='PDF quota exceeded';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pdf_job_persona_quota_v2 BEFORE INSERT ON persona_pdf_job_v2
 FOR EACH ROW EXECUTE FUNCTION guard_persona_pdf_metadata_quota_v2();
