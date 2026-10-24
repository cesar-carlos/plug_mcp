-- SQL and external journals have independent ID spaces. Deduplicate within the event kind.
CREATE FUNCTION namespace_notification_event_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.notification_version IS NOT NULL THEN NEW.event_key := NEW.evento||':'||NEW.event_key; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_event_namespace BEFORE INSERT ON outbox_v2
 FOR EACH ROW EXECUTE FUNCTION namespace_notification_event_v2();
