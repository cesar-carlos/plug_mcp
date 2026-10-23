-- External effects have their own journal; SQL operation/source contracts stay separate.
CREATE TABLE external_action_v2 (
  id uuid PRIMARY KEY, persona_id uuid NOT NULL, token_id uuid NOT NULL,
  skill_id uuid NOT NULL, publicacao_id uuid NOT NULL, integracao_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  identity_snapshot jsonb NOT NULL, authorization_hash text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('preparada','aprovacao_pendente','aprovada',
    'executando','concluida','recusada','expirada','cancelada','resultado_desconhecido')),
  exige_aprovacao boolean NOT NULL, expires_at timestamptz NOT NULL,
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0), claimed_at timestamptz,
  payload_enc text, result_enc text, comprovante jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  payload_purge_at timestamptz,
  UNIQUE(persona_id,id),
  FOREIGN KEY(persona_id,token_id) REFERENCES persona_token(persona_id,id),
  FOREIGN KEY(persona_id,skill_id) REFERENCES skill_v2(persona_id,id),
  FOREIGN KEY(persona_id,publicacao_id) REFERENCES publicacao(persona_id,id),
  FOREIGN KEY(persona_id,integracao_id) REFERENCES integracao(persona_id,id),
  CHECK (estado NOT IN ('executando','concluida','resultado_desconhecido') OR claimed_at IS NOT NULL),
  CHECK (estado NOT IN ('concluida','resultado_desconhecido') OR comprovante IS NOT NULL)
);
CREATE INDEX external_action_persona_idx ON external_action_v2(persona_id,id);
CREATE TABLE external_action_approval_v2 (
  persona_id uuid NOT NULL, operacao_id uuid NOT NULL, responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  fingerprint text NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(persona_id,operacao_id),
  FOREIGN KEY(persona_id,operacao_id) REFERENCES external_action_v2(persona_id,id)
);
CREATE FUNCTION protect_external_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.persona_id,NEW.token_id,NEW.skill_id,NEW.publicacao_id,NEW.integracao_id,
    NEW.fingerprint,NEW.identity_snapshot,NEW.authorization_hash,NEW.exige_aprovacao,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.persona_id,OLD.token_id,OLD.skill_id,OLD.publicacao_id,OLD.integracao_id,
    OLD.fingerprint,OLD.identity_snapshot,OLD.authorization_hash,OLD.exige_aprovacao,OLD.expires_at)
    OR NEW.versao <> OLD.versao+1
    OR (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at)
    OR (NEW.payload_enc IS DISTINCT FROM OLD.payload_enc AND (NEW.payload_enc IS NOT NULL
      OR OLD.payload_purge_at IS NULL OR OLD.payload_purge_at > now()))
    OR (OLD.comprovante IS NOT NULL AND NEW.comprovante IS DISTINCT FROM OLD.comprovante)
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
CREATE TRIGGER external_action_immutable BEFORE UPDATE ON external_action_v2
  FOR EACH ROW EXECUTE FUNCTION protect_external_action();
CREATE FUNCTION validate_external_action_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM external_action_v2 a JOIN persona p ON p.id=a.persona_id
    WHERE a.persona_id=NEW.persona_id AND a.id=NEW.operacao_id AND p.ativa
      AND p.responsavel_id=NEW.responsavel_id AND a.estado='aprovacao_pendente'
      AND a.fingerprint=NEW.fingerprint AND NEW.expires_at<=a.expires_at AND NEW.expires_at>now()) THEN
    RAISE EXCEPTION 'Invalid external action approval';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER external_action_approval_owner BEFORE INSERT ON external_action_approval_v2
  FOR EACH ROW EXECUTE FUNCTION validate_external_action_approval();
CREATE TRIGGER external_action_approval_immutable BEFORE UPDATE OR DELETE ON external_action_approval_v2
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
ALTER TABLE audit_v2 ADD COLUMN external_action_id uuid;
ALTER TABLE audit_v2 ADD FOREIGN KEY(persona_id,external_action_id) REFERENCES external_action_v2(persona_id,id);
