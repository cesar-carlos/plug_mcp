-- Governança opcional de conhecimento: legado continua ativo, mas notas
-- explicitamente obsoletas/fora da vigência não entram no contexto de consulta.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS fonte_tipo text;
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS fonte_referencia text;
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS responsavel text;
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS validado_em timestamptz;
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS vigente_de date;
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS vigente_ate date;
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS status text;

UPDATE anotacao_grafo
SET fonte_tipo = COALESCE(fonte_tipo, 'legado'),
    status = COALESCE(status, 'vigente');

ALTER TABLE anotacao_grafo ALTER COLUMN fonte_tipo SET NOT NULL;
ALTER TABLE anotacao_grafo ALTER COLUMN fonte_tipo SET DEFAULT 'usuario';
ALTER TABLE anotacao_grafo ALTER COLUMN status SET NOT NULL;
ALTER TABLE anotacao_grafo ALTER COLUMN status SET DEFAULT 'vigente';

ALTER TABLE anotacao_grafo DROP CONSTRAINT IF EXISTS anotacao_grafo_fonte_tipo_check;
ALTER TABLE anotacao_grafo ADD CONSTRAINT anotacao_grafo_fonte_tipo_check
  CHECK (fonte_tipo IN ('usuario', 'erp', 'documento', 'importacao', 'legado', 'outro'));
ALTER TABLE anotacao_grafo DROP CONSTRAINT IF EXISTS anotacao_grafo_status_check;
ALTER TABLE anotacao_grafo ADD CONSTRAINT anotacao_grafo_status_check
  CHECK (status IN ('vigente', 'obsoleta'));
ALTER TABLE anotacao_grafo DROP CONSTRAINT IF EXISTS anotacao_grafo_vigencia_check;
ALTER TABLE anotacao_grafo ADD CONSTRAINT anotacao_grafo_vigencia_check
  CHECK (vigente_de IS NULL OR vigente_ate IS NULL OR vigente_de <= vigente_ate);
CREATE INDEX IF NOT EXISTS anotacao_grafo_vigencia_idx
  ON anotacao_grafo (acesso_id, status, vigente_de, vigente_ate);

-- A publicação é imutável: o snapshot serve para diff e confirmação, sem
-- substituir o pacote atual da skill.
CREATE TABLE IF NOT EXISTS skill_publicacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acesso_id uuid NOT NULL REFERENCES acesso(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  publicacao_versao integer NOT NULL,
  skill_versao integer NOT NULL,
  pacote jsonb NOT NULL,
  pacote_hash text NOT NULL,
  origem text NOT NULL DEFAULT 'publicacao',
  autor_usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skill_publicacao_origem_check CHECK (origem IN ('publicacao', 'migracao')),
  CONSTRAINT skill_publicacao_versao_check CHECK (publicacao_versao > 0),
  UNIQUE (skill_id, publicacao_versao)
);
CREATE INDEX IF NOT EXISTS skill_publicacao_acesso_skill_idx
  ON skill_publicacao (acesso_id, skill_id, publicacao_versao DESC);

INSERT INTO skill_publicacao (
  acesso_id, skill_id, publicacao_versao, skill_versao, pacote, pacote_hash,
  origem, autor_usuario_id, created_at
)
SELECT
  s.acesso_id,
  s.id,
  1,
  s.versao,
  jsonb_build_object(
    'slug', s.slug,
    'nome', s.nome,
    'descricao', s.descricao,
    'sqlModelo', s.sql_modelo,
    'params', s.params,
    'escopo', s.escopo,
    'pacoteVersao', s.pacote_versao,
    'consultaSemantica', s.consulta_semantica,
    'politicaConsulta', s.politica_consulta
  ),
  encode(
    digest(
      jsonb_build_object(
        'acessoId', s.acesso_id,
        'skillId', s.id,
        'skillVersao', s.versao,
        'baseHash', NULL,
        'pacote', jsonb_build_object(
          'slug', s.slug,
          'nome', s.nome,
          'descricao', s.descricao,
          'sqlModelo', s.sql_modelo,
          'params', s.params,
          'escopo', s.escopo,
          'pacoteVersao', s.pacote_versao,
          'consultaSemantica', s.consulta_semantica,
          'politicaConsulta', s.politica_consulta
        )
      )::text,
      'sha256'
    ),
    'hex'
  ),
  'migracao',
  s.autor_usuario_id,
  s.updated_at
FROM skill s
WHERE s.status = 'publicada'
ON CONFLICT (skill_id, publicacao_versao) DO NOTHING;
