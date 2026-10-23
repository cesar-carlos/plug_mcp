-- Operational content only. No raw handle, plaintext, credentials or business SQL.
CREATE TABLE persona_attachment_v2 (
 handle_hash text PRIMARY KEY CHECK(handle_hash ~ '^[a-f0-9]{64}$'),
 namespace text NOT NULL CHECK(namespace ~ '^[a-f0-9]{64}$'),
 scope_hash text NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 payload_enc text NOT NULL CHECK(octet_length(payload_enc) BETWEEN 1 AND 33554432
  AND payload_enc ~ '^v2\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes')
);
CREATE INDEX persona_attachment_expiry_v2 ON persona_attachment_v2(expires_at,handle_hash);
CREATE INDEX persona_attachment_scope_v2 ON persona_attachment_v2(namespace,scope_hash,expires_at);
REVOKE ALL ON persona_attachment_v2 FROM PUBLIC;

CREATE FUNCTION guard_persona_attachment_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total_count bigint; total_bytes bigint; own_count bigint; own_bytes bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF public.persona_vault_rewrap_allowed_v2(TG_RELID,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Attachment content, binding and deadline are immutable';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Attachment quota requires read committed isolation';
 END IF;
 -- A single fleet-wide gate avoids quota races between instances and consumers.
 PERFORM pg_advisory_xact_lock(19370009);
 NEW.created_at := clock_timestamp();
 IF NEW.expires_at<=NEW.created_at OR NEW.expires_at>NEW.created_at+interval '15 minutes' THEN
  RAISE EXCEPTION 'Invalid attachment deadline';
 END IF;
 SELECT count(*),coalesce(sum(octet_length(payload_enc)),0),
  count(*) FILTER(WHERE namespace=NEW.namespace AND scope_hash=NEW.scope_hash),
  coalesce(sum(octet_length(payload_enc)) FILTER(WHERE namespace=NEW.namespace AND scope_hash=NEW.scope_hash),0)
 INTO total_count,total_bytes,own_count,own_bytes FROM persona_attachment_v2;
 IF total_count>=64 OR total_bytes+octet_length(NEW.payload_enc)>134217728
  OR own_count>=8 OR own_bytes+octet_length(NEW.payload_enc)>33554432 THEN
  RAISE EXCEPTION USING ERRCODE='PAV01',MESSAGE='Attachment quota exceeded';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON persona_attachment_v2
 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('payload_enc');
CREATE TRIGGER attachment_integrity_v2 BEFORE INSERT OR UPDATE ON persona_attachment_v2
 FOR EACH ROW EXECUTE FUNCTION guard_persona_attachment_v2();

-- Append only, preserving prior cursor meanings. Never migrate an active rotation.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM persona_vault_rotation_v2 WHERE status='running') THEN
  RAISE EXCEPTION 'Finish the active vault rotation before shared attachment migration';
 END IF;
END $$;
ALTER TABLE persona_vault_rotation_v2 DROP CONSTRAINT persona_vault_rotation_v2_table_index_check;
ALTER TABLE persona_vault_rotation_v2 ADD CHECK(table_index BETWEEN 0 AND 11);
DO $$
DECLARE body text; changed text;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.persona_vault_rewrap_v2(uuid,text,jsonb,jsonb,jsonb)'::regprocedure;
 changed := replace(body, E' ) v(t,f,k) WHERE v.t=table_name;',
 E' ,(''persona_attachment_v2'',ARRAY[''payload_enc''],ARRAY[''handle_hash''])\n ) v(t,f,k) WHERE v.t=table_name;');
 IF changed=body THEN RAISE EXCEPTION 'Vault target inventory differs'; END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.persona_vault_rewrap_v2(run_id uuid,table_name text,row_key jsonb,expected jsonb,replacements jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS %L',changed);
END $$;
