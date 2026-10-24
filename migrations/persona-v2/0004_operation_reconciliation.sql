-- Append-only metadata evidence. SQL, parameters and returned values never enter this journal.
CREATE TABLE operacao_conciliacao_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL,
  operacao_id uuid NOT NULL,
  operation_version integer NOT NULL CHECK (operation_version > 0),
  evidencia jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (persona_id, operacao_id) REFERENCES operacao_v2(persona_id, id),
  UNIQUE (persona_id,operacao_id,operation_version),
  CHECK ((evidencia->>'classification' IN ('aplicacao_verificada','inconclusiva')) IS TRUE),
  CHECK ((evidencia->>'id' = id::text) IS TRUE),
  CHECK ((evidencia->>'operationId' = operacao_id::text) IS TRUE),
  CHECK (evidencia ?& ARRAY['id','classification','observedAt','publicationId','sourceId','operationId','fingerprint','queryHash','complete','rows']),
  CHECK (evidencia - ARRAY['id','classification','observedAt','publicationId','sourceId','operationId','fingerprint','queryHash','complete','rows'] = '{}'::jsonb),
  CHECK ((evidencia->>'fingerprint' ~ '^[a-f0-9]{64}$') IS TRUE),
  CHECK ((evidencia->>'queryHash' ~ '^[a-f0-9]{64}$') IS TRUE),
  CHECK ((evidencia->>'rows' ~ '^[012]$') IS TRUE),
  CHECK (jsonb_typeof(evidencia->'complete') = 'boolean'),
  CHECK (evidencia->>'classification' <> 'aplicacao_verificada' OR
    (evidencia->'complete' = 'true'::jsonb AND evidencia->>'rows' = '1'))
);
CREATE INDEX operacao_conciliacao_lookup ON operacao_conciliacao_v2(persona_id,operacao_id,operation_version DESC);
CREATE TRIGGER operacao_conciliacao_immutable BEFORE UPDATE OR DELETE ON operacao_conciliacao_v2
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
CREATE FUNCTION check_operation_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM operacao_v2 o WHERE o.persona_id=NEW.persona_id
    AND o.id=NEW.operacao_id AND o.estado='resultado_desconhecido'
    AND o.versao=NEW.operation_version AND o.fingerprint=NEW.evidencia->>'fingerprint'
    AND o.fonte_id::text=NEW.evidencia->>'sourceId'
    AND o.publicacao_id::text=NEW.evidencia->>'publicationId') THEN
    RAISE EXCEPTION 'Reconciliation does not match uncertain operation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operacao_conciliacao_binding BEFORE INSERT ON operacao_conciliacao_v2
  FOR EACH ROW EXECUTE FUNCTION check_operation_reconciliation();
