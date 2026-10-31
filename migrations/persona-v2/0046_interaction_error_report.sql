-- Explicit interaction reports from the consuming AI. Question text is not copied into audit_v2.
CREATE TABLE interaction_error_report_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  token_id uuid NOT NULL,
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 4000),
  category text NOT NULL CHECK (category IN (
    'protocolo','autenticacao','autorizacao','validacao','transporte',
    'consulta','operacao','conhecimento','outro'
  )),
  category_detail text,
  skill_id uuid,
  error_code text NOT NULL CHECK (error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  error_message text NOT NULL CHECK (length(error_message) BETWEEN 1 AND 1000),
  support_id uuid,
  error_source text CHECK (error_source IN (
    'sql','sql_engine','client_token_rpc','plug_server_http','mcp_preflight','mcp','client_agent_access'
  )),
  error_stage text CHECK (error_stage IN ('preflight','cache','hub','sanitize')),
  error_tool text CHECK (error_tool ~ '^[a-z][a-z0-9_]{0,63}$'),
  execution jsonb NOT NULL CHECK (
    jsonb_typeof(execution) = 'object' AND execution ? 'summary' AND execution ? 'steps'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (persona_id, token_id) REFERENCES persona_token(persona_id, id),
  CHECK (
    (category = 'outro' AND category_detail IS NOT NULL AND length(category_detail) BETWEEN 1 AND 200)
    OR (category <> 'outro' AND category_detail IS NULL)
  )
);
CREATE INDEX interaction_error_report_persona_idx
  ON interaction_error_report_v2 (persona_id, created_at DESC, id DESC);
CREATE INDEX interaction_error_report_token_recent_idx
  ON interaction_error_report_v2 (persona_id, token_id, created_at DESC);
CREATE UNIQUE INDEX interaction_error_report_support_idx
  ON interaction_error_report_v2 (persona_id, token_id, support_id)
  WHERE support_id IS NOT NULL;
CREATE FUNCTION preserve_interaction_error_report_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Interaction error report is immutable';
END; $$;
CREATE TRIGGER interaction_error_report_immutable
  BEFORE UPDATE OR DELETE ON interaction_error_report_v2
  FOR EACH ROW EXECUTE FUNCTION preserve_interaction_error_report_v2();
