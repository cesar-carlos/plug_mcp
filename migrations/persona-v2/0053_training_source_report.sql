ALTER TABLE interaction_error_report_v2 ADD COLUMN source_report_id uuid
  REFERENCES interaction_error_report_v2(id)
  CHECK (source_report_id IS NULL OR (training_gap IS NOT NULL AND source_report_id <> id));
