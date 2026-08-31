# Se7e MCP Server

Servidor MCP remoto (Streamable HTTP) que conecta um Client já existente no `plug-server` ao ERP. O MCP é **cofre + base de conhecimento**: guarda as quatro credenciais do Client, emite **um** token MCP opaco, e dá à IA o pacote da skill publicada. A IA escreve SQL no dialeto do acesso, sempre dentro desse escopo.

Não há login próprio, Authorization Server, catálogo pronto com seed, nem Client de serviço no `.env`.

## Requisitos

- Node.js 24.19.0+ (LTS Krypton; `.nvmrc`)
- PostgreSQL (produção). Testes unitários usam repositórios in-memory. `npm run db:migrate` exige privilégio `CREATE EXTENSION` para `unaccent`, `btree_gin` e `pg_trgm` (FTS).
- Redis opcional (rate limit + cache de policy)

## Setup

### Produção neste servidor (PM2)

Postgres e Redis ficam no Docker. O processo Node é gerenciado pelo PM2 (mesmo daemon de `plug_server` / Chatwoot), em `fork` com 1 instância — sessões MCP são in-memory e não suportam cluster.

```bash
nvm use
npm install
npm run build
docker compose up -d postgres redis
pm2 start ecosystem.config.cjs
pm2 save
```

O Nginx em `mcp.se7esistemassinop.com.br` faz proxy para `127.0.0.1:3333`. Para o container Node em vez do PM2: `docker compose --profile container up --build -d mcp`.

### Local (Node + Postgres no Docker)

```bash
cp .env.example .env
nvm use
docker compose up -d postgres redis
npm install
npm run db:migrate
npm run dev
```

O Compose publica o Postgres na porta `5433` do host (para não colidir com um Postgres local na `5432`). Ajuste `DATABASE_URL` no `.env` para essa porta.

Não há script de seed. O grafo nasce vazio; o treino com SQL modelo deve fechar numa skill publicada — é ela que a IA usa na consulta.

- Health: `GET http://127.0.0.1:3333/health` (`version`, `sha` via `GIT_SHA`/`SOURCE_COMMIT`/`GITHUB_SHA`, `buildTime`, `uptimeSec`). Após deploy, reconecte o cliente MCP para atualizar `tools/list`.
- Matriz de erros: `GET http://127.0.0.1:3333/docs/mcp/error-mapping.md` (mesmo path de `error.documentationUrl`).
- Ready: `GET http://127.0.0.1:3333/ready` (`database: ok|skipped|error`; 503 se o banco falhar)
- MCP: `POST http://127.0.0.1:3333/mcp`
- Token MCP (one-shot): `GET http://127.0.0.1:3333/setup/{code}`

## Bootstrap

Consulta ao ERP: `consultar_dados` com skill publicada. Sem `sql`, executa a consulta exemplo; com `sql` ou `consultaSemantica`, o SELECT precisa ficar no escopo. `buscar_contexto` não devolve SQL — use `obter_skill`. Skill em treino que cobre a pergunta: `blockingReason SKILL_NOT_PUBLISHED`. Sem skill capaz: `SKILL_GAP` (a busca por termos não prova ausência — `listar_skills`). Token MCP pode expirar (`MCP_TOKEN_TTL_DAYS`). `MCP_ALLOWED_ORIGINS` não vazio recusa Origin estranho com 403. Rate limit por tool além do HTTP em `/mcp`. Flags novas (default ligado): `MCP_INSPECTION_ENABLED`, `MCP_DISCOVERY_QUERY_ENABLED`, `MCP_SEMANTIC_QUERY_ENABLED`, `MCP_SCHEMA_DRIFT_ENABLED`. `MCP_SKILL_TOOLS_ENABLED=true` liga tools `skill_*` (default desligado).

1. Cliente MCP chama `initialize` / `tools/list` **sem** Bearer. Só `registrar_acesso` está disponível.
2. `registrar_acesso` recebe e-mail/senha do Client, `agentId`, dialeto e `client_token`. **Não devolve o token MCP.**
3. A tool devolve `setupCode` + `setupUrl`. O usuário abre a URL, copia o token e cola em `Authorization: Bearer`.
4. Demais tools exigem Bearer. Novos acessos: `adicionar_acesso` (sem senha de novo).

## Scripts

| Script                       | Função                                                 |
| ---------------------------- | ------------------------------------------------------ |
| `npm run dev`                | `tsx watch`                                            |
| `npm test`                   | Vitest in-memory                                       |
| `npm run test:live`          | plug-server real (`E2E_*`)                             |
| `npm run lint` / `format`    | ESLint + Prettier                                      |
| `npm run db:migrate`         | Aplica `drizzle/*.sql`                                 |
| `npm run db:backfill-escopo` | Preenche `skill.escopo` vazio a partir do `sql_modelo` |

Docker: `Dockerfile` multi-stage (Alpine 3.24 + Node 24.19.0 musl, sem npm no runtime) + `docker-compose.yml` (Postgres, Redis, MCP opcional). CI: `.github/workflows/ci.yml` lê `.nvmrc`.

## Testes live contra o plug-server real

`npm run test:live` roda `tests/live/`, que autentica com uma conta de teste dedicada no plug-server (nunca uma conta de produção) e chama a API real. Requer as variáveis `E2E_AGENT_ID`, `E2E_CLIENT_TOKEN`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD` e `E2E_DIALETO` no `.env` (ver `.env.example`). Sem essas variáveis, a suíte se pula sozinha — nunca falha por falta de credenciais, e nunca roda como parte de `npm test`.

## Conectar um cliente

Ver [docs/clients/connecting-clients.md](docs/clients/connecting-clients.md).

## Documentação

Índice: [`docs/README.md`](docs/README.md). Histórico: [`CHANGELOG.md`](CHANGELOG.md).

1. Norte — [docs/product/objective.md](docs/product/objective.md)
2. Tools e erros — [docs/mcp/tools.md](docs/mcp/tools.md), [docs/mcp/error-mapping.md](docs/mcp/error-mapping.md)
3. Modelo e FTS — [docs/data/data-model.md](docs/data/data-model.md)
4. Hub REST — [docs/plug-server/](docs/plug-server/)
5. Três camadas (histórico) — [docs/proposta-arquitetura-mcp-se7e.md](docs/proposta-arquitetura-mcp-se7e.md)
