-- Weighted FTS (nome/slug A, descrição/params B, métricas C) and pg_trgm for ILIKE.
-- Do not re-run 0016/0017. DROP/ADD skill.search_tsv rewrites stored vectors.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
SET search_path = pg_catalog, public
AS $$
  SELECT
    setweight(
      to_tsvector(
        'portuguese'::regconfig,
        mcp_unaccent(coalesce(nome, '') || ' ' || coalesce(slug, ''))
      ),
      'A'
    ) ||
    setweight(
      to_tsvector(
        'portuguese'::regconfig,
        mcp_unaccent(
          coalesce(descricao, '') || ' ' ||
          coalesce((
            SELECT string_agg(coalesce(p->>'nome', '') || ' ' || coalesce(p->>'descricao', ''), ' ')
            FROM jsonb_array_elements(coalesce(params, '[]'::jsonb)) AS p
          ), '')
        )
      ),
      'B'
    ) ||
    setweight(
      to_tsvector(
        'portuguese'::regconfig,
        mcp_unaccent(
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
      ),
      'C'
    )
$$;

DROP INDEX IF EXISTS skill_agent_search_tsv_gin;
ALTER TABLE skill DROP COLUMN IF EXISTS search_tsv;
ALTER TABLE skill ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (mcp_skill_search_vec(nome, slug, descricao, params, escopo)) STORED;
CREATE INDEX IF NOT EXISTS skill_agent_search_tsv_gin ON skill USING GIN (agent_id, search_tsv);

CREATE INDEX IF NOT EXISTS skill_nome_trgm_gin ON skill USING GIN (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS skill_slug_trgm_gin ON skill USING GIN (slug gin_trgm_ops);
CREATE INDEX IF NOT EXISTS consulta_aprendida_pergunta_trgm_gin
  ON consulta_aprendida USING GIN (pergunta gin_trgm_ops);
