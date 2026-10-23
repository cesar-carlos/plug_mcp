-- New notifications reference the exact live endpoint version instead of copying old-key envelopes.
-- This keeps receipt persistence independent of where a vault rotation cursor currently is.
ALTER TABLE outbox_v2 ALTER COLUMN destino_enc DROP NOT NULL, ALTER COLUMN segredo_enc DROP NOT NULL;
ALTER TABLE outbox_v2 ADD CHECK((destino_enc IS NULL)=(segredo_enc IS NULL));
ALTER TABLE outbox_v2 ADD CHECK(notification_version IS NOT NULL OR (destino_enc IS NOT NULL AND segredo_enc IS NOT NULL));
DO $$
DECLARE body text; changed text;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.enqueue_persona_notification_v2()'::regprocedure;
 changed := replace(body,'refs,e.destino_enc,e.segredo_enc,''pendente''','refs,NULL::text,NULL::text,''pendente''');
 IF body=changed THEN RAISE EXCEPTION 'Notification producer differs'; END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.enqueue_persona_notification_v2() RETURNS trigger LANGUAGE plpgsql AS %L',changed);
END $$;
