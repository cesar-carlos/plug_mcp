-- Hybrid lexical search (FTS portuguese + unaccent). Do not index SQL or ERP rows.
-- unaccent() is STABLE; generated columns require an IMMUTABLE wrapper.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION mcp_unaccent(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', txt)
$$;

CREATE OR REPLACE FUNCTION mcp_skill_search_vec(
  nome text,
  slug text,
  descricao text,
  params jsonb,
  escopo jsonb
) RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT to_tsvector(
    'portuguese'::regconfig,
    mcp_unaccent(
      coalesce(nome, '') || ' ' ||
      coalesce(slug, '') || ' ' ||
      coalesce(descricao, '') || ' ' ||
      coalesce((
        SELECT string_agg(coalesce(p->>'nome', '') || ' ' || coalesce(p->>'descricao', ''), ' ')
        FROM jsonb_array_elements(coalesce(params, '[]'::jsonb)) AS p
      ), '') || ' ' ||
      coalesce((
        SELECT string_agg(
          coalesce(m->>'alias', '') || ' ' ||
          coalesce(m->>'definicao', '') || ' ' ||
          coalesce(m->>'grao', ''),
          ' '
        )
        FROM jsonb_array_elements(coalesce(escopo->'metricasSaida', '[]'::jsonb)) AS m
      ), '')
    )
  )
$$;

ALTER TABLE skill ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (mcp_skill_search_vec(nome, slug, descricao, params, escopo)) STORED;
CREATE INDEX IF NOT EXISTS skill_search_tsv_gin ON skill USING GIN (search_tsv);

ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese'::regconfig,
      mcp_unaccent(coalesce(titulo, '') || ' ' || coalesce(texto, ''))
    )
  ) STORED;
CREATE INDEX IF NOT EXISTS anotacao_grafo_search_tsv_gin ON anotacao_grafo USING GIN (search_tsv);

ALTER TABLE consulta_aprendida ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('portuguese'::regconfig, mcp_unaccent(coalesce(pergunta, '')))
  ) STORED;
CREATE INDEX IF NOT EXISTS consulta_aprendida_search_tsv_gin ON consulta_aprendida USING GIN (search_tsv);

ALTER TABLE tabela_grafo ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese'::regconfig,
      mcp_unaccent(coalesce(nome, '') || ' ' || coalesce(descricao, ''))
    )
  ) STORED;
CREATE INDEX IF NOT EXISTS tabela_grafo_search_tsv_gin ON tabela_grafo USING GIN (search_tsv);
