-- PDF jobs are operational, encrypted and separate from knowledge/legacy records.
CREATE TABLE persona_pdf_job_v2 (
 id uuid PRIMARY KEY,
 persona_id uuid NOT NULL REFERENCES persona(id),
 token_id uuid NOT NULL,
 namespace text NOT NULL CHECK(namespace ~ '^[a-f0-9]{64}$'),
 scope_hash text NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 request_key_enc text,
 state text NOT NULL CHECK(state IN ('accepted','collecting','captured','rendering','ready','failed','capture_unconfirmed','cancelled','expired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 work_deadline timestamptz NOT NULL,
 artifact_expires_at timestamptz NOT NULL,
 payload_enc text CHECK(payload_enc IS NULL OR octet_length(payload_enc)<=33554432),
 result_enc text CHECK(result_enc IS NULL OR octet_length(result_enc)<=65536),
 artifact_hash text CHECK(artifact_hash IS NULL OR artifact_hash ~ '^[a-f0-9]{64}$'),
 render_token uuid,
 lease_until timestamptz,
 render_attempts smallint NOT NULL DEFAULT 0 CHECK(render_attempts BETWEEN 0 AND 2),
 support_id uuid,
 FOREIGN KEY(persona_id,token_id) REFERENCES persona_token(persona_id,id),
 UNIQUE(namespace,scope_hash,request_hash),
 CHECK(work_deadline>created_at AND work_deadline<=created_at+interval '60 seconds'),
 CHECK(artifact_expires_at>=work_deadline AND artifact_expires_at<=created_at+interval '15 minutes')
);
CREATE INDEX persona_pdf_jobs_pending_v2 ON persona_pdf_job_v2(state,work_deadline,id);
REVOKE ALL ON persona_pdf_job_v2 FROM PUBLIC;
CREATE FUNCTION guard_persona_pdf_job_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active_count bigint; own_count bigint; metadata_count bigint;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PDF tombstones cannot be removed'; END IF;
 IF TG_OP='INSERT' THEN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'PDF quota requires read committed'; END IF;
  PERFORM pg_advisory_xact_lock(19370060);
  SELECT count(*) FILTER(WHERE payload_enc IS NOT NULL),
   count(*) FILTER(WHERE persona_id=NEW.persona_id AND payload_enc IS NOT NULL),count(*)
   INTO active_count,own_count,metadata_count FROM persona_pdf_job_v2;
  IF active_count>=8 OR own_count>=2 OR metadata_count>=100000 THEN
   RAISE EXCEPTION USING ERRCODE='PAV01',MESSAGE='PDF quota exceeded';
  END IF;
  IF NEW.state<>'accepted' OR NEW.payload_enc IS NULL OR NEW.request_key_enc IS NULL THEN RAISE EXCEPTION 'Invalid initial PDF job'; END IF;
  RETURN NEW;
 END IF;
 IF public.persona_vault_rewrap_allowed_v2(TG_RELID,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF ROW(NEW.id,NEW.persona_id,NEW.token_id,NEW.namespace,NEW.scope_hash,NEW.request_hash,NEW.request_fingerprint,NEW.created_at,NEW.work_deadline,NEW.artifact_expires_at)
  IS DISTINCT FROM ROW(OLD.id,OLD.persona_id,OLD.token_id,OLD.namespace,OLD.scope_hash,OLD.request_hash,OLD.request_fingerprint,OLD.created_at,OLD.work_deadline,OLD.artifact_expires_at) THEN
  RAISE EXCEPTION 'Immutable PDF authority or deadline';
 END IF;
 IF NOT ((OLD.state='accepted' AND NEW.state IN ('collecting','failed','cancelled','expired'))
  OR (OLD.state='collecting' AND NEW.state IN ('captured','failed','capture_unconfirmed','cancelled','expired'))
  OR (OLD.state='captured' AND NEW.state IN ('rendering','failed','cancelled','expired'))
  OR (OLD.state='rendering' AND NEW.state IN ('rendering','ready','failed','cancelled','expired'))
  OR (OLD.state='ready' AND NEW.state IN ('cancelled','expired'))
  OR (OLD.state=NEW.state AND NEW.state IN ('failed','capture_unconfirmed','cancelled','expired') AND NEW.payload_enc IS NULL AND NEW.result_enc IS NULL)) THEN
  RAISE EXCEPTION 'Invalid PDF state transition';
 END IF;
 IF NEW.state IN ('captured','rendering','ready') AND clock_timestamp()>=NEW.work_deadline THEN RAISE EXCEPTION 'PDF work expired'; END IF;
 IF NEW.state='ready' AND (NEW.result_enc IS NULL OR NEW.artifact_hash IS NULL OR NEW.payload_enc IS NOT NULL) THEN RAISE EXCEPTION 'Invalid PDF finalization'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON persona_pdf_job_v2
 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('request_key_enc','payload_enc','result_enc');
CREATE TRIGGER pdf_job_integrity_v2 BEFORE INSERT OR UPDATE OR DELETE ON persona_pdf_job_v2
 FOR EACH ROW EXECUTE FUNCTION guard_persona_pdf_job_v2();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM persona_vault_rotation_v2 WHERE status='running') THEN RAISE EXCEPTION 'Finish vault rotation before PDF migration'; END IF;
END $$;
ALTER TABLE persona_vault_rotation_v2 DROP CONSTRAINT persona_vault_rotation_v2_table_index_check;
ALTER TABLE persona_vault_rotation_v2 ADD CHECK(table_index BETWEEN 0 AND 13);
DO $$ DECLARE body text; changed text;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.persona_vault_rewrap_v2(uuid,text,jsonb,jsonb,jsonb)'::regprocedure;
 changed := replace(body,E' ) v(t,f,k) WHERE v.t=table_name;',
 E' ,(''persona_pdf_job_v2'',ARRAY[''request_key_enc'',''payload_enc'',''result_enc''],ARRAY[''id''])\n ) v(t,f,k) WHERE v.t=table_name;');
 IF changed=body THEN RAISE EXCEPTION 'Vault inventory differs'; END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.persona_vault_rewrap_v2(run_id uuid,table_name text,row_key jsonb,expected jsonb,replacements jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS %L',changed);
END $$;
