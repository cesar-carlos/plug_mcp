-- Keep journal identities forever; only known-terminal operational content expires.
ALTER TABLE operacao_v2 ADD COLUMN terminal_at timestamptz,
  ADD COLUMN payload_purged_at timestamptz, ADD COLUMN receipt_purged_at timestamptz;
ALTER TABLE external_action_v2 ADD COLUMN terminal_at timestamptz,
  ADD COLUMN payload_purged_at timestamptz, ADD COLUMN receipt_purged_at timestamptz;
-- Historic rows have no immutable local completion clock. Start conservatively now.
UPDATE operacao_v2 SET terminal_at=statement_timestamp(),
  payload_purge_at=statement_timestamp()+interval '24 hours',versao=versao+1
  WHERE estado IN ('concluida','rollback_confirmado','cancelada','recusada','expirada');
UPDATE external_action_v2 SET terminal_at=statement_timestamp(),
  payload_purge_at=statement_timestamp()+interval '24 hours',versao=versao+1
  WHERE estado IN ('concluida','cancelada','recusada','expirada');

ALTER TABLE external_action_v2 DROP CONSTRAINT external_action_v2_check1;
ALTER TABLE external_action_v2 ADD CONSTRAINT external_action_retained_receipt CHECK
  (estado NOT IN ('concluida','resultado_desconhecido') OR comprovante IS NOT NULL
    OR (estado='concluida' AND receipt_purged_at IS NOT NULL));

CREATE FUNCTION guard_operation_retention() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  known_terminal boolean;
  payload_removed boolean;
  receipt_removed boolean;
  retention_now timestamptz := clock_timestamp();
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Operation replay tombstone is permanent'; END IF;
  known_terminal := NEW.estado IN ('concluida','rollback_confirmado','cancelada','recusada','expirada');
  IF TG_OP='INSERT' THEN
    IF NEW.terminal_at IS NOT NULL OR NEW.payload_purged_at IS NOT NULL OR NEW.receipt_purged_at IS NOT NULL
      THEN RAISE EXCEPTION 'Retention markers are server controlled'; END IF;
    NEW.terminal_at := CASE WHEN known_terminal THEN retention_now ELSE NULL END;
    NEW.payload_purge_at := CASE WHEN known_terminal THEN retention_now+interval '24 hours' ELSE NULL END;
    RETURN NEW;
  END IF;
  IF ROW(NEW.terminal_at,NEW.payload_purged_at,NEW.receipt_purged_at)
    IS DISTINCT FROM ROW(OLD.terminal_at,OLD.payload_purged_at,OLD.receipt_purged_at)
    THEN RAISE EXCEPTION 'Retention markers are immutable'; END IF;
  IF OLD.terminal_at IS NULL AND known_terminal THEN
    NEW.terminal_at := retention_now;
    NEW.payload_purge_at := retention_now+interval '24 hours';
  ELSIF OLD.terminal_at IS NOT NULL THEN
    IF NEW.payload_purge_at IS DISTINCT FROM OLD.payload_purge_at
      THEN RAISE EXCEPTION 'Retention deadline is immutable'; END IF;
  ELSE
    NEW.payload_purge_at := NULL;
  END IF;
  payload_removed := OLD.payload_enc IS NOT NULL AND NEW.payload_enc IS NULL;
  IF TG_TABLE_NAME='external_action_v2' THEN
    payload_removed := payload_removed OR (OLD.result_enc IS NOT NULL AND NEW.result_enc IS NULL);
    IF OLD.payload_purged_at IS NOT NULL AND NEW.result_enc IS NOT NULL
      THEN RAISE EXCEPTION 'Purged result cannot be restored'; END IF;
    IF payload_removed AND (NEW.payload_enc IS NOT NULL OR NEW.result_enc IS NOT NULL)
      THEN RAISE EXCEPTION 'External payload and result must be purged together'; END IF;
  END IF;
  IF OLD.payload_purged_at IS NOT NULL AND NEW.payload_enc IS NOT NULL
    THEN RAISE EXCEPTION 'Purged payload cannot be restored'; END IF;
  IF OLD.receipt_purged_at IS NOT NULL AND NEW.comprovante IS NOT NULL
    THEN RAISE EXCEPTION 'Purged receipt cannot be restored'; END IF;
  receipt_removed := OLD.comprovante IS NOT NULL AND NEW.comprovante IS NULL;
  IF payload_removed OR receipt_removed THEN
    IF NOT known_terminal OR NEW.estado IS DISTINCT FROM OLD.estado OR OLD.terminal_at IS NULL
      OR NEW.versao<>OLD.versao+1
      THEN RAISE EXCEPTION 'Retention requires a known terminal operation and CAS'; END IF;
  END IF;
  IF payload_removed THEN
    IF OLD.payload_purge_at IS NULL OR OLD.payload_purge_at>retention_now
      OR OLD.terminal_at+interval '24 hours'>retention_now
      THEN RAISE EXCEPTION 'Payload retention has not elapsed'; END IF;
    NEW.payload_purged_at := retention_now;
  END IF;
  IF receipt_removed THEN
    IF OLD.terminal_at+interval '90 days'>retention_now OR NEW.payload_enc IS NOT NULL
      THEN RAISE EXCEPTION 'Receipt retention has not elapsed'; END IF;
    IF TG_TABLE_NAME='external_action_v2' THEN
      IF NEW.result_enc IS NOT NULL THEN RAISE EXCEPTION 'Operational result must expire before receipt'; END IF;
    END IF;
    NEW.receipt_purged_at := retention_now;
  END IF;
  RETURN NEW;
END $$;
-- Alphabetic trigger order stamps/validates markers before the original integrity guards.
CREATE TRIGGER a_operation_retention BEFORE INSERT OR UPDATE OR DELETE ON operacao_v2
  FOR EACH ROW EXECUTE FUNCTION guard_operation_retention();
CREATE TRIGGER a_operation_retention BEFORE INSERT OR UPDATE OR DELETE ON external_action_v2
  FOR EACH ROW EXECUTE FUNCTION guard_operation_retention();

CREATE OR REPLACE FUNCTION protect_operation_preparation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.versao <> OLD.versao+1 THEN
    RAISE EXCEPTION 'Operation transition requires version increment';
  END IF;
  IF OLD.comprovante IS NOT NULL AND NEW.comprovante IS DISTINCT FROM OLD.comprovante
    AND OLD.estado <> 'resultado_desconhecido' AND NEW.receipt_purged_at IS NULL THEN
    RAISE EXCEPTION 'Immutable terminal operation receipt';
  END IF;
  IF ROW(NEW.persona_id,NEW.token_id,NEW.publicacao_id,NEW.fonte_id,NEW.integracao_operacao_id,
      NEW.fingerprint,NEW.authorization_snapshot,NEW.exige_aprovacao,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.persona_id,OLD.token_id,OLD.publicacao_id,OLD.fonte_id,OLD.integracao_operacao_id,
      OLD.fingerprint,OLD.authorization_snapshot,OLD.exige_aprovacao,OLD.expires_at)
    OR (NEW.payload_enc IS DISTINCT FROM OLD.payload_enc AND NEW.payload_enc IS NOT NULL)
    OR (NEW.payload_enc IS NULL AND OLD.payload_enc IS NOT NULL AND
      (OLD.payload_purge_at IS NULL OR OLD.payload_purge_at > now() OR OLD.estado NOT IN
      ('concluida','rollback_confirmado','cancelada','recusada','expirada'))) THEN
    RAISE EXCEPTION 'Immutable operation preparation';
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (
    (OLD.estado='preparada' AND NEW.estado IN ('executando','expirada','recusada','cancelada')) OR
    (OLD.estado='aprovacao_pendente' AND NEW.estado IN ('aprovada','expirada','recusada','cancelada')) OR
    (OLD.estado='aprovada' AND NEW.estado IN ('executando','expirada','recusada','cancelada')) OR
    (OLD.estado='executando' AND NEW.estado IN ('concluida','rollback_confirmado','resultado_desconhecido','cancelamento_solicitado','cancelada')) OR
    (OLD.estado='cancelamento_solicitado' AND NEW.estado IN ('concluida','rollback_confirmado','resultado_desconhecido','cancelada')) OR
    (OLD.estado='resultado_desconhecido' AND NEW.estado IN ('concluida','rollback_confirmado'))
  ) THEN RAISE EXCEPTION 'Invalid operation transition'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION protect_external_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.persona_id,NEW.token_id,NEW.skill_id,NEW.publicacao_id,NEW.integracao_id,
    NEW.fingerprint,NEW.identity_snapshot,NEW.authorization_hash,NEW.exige_aprovacao,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.persona_id,OLD.token_id,OLD.skill_id,OLD.publicacao_id,OLD.integracao_id,
    OLD.fingerprint,OLD.identity_snapshot,OLD.authorization_hash,OLD.exige_aprovacao,OLD.expires_at)
    OR NEW.versao <> OLD.versao+1
    OR (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at)
    OR (NEW.payload_enc IS DISTINCT FROM OLD.payload_enc AND (NEW.payload_enc IS NOT NULL
      OR OLD.payload_purge_at IS NULL OR OLD.payload_purge_at > now()))
    OR (OLD.comprovante IS NOT NULL AND NEW.comprovante IS DISTINCT FROM OLD.comprovante AND NEW.receipt_purged_at IS NULL)
    OR (OLD.result_enc IS NOT NULL AND NEW.result_enc IS DISTINCT FROM OLD.result_enc AND
      (NEW.result_enc IS NOT NULL OR OLD.payload_purge_at IS NULL OR OLD.payload_purge_at > now())) THEN
    RAISE EXCEPTION 'Immutable external action preparation or receipt';
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (
    (OLD.estado='preparada' AND NEW.estado IN ('executando','expirada','cancelada','recusada')) OR
    (OLD.estado='aprovacao_pendente' AND NEW.estado IN ('aprovada','expirada','cancelada','recusada')) OR
    (OLD.estado='aprovada' AND NEW.estado IN ('executando','expirada','cancelada','recusada')) OR
    (OLD.estado='executando' AND NEW.estado IN ('concluida','resultado_desconhecido'))
  ) THEN RAISE EXCEPTION 'Invalid external action transition'; END IF;
  RETURN NEW;
END $$;

CREATE TABLE persona_retention_worker_lease_v2 (
  name text PRIMARY KEY CHECK(name='operation-retention'), owner uuid NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX operation_retention_terminal_idx ON operacao_v2(terminal_at,id) WHERE terminal_at IS NOT NULL;
CREATE INDEX external_retention_terminal_idx ON external_action_v2(terminal_at,id) WHERE terminal_at IS NOT NULL;
