ALTER TABLE interaction_error_report_v2
  DROP CONSTRAINT interaction_error_report_v2_error_stage_check,
  ADD CONSTRAINT interaction_error_report_v2_error_stage_check
    CHECK (error_stage IN ('preflight','cache','hub','sanitize','protocol','authentication','request'));
