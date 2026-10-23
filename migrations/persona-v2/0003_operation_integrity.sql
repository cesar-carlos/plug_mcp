-- Preparations/approvals cannot be rewritten or resurrected after dispatch.
CREATE FUNCTION protect_operation_preparation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.versao <> OLD.versao+1 THEN
    RAISE EXCEPTION 'Operation transition requires version increment';
  END IF;
  IF OLD.comprovante IS NOT NULL AND NEW.comprovante IS DISTINCT FROM OLD.comprovante
    AND OLD.estado <> 'resultado_desconhecido' THEN
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
CREATE TRIGGER operacao_v2_immutable BEFORE UPDATE ON operacao_v2
  FOR EACH ROW EXECUTE FUNCTION protect_operation_preparation();
CREATE TRIGGER aprovacao_v2_immutable BEFORE UPDATE OR DELETE ON aprovacao_v2
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
CREATE INDEX operacao_v2_payload_purge_idx ON operacao_v2(payload_purge_at)
  WHERE payload_enc IS NOT NULL AND payload_purge_at IS NOT NULL;
