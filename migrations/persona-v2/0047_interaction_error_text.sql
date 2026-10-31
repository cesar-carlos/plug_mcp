-- Separate temporary conversation content from the permanent, immutable receipt.
CREATE TABLE interaction_error_text_v2 (
  id uuid PRIMARY KEY REFERENCES interaction_error_report_v2(id),
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 4000),
  category_detail text CHECK (length(category_detail) BETWEEN 1 AND 200),
  error_message text NOT NULL CHECK (length(error_message) BETWEEN 1 AND 1000),
  execution jsonb NOT NULL CHECK (jsonb_typeof(execution)='object' AND execution ? 'summary' AND execution ? 'steps'),
  expires_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '24 hours')
);
INSERT INTO interaction_error_text_v2(id,question,category_detail,error_message,execution,expires_at)
SELECT id,question,category_detail,error_message,execution,created_at + interval '24 hours'
FROM interaction_error_report_v2 WHERE created_at + interval '24 hours' > CURRENT_TIMESTAMP;
ALTER TABLE interaction_error_report_v2 DROP COLUMN question, DROP COLUMN category_detail,
  DROP COLUMN error_message, DROP COLUMN execution;
CREATE INDEX interaction_error_text_expiry_idx ON interaction_error_text_v2(expires_at,id);
CREATE TRIGGER interaction_error_text_immutable BEFORE UPDATE ON interaction_error_text_v2
  FOR EACH ROW EXECUTE FUNCTION preserve_interaction_error_report_v2();
