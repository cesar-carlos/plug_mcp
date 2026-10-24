-- Operator-only maintenance. No role, key, credentials or seed data are created here.
CREATE TABLE persona_vault_key_binding_v2 (
 key_id text PRIMARY KEY CHECK(key_id ~ '^[A-Za-z0-9_-]{1,64}$'),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$')
);
CREATE TABLE persona_vault_active_key_v2 (
 singleton boolean PRIMARY KEY CHECK(singleton), key_id text NOT NULL REFERENCES persona_vault_key_binding_v2(key_id)
);
CREATE TABLE persona_vault_rotation_v2 (
 id uuid PRIMARY KEY, key_id text NOT NULL REFERENCES persona_vault_key_binding_v2(key_id),
 fingerprint text NOT NULL, required_keys text[] NOT NULL, status text NOT NULL CHECK(status IN ('running','completed')),
 table_index integer NOT NULL DEFAULT 0 CHECK(table_index BETWEEN 0 AND 9), cursor jsonb,
 checked bigint NOT NULL DEFAULT 0 CHECK(checked>=0), changed bigint NOT NULL DEFAULT 0 CHECK(changed>=0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX persona_vault_single_rotation ON persona_vault_rotation_v2((true)) WHERE status='running';
CREATE TABLE persona_vault_rewrap_permit_v2 (
 backend integer NOT NULL, transaction_id xid8 NOT NULL, relation oid NOT NULL,
 before_hash bytea NOT NULL, after_hash bytea NOT NULL, PRIMARY KEY(backend,transaction_id,relation)
);
REVOKE ALL ON persona_vault_key_binding_v2,persona_vault_active_key_v2,
 persona_vault_rotation_v2,persona_vault_rewrap_permit_v2 FROM PUBLIC;

CREATE FUNCTION persona_vault_operator_v2() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN to_regrole('persona_v2_vault_operator') IS NULL THEN false
 ELSE pg_has_role(session_user,to_regrole('persona_v2_vault_operator'),'MEMBER') END
$$;
CREATE FUNCTION persona_vault_keyring_matches_v2(active_id text,bindings jsonb) RETURNS boolean
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.persona_vault_active_key_v2 WHERE singleton)
 OR (EXISTS(SELECT 1 FROM public.persona_vault_active_key_v2 a
   JOIN public.persona_vault_key_binding_v2 b ON b.key_id=a.key_id
   WHERE a.singleton AND a.key_id=active_id AND bindings->>b.key_id=b.fingerprint)
  AND NOT EXISTS(SELECT 1 FROM public.persona_vault_rotation_v2 r,
    unnest(r.required_keys) k JOIN public.persona_vault_key_binding_v2 b ON b.key_id=k
    WHERE r.status='running' AND bindings->>k IS DISTINCT FROM b.fingerprint))
$$;
CREATE FUNCTION persona_vault_rewrap_allowed_v2(rel oid,before_row jsonb,after_row jsonb)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.persona_vault_operator_v2() AND EXISTS(
  SELECT 1 FROM public.persona_vault_rewrap_permit_v2 p WHERE p.backend=pg_backend_pid()
   AND p.transaction_id=pg_current_xact_id() AND p.relation=rel
   AND p.before_hash=sha256(convert_to(before_row::text,'UTF8'))
   AND p.after_hash=sha256(convert_to(after_row::text,'UTF8')))
$$;

CREATE FUNCTION persona_vault_key_gate_v2() RETURNS trigger LANGUAGE plpgsql
 SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE active_id text; field text; new_value text; old_value text;
BEGIN
 SELECT key_id INTO active_id FROM public.persona_vault_active_key_v2 WHERE singleton FOR SHARE;
 IF active_id IS NULL THEN RETURN NEW; END IF;
 FOREACH field IN ARRAY TG_ARGV LOOP
  new_value := to_jsonb(NEW)->>field;
  old_value := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>field ELSE NULL END;
  IF new_value IS NOT NULL AND new_value IS DISTINCT FROM old_value
    AND split_part(new_value,'.',1)||'.'||split_part(new_value,'.',2)<>'v2.'||active_id
   THEN RAISE EXCEPTION 'Cipher key differs from active persona vault key'; END IF;
 END LOOP;
 RETURN NEW;
END $$;

CREATE FUNCTION persona_vault_rewrap_v2(run_id uuid,table_name text,row_key jsonb,expected jsonb,replacements jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE fields text[]; keys text[]; key_expr text; assignments text; current_row jsonb;
 next_row jsonb; field text; target text; affected integer;
BEGIN
 IF NOT public.persona_vault_operator_v2() OR NOT EXISTS(
   SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted
    AND classid=0 AND objid=19370003 AND objsubid=1 AND mode='ExclusiveLock')
  THEN RAISE EXCEPTION 'Vault operator and session lock required'; END IF;
 SELECT r.key_id INTO target FROM public.persona_vault_rotation_v2 r
  JOIN public.persona_vault_active_key_v2 a ON a.key_id=r.key_id AND a.singleton
  JOIN public.persona_vault_key_binding_v2 b ON b.key_id=r.key_id AND b.fingerprint=r.fingerprint
  WHERE r.id=run_id AND r.status='running' FOR UPDATE OF r;
 IF target IS NULL THEN RAISE EXCEPTION 'Vault rotation binding changed'; END IF;
 SELECT v.f,v.k INTO fields,keys FROM (VALUES
  ('fonte_credencial',ARRAY['email_enc','senha_enc','client_token_enc'],ARRAY['id']),
  ('integracao',ARRAY['credencial_enc'],ARRAY['id']),
  ('responsavel_delegacao_v2',ARRAY['credential_enc'],ARRAY['persona_id']),
  ('operacao_v2',ARRAY['payload_enc'],ARRAY['id']),
  ('external_action_v2',ARRAY['payload_enc','result_enc'],ARRAY['id']),
  ('outbox_v2',ARRAY['destino_enc','segredo_enc'],ARRAY['id']),
  ('setup_v2',ARRAY['contexto_enc'],ARRAY['code_hash']),
  ('oauth_registro_v2',ARRAY['conteudo_enc'],ARRAY['id_hash']),
  ('knowledge_library_version_v2',ARRAY['payload_enc'],ARRAY['catalog_id','library_id','version'])
 ) v(t,f,k) WHERE v.t=table_name;
 IF fields IS NULL OR jsonb_typeof(replacements)<>'object' OR replacements='{}'::jsonb
   OR replacements-fields<>'{}'::jsonb THEN RAISE EXCEPTION 'Unknown vault target'; END IF;
 SELECT 'jsonb_build_object('||string_agg(format('%L,t.%I',k,k),',')||')' INTO key_expr FROM unnest(keys) k;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %s=$1 FOR UPDATE',table_name,key_expr)
  INTO current_row USING row_key;
 IF current_row IS NULL OR current_row IS DISTINCT FROM expected THEN RETURN false; END IF;
 FOR field IN SELECT jsonb_object_keys(replacements) LOOP
  IF current_row->>field IS NULL OR jsonb_typeof(replacements->field)<>'string'
    OR split_part(replacements->>field,'.',1)||'.'||split_part(replacements->>field,'.',2)<>'v2.'||target
   THEN RAISE EXCEPTION 'Invalid rewrap envelope'; END IF;
 END LOOP;
 next_row := current_row||replacements;
 INSERT INTO public.persona_vault_rewrap_permit_v2 VALUES(pg_backend_pid(),pg_current_xact_id(),
   format('public.%I',table_name)::regclass,sha256(convert_to(current_row::text,'UTF8')),sha256(convert_to(next_row::text,'UTF8')));
 SELECT string_agg(format('%I=$3->>%L',k,k),',') INTO assignments FROM jsonb_object_keys(replacements) k;
 EXECUTE format('UPDATE public.%I t SET %s WHERE %s=$1 AND to_jsonb(t)=$2',table_name,assignments,key_expr)
  USING row_key,expected,replacements;
 GET DIAGNOSTICS affected=ROW_COUNT;
 DELETE FROM public.persona_vault_rewrap_permit_v2 WHERE backend=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 RETURN affected=1;
END $$;

-- Preserve the exact installed guards; prepend only a narrowly bound rewrap exception.
DO $$
DECLARE name text; body text; changed text;
BEGIN
 FOREACH name IN ARRAY ARRAY['protect_operation_preparation','protect_external_action','preserve_setup_v2',
   'oauth_v2_terminal_record','knowledge_library_immutable_v2'] LOOP
  SELECT prosrc INTO body FROM pg_proc WHERE oid=format('public.%I()',name)::regprocedure;
  changed := regexp_replace(body,'\mBEGIN\M',E'BEGIN\n IF TG_OP=''UPDATE'' AND public.persona_vault_rewrap_allowed_v2(TG_RELID,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;','i');
  IF changed=body THEN RAISE EXCEPTION 'Vault integrity guard missing'; END IF;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql AS %L',name,changed);
 END LOOP;
END $$;
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON fonte_credencial FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('email_enc','senha_enc','client_token_enc');
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON integracao FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('credencial_enc');
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON responsavel_delegacao_v2 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('credential_enc');
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON operacao_v2 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('payload_enc');
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON external_action_v2 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('payload_enc','result_enc');
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON outbox_v2 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('destino_enc','segredo_enc');
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON setup_v2 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('contexto_enc');
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON oauth_registro_v2 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('conteudo_enc');
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON knowledge_library_version_v2 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('payload_enc');
