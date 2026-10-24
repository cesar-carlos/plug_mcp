-- Existing terminal records start their conservative retention window at upgrade.
ALTER TABLE outbox_v2 ADD COLUMN terminal_recorded_at timestamptz,
 ADD COLUMN metadata_removed_at timestamptz;
DROP TRIGGER notification_outbox_integrity ON outbox_v2;
UPDATE outbox_v2 SET terminal_recorded_at=clock_timestamp()
 WHERE notification_version IS NOT NULL AND estado<>'pendente';
DO $$
DECLARE expression text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT expression FROM pg_constraint
  WHERE conrelid='outbox_v2'::regclass AND conname='outbox_notification_metadata';
 ALTER TABLE outbox_v2 DROP CONSTRAINT outbox_notification_metadata;
 EXECUTE format('ALTER TABLE outbox_v2 ADD CONSTRAINT outbox_notification_metadata CHECK
  ((metadata_removed_at IS NULL AND (%s)) OR
   (metadata_removed_at IS NOT NULL AND notification_version IS NOT NULL
    AND estado<>''pendente'' AND terminal_recorded_at IS NOT NULL
    AND metadata=''{}''::jsonb AND destino_enc IS NULL AND segredo_enc IS NULL))',expression);
END $$;

CREATE OR REPLACE FUNCTION guard_notification_outbox_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND public.persona_vault_rewrap_allowed_v2(TG_RELID,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  NEW.metadata_removed_at := NULL;
  NEW.terminal_recorded_at := CASE WHEN NEW.notification_version IS NOT NULL AND NEW.estado<>'pendente' THEN clock_timestamp() ELSE NULL END;
  RETURN NEW;
 END IF;
 IF OLD.notification_version IS NULL THEN
  IF TG_OP='UPDATE' AND ROW(NEW.notification_version,NEW.event_key,NEW.metadata,NEW.terminal_recorded_at,NEW.metadata_removed_at)
   IS DISTINCT FROM ROW(OLD.notification_version,OLD.event_key,OLD.metadata,OLD.terminal_recorded_at,OLD.metadata_removed_at)
   THEN RAISE EXCEPTION 'Historic outbox cannot become a notification'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notification identity is permanent'; END IF;
 IF OLD.estado<>'pendente' AND OLD.metadata_removed_at IS NULL
  AND OLD.terminal_recorded_at<=clock_timestamp()-interval '90 days'
  AND NEW.metadata='{}'::jsonb AND NEW.destino_enc IS NULL AND NEW.segredo_enc IS NULL
  AND NEW.metadata_removed_at IS NOT NULL
  AND (to_jsonb(NEW)-ARRAY['metadata','destino_enc','segredo_enc','metadata_removed_at'])
   =(to_jsonb(OLD)-ARRAY['metadata','destino_enc','segredo_enc','metadata_removed_at'])
 THEN
  NEW.metadata_removed_at := clock_timestamp();
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.persona_id,NEW.evento,NEW.aggregate_ids,NEW.destino_enc,NEW.segredo_enc,NEW.notification_version,NEW.event_key,NEW.metadata,NEW.created_at,NEW.terminal_recorded_at,NEW.metadata_removed_at)
  IS DISTINCT FROM ROW(OLD.id,OLD.persona_id,OLD.evento,OLD.aggregate_ids,OLD.destino_enc,OLD.segredo_enc,OLD.notification_version,OLD.event_key,OLD.metadata,OLD.created_at,OLD.terminal_recorded_at,OLD.metadata_removed_at)
  OR NEW.tentativas<OLD.tentativas OR NEW.tentativas>10
  OR (OLD.estado<>'pendente' AND NEW IS DISTINCT FROM OLD)
  THEN RAISE EXCEPTION 'Notification content or terminal state is immutable'; END IF;
 IF NEW.estado<>'pendente' THEN NEW.terminal_recorded_at := clock_timestamp(); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_outbox_integrity BEFORE UPDATE OR DELETE ON outbox_v2
 FOR EACH ROW EXECUTE FUNCTION guard_notification_outbox_v2();
CREATE TRIGGER notification_outbox_creation BEFORE INSERT ON outbox_v2
 FOR EACH ROW EXECUTE FUNCTION guard_notification_outbox_v2();
CREATE INDEX outbox_notification_retention ON outbox_v2(terminal_recorded_at,id)
 WHERE notification_version IS NOT NULL AND estado<>'pendente' AND metadata_removed_at IS NULL;
