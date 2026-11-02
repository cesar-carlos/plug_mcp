ALTER TABLE interaction_error_report_v2 ADD COLUMN training_request_id uuid
  CHECK (training_request_id IS NULL OR training_gap IS NOT NULL);
CREATE UNIQUE INDEX interaction_training_request_once_v2
  ON interaction_error_report_v2(persona_id,token_id,training_request_id)
  WHERE training_request_id IS NOT NULL;
