-- pgvector was created in 0008 and never used (busca is FTS, not embeddings).
-- Do not rewrite 0008. DROP is idempotent if the extension is already gone.

DROP EXTENSION IF EXISTS vector;
