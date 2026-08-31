ALTER TABLE lacuna_consulta ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aberta';
ALTER TABLE lacuna_consulta ADD COLUMN IF NOT EXISTS pergunta_chave text;
ALTER TABLE lacuna_consulta ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE lacuna_consulta
SET pergunta_chave = lower(regexp_replace(btrim(pergunta), '\s+', ' ', 'g'))
WHERE pergunta_chave IS NULL OR pergunta_chave = '';

UPDATE lacuna_consulta
SET pergunta_chave = id::text
WHERE pergunta_chave IS NULL OR pergunta_chave = '';

DELETE FROM lacuna_consulta AS a
USING lacuna_consulta AS b
WHERE a.agent_id = b.agent_id
  AND a.tipo = b.tipo
  AND a.pergunta_chave = b.pergunta_chave
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.id < b.id)
  );

ALTER TABLE lacuna_consulta ALTER COLUMN pergunta_chave SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS lacuna_consulta_agent_tipo_chave_uidx
  ON lacuna_consulta (agent_id, tipo, pergunta_chave);
