-- Opcional: só rode depois de instalar o extension pgvector no Postgres
-- (`CREATE EXTENSION vector`) e de configurar EMBEDDING_API_URL.
-- O runner `npm run db:migrate` NÃO aplica este arquivo (vive fora de drizzle/*.sql).

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE fonte ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE fonte_anotacao ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE consulta_memoria ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS fonte_embedding_idx
  ON fonte USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
CREATE INDEX IF NOT EXISTS fonte_anotacao_embedding_idx
  ON fonte_anotacao USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
CREATE INDEX IF NOT EXISTS consulta_memoria_embedding_idx
  ON consulta_memoria USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
