-- Harden FTS functions (search_path) and composite GIN (agent_id, search_tsv).
-- Do not re-run 0016; generated columns stay as-is.

CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE OR REPLACE FUNCTION mcp_unaccent(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = pg_catalog, public
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
SET search_path = pg_catalog, public
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

DROP INDEX IF EXISTS skill_search_tsv_gin;
CREATE INDEX IF NOT EXISTS skill_agent_search_tsv_gin ON skill USING GIN (agent_id, search_tsv);

DROP INDEX IF EXISTS anotacao_grafo_search_tsv_gin;
CREATE INDEX IF NOT EXISTS anotacao_grafo_agent_search_tsv_gin ON anotacao_grafo USING GIN (agent_id, search_tsv);

DROP INDEX IF EXISTS consulta_aprendida_search_tsv_gin;
CREATE INDEX IF NOT EXISTS consulta_aprendida_agent_search_tsv_gin ON consulta_aprendida USING GIN (agent_id, search_tsv);

DROP INDEX IF EXISTS tabela_grafo_search_tsv_gin;
CREATE INDEX IF NOT EXISTS tabela_grafo_agent_search_tsv_gin ON tabela_grafo USING GIN (agent_id, search_tsv);
