-- A no-op update of a terminal notification must not restart retention.
DO $$
DECLARE body text; changed text;
BEGIN
 SELECT prosrc INTO STRICT body FROM pg_proc
  WHERE oid='public.guard_notification_outbox_v2()'::regprocedure;
 changed := replace(body,
  'IF NEW.estado<>''pendente'' THEN NEW.terminal_recorded_at := clock_timestamp(); END IF;',
  'IF OLD.estado=''pendente'' AND NEW.estado<>''pendente'' THEN NEW.terminal_recorded_at := clock_timestamp(); END IF;');
 IF changed=body THEN RAISE EXCEPTION 'Notification terminal clock guard differs'; END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.guard_notification_outbox_v2() RETURNS trigger LANGUAGE plpgsql AS %L',changed);
END $$;
