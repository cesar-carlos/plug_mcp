ALTER TABLE skill ADD COLUMN IF NOT EXISTS publicacao_ativa_id uuid;

-- Freeze exactly the currently served legacy content, without claiming human approval.
WITH baselines AS (
  SELECT s.*, jsonb_build_object('slug', s.slug, 'nome', s.nome, 'descricao', s.descricao,
    'sqlModelo', s.sql_modelo, 'params', s.params, 'escopo', s.escopo,
    'pacoteVersao', s.pacote_versao, 'consultaSemantica', s.consulta_semantica,
    'politicaConsulta', s.politica_consulta) AS pacote
  FROM skill s WHERE s.status = 'publicada' AND s.publicacao_ativa_id IS NULL
), inserted AS (
  INSERT INTO skill_publicacao (acesso_id, skill_id, publicacao_versao, skill_versao, pacote, pacote_hash, origem, autor_usuario_id)
  SELECT b.acesso_id, b.id, COALESCE((SELECT MAX(p.publicacao_versao) FROM skill_publicacao p WHERE p.skill_id = b.id), 0) + 1,
    b.versao, b.pacote, encode(sha256(convert_to(b.pacote::text, 'UTF8')), 'hex'), 'migracao', b.autor_usuario_id
  FROM baselines b RETURNING id, skill_id
)
UPDATE skill s SET publicacao_ativa_id = p.id FROM inserted p WHERE s.id = p.skill_id;

ALTER TABLE skill ADD CONSTRAINT skill_publicacao_ativa_fk FOREIGN KEY (publicacao_ativa_id) REFERENCES skill_publicacao(id);
CREATE INDEX IF NOT EXISTS skill_publicacao_ativa_idx ON skill(publicacao_ativa_id);
