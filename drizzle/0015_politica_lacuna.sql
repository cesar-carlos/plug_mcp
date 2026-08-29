ALTER TABLE "skill" ADD COLUMN IF NOT EXISTS "politica_consulta" jsonb;

ALTER TABLE "lacuna_consulta" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL DEFAULT 'skill_gap';
ALTER TABLE "lacuna_consulta" ADD COLUMN IF NOT EXISTS "contrato" jsonb;
