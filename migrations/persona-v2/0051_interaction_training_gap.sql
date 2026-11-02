ALTER TABLE interaction_error_report_v2
  ADD COLUMN training_gap text CHECK (
    training_gap IS NULL OR (
      training_gap IN ('metrica','relacionamento','regra','modelo','outra')
      AND category = 'conhecimento' AND error_code = 'TRAINING_REQUEST'
      AND support_id IS NULL
    )
  );
