ALTER TABLE coluna_grafo ADD COLUMN IF NOT EXISTS nullable boolean;

ALTER TABLE skill ADD COLUMN IF NOT EXISTS pacote_versao integer NOT NULL DEFAULT 1;
ALTER TABLE skill ADD COLUMN IF NOT EXISTS motivo_revalidacao text;

ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS skill_id uuid REFERENCES skill(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS anotacao_grafo_skill_idx ON anotacao_grafo (skill_id);

CREATE TABLE IF NOT EXISTS consulta_aprendida_skill (
  consulta_id uuid NOT NULL REFERENCES consulta_aprendida(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  PRIMARY KEY (consulta_id, skill_id)
);
CREATE INDEX IF NOT EXISTS consulta_aprendida_skill_skill_idx ON consulta_aprendida_skill (skill_id);

INSERT INTO consulta_aprendida_skill (consulta_id, skill_id)
SELECT id, skill_id FROM consulta_aprendida
WHERE skill_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE consulta_aprendida DROP COLUMN IF EXISTS skill_id;
