-- The migration runner commits all pending files together. Serialize that commit with vault maintenance.
DO $$ BEGIN
 IF NOT pg_try_advisory_xact_lock(19370003)
   OR EXISTS(SELECT 1 FROM persona_vault_rotation_v2 WHERE status='running')
  THEN RAISE EXCEPTION 'Finish vault maintenance before notification upgrade'; END IF;
END $$;
ALTER TABLE outbox_v2 ADD CONSTRAINT outbox_notification_metadata CHECK(notification_version IS NULL OR
 (evento='knowledge.review_due' AND metadata ?& ARRAY['taskId','publicationId','calendarVersion','dueAt']
   AND metadata-ARRAY['taskId','publicationId','calendarVersion','dueAt']='{}'::jsonb
   AND cardinality(aggregate_ids)=2 AND metadata->>'taskId'=aggregate_ids[1]::text AND metadata->>'publicationId'=aggregate_ids[2]::text
   AND jsonb_typeof(metadata->'calendarVersion')='number' AND metadata->>'calendarVersion' ~ '^[1-9][0-9]{0,8}$'
   AND jsonb_typeof(metadata->'dueAt')='string')
 OR (evento IN ('sql.operation_state','external.action_state') AND metadata ?& ARRAY['operationId','state','version']
   AND metadata-ARRAY['operationId','state','version']='{}'::jsonb
   AND cardinality(aggregate_ids)=1 AND metadata->>'operationId'=aggregate_ids[1]::text
   AND jsonb_typeof(metadata->'version')='number' AND metadata->>'version' ~ '^[1-9][0-9]{0,8}$'
   AND metadata->>'state'=ANY(ARRAY['preparada','aprovacao_pendente','aprovada','executando','concluida','recusada','expirada','rollback_confirmado','cancelamento_solicitado','cancelada','resultado_desconhecido'])));
DO $$
DECLARE body text; changed text;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.guard_notification_outbox_v2()'::regprocedure;
 changed := replace(body,'IF OLD.notification_version IS NULL THEN RETURN CASE WHEN TG_OP=''DELETE'' THEN OLD ELSE NEW END; END IF;',
 'IF OLD.notification_version IS NULL THEN
   IF TG_OP=''UPDATE'' AND ROW(NEW.notification_version,NEW.event_key,NEW.metadata) IS DISTINCT FROM ROW(OLD.notification_version,OLD.event_key,OLD.metadata)
    THEN RAISE EXCEPTION ''Historic outbox cannot become a notification''; END IF;
   RETURN CASE WHEN TG_OP=''DELETE'' THEN OLD ELSE NEW END;
  END IF;');
 IF body=changed THEN RAISE EXCEPTION 'Notification guard differs'; END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.guard_notification_outbox_v2() RETURNS trigger LANGUAGE plpgsql AS %L',changed);
END $$;
