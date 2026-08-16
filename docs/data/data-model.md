# Modelo de dados

Persistência em PostgreSQL via Drizzle. Dados operacionais do ERP **não** são copiados.

## Tabelas

### `mcp_account`

Conta do usuário neste MCP.

- `id` uuid pk
- `email` unique
- `password_hash`
- `created_at`, `updated_at`

### `ambiente`

ERP conectado a uma conta.

- `id` uuid pk
- `mcp_account_id` fk
- `nome_amigavel`
- `agent_id` uuid (plug-server)
- `dialeto` enum: `mssql` \| `sybase` \| `postgres` \| `firebird`
- `client_token_encriptado` text nullable
- `status_acesso` enum: `pending` \| `approved` \| `revoked`
- unique (`mcp_account_id`, `agent_id`)

### Catálogo

- `fonte`: `id`, `slug`, `nome`, `descricao`, `ativo`, `mcp_account_id` nullable (nulo = seed), `agent_id` nullable, `created_at`, `updated_at`
  - índice único parcial `(slug) WHERE mcp_account_id IS NULL` (seed)
  - índice único `(mcp_account_id, agent_id, slug)` (fonte do usuário)
  - índice `(mcp_account_id, agent_id)`
- `fonte_sql_variant`: `fonte_id`, `dialeto`, `sql_base`, `observacoes_dialeto`
- `fonte_coluna`: `fonte_id`, `nome`, `tipo`, `descricao`, `regra_negocio`, `ordem`
- `fonte_relacionamento`: origem + `fonte_destino_id` nullable + `tabela_destino` nullable (exatamente um preenchido) + colunas + `tipo_join`
- `regra_negocio`: `fonte_id`, `nome`, `descricao`, `expressao` — só regras da própria fonte (não usar `fonte_id IS NULL` como glossário)
- `sinonimo`: `fonte_id`, `termo`, `descricao`
- `fonte_anotacao`: `mcp_account_id` e `agent_id` NOT NULL, `fonte_id` nullable (null = glossário daquele agente), `tipo` (`uso|codigo|alerta|glossario|preferencia`), `titulo`, `texto`
  - índice `(mcp_account_id, agent_id, fonte_id)`
  - anotações nunca cruzam `agentId` (cada agente é um banco)
- `consulta_memoria`: `mcp_account_id` e `agent_id` NOT NULL, `pergunta`, `sql_executado`, `fonte_slug` nullable, `observacao`, `aprovado_em`
  - **não** guarda linhas de resultado do ERP

Fonte da conta no mesmo slug do seed faz sombra só naquele `agentId`. `remover_fonte` apaga a sombra e o seed volta a valer.

Busca de contexto (`buscar_contexto`): colunas `tsv` (`tsvector`, config `simple`) + `pg_trgm` em `fonte`, `fonte_anotacao` e `consulta_memoria`. O `WHERE` filtra `mcp_account_id` + `agent_id` antes do ranqueamento.

pgvector (opcional, desligado por padrão): rode `drizzle/optional/0007_pgvector.sql` e configure `EMBEDDING_API_URL` (OpenAI-compatível). Sem isso, `compose()` usa só FTS.

### `audit_log`

- `mcp_account_id`, `ambiente_id`, `tool`, `sql_enviado`, `sucesso`, `codigo_erro`, `linhas_retornadas`, `duracao_ms`, `created_at`
- índice `(mcp_account_id, created_at DESC)`
- retenção: `AUDIT_LOG_RETENTION_DAYS` (default 90); sweep em `compose`

### OAuth

- `oauth_client`: `client_id`, `client_secret_hash` nullable (público = PKCE only), `redirect_uris`, `client_name`
- `oauth_auth_code`: code, `client_id`, `account_id`, `redirect_uri`, `code_challenge`, `expires_at` — índice em `expires_at`
- `oauth_refresh_token`: hash, `client_id`, `account_id`, `expires_at`, `revoked_at` — índice em `expires_at`
- códigos e refresh expirados são removidos pelo sweep `OAUTH_CLEANUP_INTERVAL_MS`

### `_mcp_migrations`

Ledger do `npm run db:migrate`: `filename` pk, `applied_at`. Cada arquivo `drizzle/*.sql` entra uma vez, em ordem lexical, dentro de transação.

## Seed inicial

Fontes `vendas`, `produtos`, `clientes` com SQL base nos 4 dialetos. Ver `src/infrastructure/persistence/seed/catalogo.seed.ts`.

`npm run db:seed` reconcilia por slug as fontes **globais** (`aplicarSeed`): upsert da fonte com `mcp_account_id IS NULL`, recria filhos, desativa (`ativo=false`) slugs globais que saíram do seed — não mexe em fontes de usuário. O boot só semeia se não houver fonte global.

O dialeto **não** é inferido pela IA: vem do `ambiente` no momento de `conectar_ambiente`.
