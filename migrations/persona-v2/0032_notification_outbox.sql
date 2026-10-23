-- Opt-in metadata notifications. No historic outbox row becomes dispatchable.
CREATE TABLE persona_notification_endpoint_v2 (
 persona_id uuid PRIMARY KEY REFERENCES persona(id), owner_id uuid NOT NULL REFERENCES responsavel(id),
 version integer NOT NULL CHECK(version>0), active boolean NOT NULL,
 events text[] NOT NULL CHECK(cardinality(events) BETWEEN 1 AND 3 AND events <@ ARRAY['knowledge.review_due','sql.operation_state','external.action_state']::text[]),
 destino_enc text NOT NULL, segredo_enc text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(persona_id,owner_id)
);
ALTER TABLE outbox_v2 ADD COLUMN notification_version integer,
 ADD COLUMN event_key text, ADD COLUMN metadata jsonb,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN delivered_at timestamptz, ADD COLUMN failure_code text;
ALTER TABLE outbox_v2 ADD CONSTRAINT outbox_notification_shape CHECK
 ((notification_version IS NULL AND event_key IS NULL AND metadata IS NULL)
 OR (notification_version>0 AND event_key IS NOT NULL AND metadata IS NOT NULL
 AND evento IN ('knowledge.review_due','sql.operation_state','external.action_state')
 AND jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=2048));
CREATE UNIQUE INDEX outbox_notification_event ON outbox_v2(persona_id,notification_version,event_key)
 WHERE notification_version IS NOT NULL;
CREATE INDEX outbox_notification_pending ON outbox_v2(available_at,id)
 WHERE notification_version IS NOT NULL AND estado='pendente';

CREATE FUNCTION guard_notification_endpoint_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND public.persona_vault_rewrap_allowed_v2(TG_RELID,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notification configuration history reference is permanent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM persona p WHERE p.id=NEW.persona_id AND p.responsavel_id=NEW.owner_id)
  OR (TG_OP='UPDATE' AND (NEW.persona_id<>OLD.persona_id OR NEW.owner_id<>OLD.owner_id OR NEW.version<>OLD.version+1))
  THEN RAISE EXCEPTION 'Notification ownership or version differs'; END IF;
 NEW.updated_at := clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER notification_endpoint_integrity BEFORE INSERT OR UPDATE OR DELETE ON persona_notification_endpoint_v2
 FOR EACH ROW EXECUTE FUNCTION guard_notification_endpoint_v2();
CREATE TRIGGER aa_vault_key_v2 BEFORE INSERT OR UPDATE ON persona_notification_endpoint_v2
 FOR EACH ROW EXECUTE FUNCTION persona_vault_key_gate_v2('destino_enc','segredo_enc');

-- Append the new target; older rotation cursors keep their meaning. Do not migrate mid-rotation.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM persona_vault_rotation_v2 WHERE status='running')
  THEN RAISE EXCEPTION 'Finish the active vault rotation before notification migration'; END IF;
END $$;
ALTER TABLE persona_vault_rotation_v2 DROP CONSTRAINT persona_vault_rotation_v2_table_index_check;
ALTER TABLE persona_vault_rotation_v2 ADD CHECK(table_index BETWEEN 0 AND 10);
DO $$
DECLARE body text; changed text;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.persona_vault_rewrap_v2(uuid,text,jsonb,jsonb,jsonb)'::regprocedure;
 changed := replace(body, E' ) v(t,f,k) WHERE v.t=table_name;',
 E' ,(''persona_notification_endpoint_v2'',ARRAY[''destino_enc'',''segredo_enc''],ARRAY[''persona_id''])\n ) v(t,f,k) WHERE v.t=table_name;');
 IF changed=body THEN RAISE EXCEPTION 'Vault target inventory differs'; END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.persona_vault_rewrap_v2(run_id uuid,table_name text,row_key jsonb,expected jsonb,replacements jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS %L',changed);
END $$;

CREATE FUNCTION enqueue_persona_notification_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid uuid; event_name text; key text; refs uuid[]; meta jsonb;
BEGIN
 IF TG_TABLE_NAME='knowledge_review_task_v2' THEN
  IF NEW.kind<>'privado' THEN RETURN NEW; END IF;
  SELECT persona_id INTO pid FROM publicacao WHERE id=NEW.publication_id;
  event_name := 'knowledge.review_due'; key := NEW.id::text;
  refs := ARRAY[NEW.id,NEW.publication_id];
  meta := jsonb_build_object('taskId',NEW.id,'publicationId',NEW.publication_id,'calendarVersion',NEW.calendar_version,'dueAt',NEW.due_at);
 ELSE
  IF TG_OP='INSERT' OR NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  pid := NEW.persona_id;
  event_name := CASE WHEN TG_TABLE_NAME='operacao_v2' THEN 'sql.operation_state' ELSE 'external.action_state' END;
  key := NEW.id::text||':'||NEW.versao::text; refs := ARRAY[NEW.id];
  meta := jsonb_build_object('operationId',NEW.id,'state',NEW.estado,'version',NEW.versao);
 END IF;
 INSERT INTO outbox_v2(id,persona_id,evento,aggregate_ids,destino_enc,segredo_enc,estado,notification_version,event_key,metadata)
 SELECT gen_random_uuid(),pid,event_name,refs,e.destino_enc,e.segredo_enc,'pendente',e.version,key,meta
 FROM persona_notification_endpoint_v2 e JOIN persona p ON p.id=e.persona_id
 WHERE e.persona_id=pid AND e.active AND p.ativa AND event_name=ANY(e.events)
 ON CONFLICT(persona_id,notification_version,event_key) WHERE notification_version IS NOT NULL DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER enqueue_review_notification AFTER INSERT ON knowledge_review_task_v2
 FOR EACH ROW EXECUTE FUNCTION enqueue_persona_notification_v2();
CREATE TRIGGER enqueue_sql_notification AFTER UPDATE ON operacao_v2
 FOR EACH ROW EXECUTE FUNCTION enqueue_persona_notification_v2();
CREATE TRIGGER enqueue_external_notification AFTER UPDATE ON external_action_v2
 FOR EACH ROW EXECUTE FUNCTION enqueue_persona_notification_v2();

CREATE FUNCTION guard_notification_outbox_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND public.persona_vault_rewrap_allowed_v2(TG_RELID,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF OLD.notification_version IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notification identity is permanent'; END IF;
 IF ROW(NEW.id,NEW.persona_id,NEW.evento,NEW.aggregate_ids,NEW.destino_enc,NEW.segredo_enc,NEW.notification_version,NEW.event_key,NEW.metadata,NEW.created_at)
  IS DISTINCT FROM ROW(OLD.id,OLD.persona_id,OLD.evento,OLD.aggregate_ids,OLD.destino_enc,OLD.segredo_enc,OLD.notification_version,OLD.event_key,OLD.metadata,OLD.created_at)
  OR NEW.tentativas<OLD.tentativas OR NEW.tentativas>10
  OR (OLD.estado<>'pendente' AND NEW IS DISTINCT FROM OLD)
  THEN RAISE EXCEPTION 'Notification content or terminal state is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_outbox_integrity BEFORE UPDATE OR DELETE ON outbox_v2
 FOR EACH ROW EXECUTE FUNCTION guard_notification_outbox_v2();

CREATE FUNCTION disable_persona_notifications_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.ativa AND NOT NEW.ativa THEN
  UPDATE persona_notification_endpoint_v2 SET active=false,version=version+1 WHERE persona_id=NEW.id AND active;
  UPDATE outbox_v2 SET estado='dead_letter',failure_code='subscription_inactive',lease_owner=NULL,lease_until=NULL
   WHERE persona_id=NEW.id AND notification_version IS NOT NULL AND estado='pendente';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER disable_persona_notifications AFTER UPDATE OF ativa ON persona
 FOR EACH ROW EXECUTE FUNCTION disable_persona_notifications_v2();
