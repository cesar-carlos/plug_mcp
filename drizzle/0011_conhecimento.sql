ALTER TABLE skill ADD COLUMN IF NOT EXISTS escopo jsonb NOT NULL DEFAULT '{"tabelas":[],"colunasPorTabela":{},"relacionamentos":[],"grao":[]}'::jsonb;
ALTER TABLE coluna_grafo ADD COLUMN IF NOT EXISTS papel text;
ALTER TABLE coluna_grafo ADD COLUMN IF NOT EXISTS formato text;
ALTER TABLE coluna_grafo ADD COLUMN IF NOT EXISTS perfil jsonb;
ALTER TABLE relacionamento_grafo ADD COLUMN IF NOT EXISTS cardinalidade text;
ALTER TABLE acesso ADD COLUMN IF NOT EXISTS escopo_padrao jsonb;
ALTER TABLE acesso ADD COLUMN IF NOT EXISTS timezone text;
