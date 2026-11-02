CREATE TABLE persona_saved_query_v2 (
 id uuid PRIMARY KEY,
 persona_id uuid NOT NULL REFERENCES persona(id),
 slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 100),
 name_hash text NOT NULL CHECK (name_hash ~ '^[a-f0-9]{64}$'),
 receipt_hash text NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
 revision uuid NOT NULL,
 payload_enc text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(persona_id,slot),
 UNIQUE(persona_id,name_hash),
 UNIQUE(persona_id,receipt_hash)
);
REVOKE ALL ON persona_saved_query_v2 FROM PUBLIC;
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON persona_saved_query_v2
 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('payload_enc');
-- Append only, preserving prior cursor meanings. Never migrate an active rotation.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM persona_vault_rotation_v2 WHERE status='running') THEN
  RAISE EXCEPTION 'Finish the active vault rotation before saved query migration';
 END IF;
END $$;
ALTER TABLE persona_vault_rotation_v2 DROP CONSTRAINT persona_vault_rotation_v2_table_index_check;
ALTER TABLE persona_vault_rotation_v2 ADD CHECK(table_index BETWEEN 0 AND 12);
DO $$
DECLARE body text; changed text;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.persona_vault_rewrap_v2(uuid,text,jsonb,jsonb,jsonb)'::regprocedure;
 changed := replace(body, E' ) v(t,f,k) WHERE v.t=table_name;',
 E' ,(''persona_saved_query_v2'',ARRAY[''payload_enc''],ARRAY[''id''])\n ) v(t,f,k) WHERE v.t=table_name;');
 IF changed=body THEN RAISE EXCEPTION 'Vault target inventory differs'; END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.persona_vault_rewrap_v2(run_id uuid,table_name text,row_key jsonb,expected jsonb,replacements jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS %L',changed);
END $$;
