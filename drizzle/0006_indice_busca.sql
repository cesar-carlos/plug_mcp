-- Índice de busca de contexto: FTS (simple, sempre disponível) + trigram.
-- O adapter filtra mcp_account_id + agent_id no WHERE antes do ranqueamento.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE fonte
  ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(slug, '') || ' ' || coalesce(nome, '') || ' ' || coalesce(descricao, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS fonte_tsv_idx ON fonte USING GIN (tsv);
CREATE INDEX IF NOT EXISTS fonte_nome_trgm_idx ON fonte USING GIN (nome gin_trgm_ops);

ALTER TABLE fonte_anotacao
  ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(titulo, '') || ' ' || coalesce(texto, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS fonte_anotacao_tsv_idx ON fonte_anotacao USING GIN (tsv);

ALTER TABLE consulta_memoria
  ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(pergunta, '') || ' ' || coalesce(observacao, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS consulta_memoria_tsv_idx ON consulta_memoria USING GIN (tsv);
