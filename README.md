# Se7e MCP Server

Servidor MCP remoto (Streamable HTTP) que permite a uma IA consultar o ERP Se7e via [`plug-server`](https://plug-server.se7esistemassinop.com.br/docs). Documentação de produto e arquitetura: [`docs/README.md`](docs/README.md). Padrão de auth e comunicação com o plug-server: [`docs/plug-server/README.md`](docs/plug-server/README.md).

## Requisitos

- Node.js 24.19.0+ (LTS Krypton; `.nvmrc`)
- PostgreSQL (produção). Testes unitários usam repositórios in-memory.

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
npm run db:seed
npm run dev
```

### Stack completo no Docker

```bash
docker compose up --build
```

Sobe PostgreSQL 16 (porta do host `5433`, para não colidir com um Postgres local na `5432`), Redis só na rede interna (rate limit de `/mcp`) e o MCP. O entrypoint aplica as migrations antes de escutar. Credenciais do Client de serviço (`PLUG_SERVER_CLIENT_EMAIL` / `PLUG_SERVER_CLIENT_PASSWORD`) vêm de um `.env` na raiz, se existir.

Health: `GET http://127.0.0.1:3333/health`

MCP: `POST http://127.0.0.1:3333/mcp`

Todos os scripts que rodam o servidor ou scripts de banco carregam `.env` automaticamente via `--env-file-if-exists` (nativo do Node 22+, sem depender do pacote `dotenv`).

## Scripts

| Script                 | Função                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`          | Sobe com `tsx watch`                                                            |
| `npm test`             | Vitest — unit + integration + e2e (tudo in-memory, sem rede real)               |
| `npm run test:watch`   | Vitest em modo watch                                                            |
| `npm run test:live`    | Vitest contra o plug-server **real** (precisa de `E2E_*` no `.env`, ver abaixo) |
| `npm run lint`         | ESLint 9 flat config (`eslint.config.js`, type-checked)                         |
| `npm run format`       | Prettier (aplica formatação; alinhado ao `.editorconfig`)                       |
| `npm run format:check` | Prettier (só verifica, não altera)                                              |
| `npm run build`        | `tsc`                                                                           |
| `npm run db:migrate`   | Ledger `_mcp_migrations`: aplica `drizzle/*.sql` na ordem                       |
| `npm run db:seed`      | Reconcilia o catálogo por slug (`aplicarSeed`)                                  |

Docker: `Dockerfile` multi-stage (`node:24.19.0-alpine`) + `docker-compose.yml` (Postgres, Redis, MCP). CI: `.github/workflows/ci.yml` lê `.nvmrc`, roda lint, format:check, tsc e `npm test` (nunca `test:live`).

## Testes live contra o plug-server real

`npm run test:live` roda `tests/live/`, que autentica com uma conta de TESTE dedicada no plug-server (nunca a conta de serviço de produção) e chama a API real. Requer as variáveis `E2E_AGENT_ID`, `E2E_CLIENT_TOKEN`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD` e `E2E_DIALETO` no `.env` (ver `.env.example`). Sem essas variáveis, a suíte se pula sozinha — nunca falha por falta de credenciais, e nunca roda como parte de `npm test`.

## Conectar um cliente

Ver [docs/clients/connecting-clients.md](docs/clients/connecting-clients.md).
