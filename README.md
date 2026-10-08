# Se7e MCP Server

Servidor MCP remoto (Streamable HTTP) que conecta um Client já existente no `plug-server` ao ERP. O MCP é **cofre + base de conhecimento**: guarda e-mail/senha (só autenticação — **não** particiona o catálogo), `agentId` e `client_token`, emite **um token MCP opaco por acesso**, e dá à IA o pacote da skill publicada **daquele acesso**. **1 `client_token` = 1 persona = 1 catálogo isolado = 1 Bearer.** Mesmo e-mail/`agentId` + outro token (`adicionar_acesso` / `registrar_acesso`) começa vazio e ganha outro Bearer. Tools omitem `acessoId`. Resource `skill://{acessoId}/{slug}`. Cache `mcp:query:acesso:{acessoId}:`. Hub SQL continua `agentId` + `client_token` daquele acesso. A **base comum** de todo consumidor: SQL no plug_server, dialeto do acesso, resources (`guia://`, `skill://`, `persona://`) e estrutura pelas skills publicadas (consultas dinâmicas no pacote, fail-closed). Sem embeddings. Persona no acesso oriente tom/uso e **não** recorta skills **neste acesso** (outro token = outro catálogo) nem licencia SQL. O domínio (atendimento, pagamentos, KPI/gestão, etc.) é o que o usuário treinou e publicou neste acesso, mais o chapéu da persona.

OAuth opcional delega um acesso existente ao ChatGPT por token MCP no navegador. Sem novas contas, catálogo pronto com seed ou Client de serviço no `.env`.

## Requisitos

- Node.js 24.21.0 ou patch posterior da linha 24 LTS (Krypton; `.nvmrc`; Node 25/26 fora do runtime suportado).
- PostgreSQL (produção). Testes unitários usam repositórios in-memory. `npm run db:migrate` exige privilégio `CREATE EXTENSION` para `unaccent`, `btree_gin` e `pg_trgm` (FTS).
- Servidor Redis 7 opcional (`redis:7-alpine` no Docker e na CI): rate limit, cache e coordenação de consultas. O pacote npm `redis` 6.3.0 é o cliente Node e tem versionamento independente. [Configuração e diagnóstico](docs/operations/redis.md).

## Setup

### Produção neste servidor (container)

O processo MCP é o serviço `mcp` do Compose, perfil `container`, publicado só em `127.0.0.1:3333`. Postgres e Redis seguem nos serviços já existentes; o container usa `postgres:5432` e `redis:6379` na rede interna. A chave do cofre e a URL do hub vêm do `.env`. O entrypoint aplica as migrações pendentes antes de escutar. Sessões MCP continuam na memória do processo.

```bash
GIT_SHA=$(git rev-parse HEAD) docker compose --profile container up --build -d --no-deps mcp
```

`--no-deps` não recria Postgres nem Redis. O Nginx em `mcp.se7esistemassinop.com.br` faz proxy para `127.0.0.1:3333`. Não suba `se7e-mcp` no PM2: o mesmo daemon segue com `plug_server`, Chatwoot e `evogo-qrcode`, e outro processo na 3333 toma a porta do proxy. Para Redis no host, o guia continua em [operations/redis.md](docs/operations/redis.md).

Push na `main` do GitHub, depois que o workflow `ci` termina com sucesso, dispara `deploy` só se o commit altera o runtime (`src/`, `web/`, `drizzle/`, `Dockerfile`, `docker-entrypoint.sh`, `package.json`, `package-lock.json`, `docker-compose.yml`, `docs/mcp/error-mapping.md` ou os workflows de CI/deploy). O CI publica a imagem `linux/amd64` já testada em `ghcr.io/cesar-carlos/plug_mcp:<sha>`. O deploy baixa essa imagem e envia por SSH o SHA exato que passou no CI. A chave só executa `/usr/local/sbin/plug-mcp-deploy`, cópia de `scripts/deploy-production.sh` instalada fora do Git: um commit não troca o que a chave pode fazer. Atualizar esse script exige copiá-lo de novo para `/usr/local/sbin`. O servidor confere `/health` e `/ready`; se falhar, volta a imagem anterior. O resultado aparece no commit como status `production/mcp` e em `/var/log/plug-mcp-deploy.log`. Secrets: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_HOST_KEY`. O `.env` não vai no repositório. Cada publicação recria só o container `mcp` e derruba as sessões que estavam na memória dele.

### Local (Node + Postgres no Docker)

```bash
cp .env.example .env
nvm use
docker compose up -d postgres
npm ci
npm run db:migrate
npm run dev
```

O Compose publica o Postgres na porta `5433` do host (para não colidir com um Postgres local na `5432`). Ajuste `DATABASE_URL` no `.env` para essa porta.

O `.env.example` mantém `REDIS_URL` vazio; assim rate limit, cache e singleflight são locais ao processo. Iniciar um container Redis por si só não ativa seu uso pelo MCP. Para Node/PM2 no host, use o [overlay de porta local](docs/operations/redis.md). No Windows com nvm-windows, execute `nvm use 24.21.0` explicitamente.

Não há script de seed. O grafo nasce vazio; o treino com SQL modelo deve fechar numa skill publicada — é ela que a IA usa na consulta.

- Health: `GET http://127.0.0.1:3333/health` (`version`, `sha` via `GIT_SHA`/`SOURCE_COMMIT`/`GITHUB_SHA`, `buildTime`, `uptimeSec`). Após deploy, reconecte o cliente MCP para atualizar `tools/list`.
- Matriz de erros: `GET http://127.0.0.1:3333/docs/mcp/error-mapping.md` (mesmo path de `error.documentationUrl`).
- Ready: `GET http://127.0.0.1:3333/ready` (`database: ok|skipped|error`; 503 se o banco falhar)
- MCP: `POST http://127.0.0.1:3333/mcp`
- Formulário público: `GET http://127.0.0.1:3333/setup/{code}`
- Console do usuário (após `npm run web:build`): `GET http://127.0.0.1:3333/app/conectar`

## Bootstrap

Consulta ao ERP: `consultar_dados` com skill publicada. Sem `sql`, executa a consulta exemplo; com `sql` ou `consultaSemantica`, o SELECT precisa ficar no escopo. Stub `kind: anexo` em `consultar_dados`: use `exportar_anexo`. `buscar_contexto` não devolve SQL — use `obter_skill`. Sem publicação ativa utilizável, skill em treino que cobre a pergunta retorna `blockingReason SKILL_NOT_PUBLISHED`; editar um rascunho mantém a publicação anterior. Sem skill capaz: `SKILL_GAP` (a busca por termos não prova ausência — `listar_skills`). Token MCP pode expirar (`MCP_TOKEN_TTL_DAYS`). Origin ausente é aceito para clientes nativos; Origin `null` ou desconhecido é recusado. `MCP_ALLOWED_ORIGINS` vazio usa `PUBLIC_BASE_URL`; Host e proxy também exigem configuração explícita. Rate limit por tool além do HTTP em `/mcp`. Flags novas (default ligado): `MCP_INSPECTION_ENABLED`, `MCP_DISCOVERY_QUERY_ENABLED`, `MCP_SEMANTIC_QUERY_ENABLED`, `MCP_SCHEMA_DRIFT_ENABLED`. `MCP_SKILL_TOOLS_ENABLED=true` liga tools `skill_*` (default desligado).

1. Cliente MCP chama `initialize` / `tools/list` **sem** Bearer. Só `registrar_acesso` está disponível.
2. `registrar_acesso({})` retorna uma URL. E-mail/senha do Client, `agentId`, dialeto e `client_token` são preenchidos somente no navegador.
3. A tool devolve `setupUrl` + `expiresAt`. GET mostra formulário; POST confirmado/CSRF reautentica no hub e mostra o Bearer uma vez. Validade do código: 15 minutos.
4. Demais tools exigem Bearer. Novos acessos: `adicionar_acesso({})` (formulário reautenticado; outro Bearer via `setupUrl`; não troca esta sessão).

## Scripts

| Script                         | Função                                                                   |
| ------------------------------ | ------------------------------------------------------------------------ |
| `npm run dev`                  | `tsx watch`                                                              |
| `npm test`                     | Unitários, contratos e integrações; PostgreSQL/Redis quando configurados |
| `npm run test:live`            | plug-server real (`E2E_*`)                                               |
| `npm run lint` / `format`      | ESLint + Prettier                                                        |
| `npm run release:check`        | Compilador 7, lint, formatação, tipos, testes, build e `web:check`       |
| `npm run web:check`            | Lint Vue/TypeScript, tipos, Vitest e build do console                    |
| `npm run test:console:browser` | Chromium do console, separado do OAuth, com `FakePlugServer`             |
| `npm run db:migrate`           | Aplica `drizzle/*.sql`                                                   |
| `npm run test:migrations`      | Banco novo, upgrades `0023`/`0027` e reaplicação em DB efêmero de CI     |
| `npm run runtime:check`        | Servidor, worker e componentes nativos em banco CI isolado               |
| `npm run test:evaluation`      | Avaliação determinística dos 100 cenários sintéticos                     |
| `npm run evaluate:consumer`    | Avaliação explícita com adaptador/modelo de IA configurados              |
| `npm run worker:operacoes`     | Processa SLO, revisões e outbox de webhook (requer banco)                |
| `npm run db:backfill-escopo`   | Preenche `skill.escopo` vazio a partir do `sql_modelo`                   |

Docker: `Dockerfile` multi-stage (Alpine 3.24 + Node 24.21.0 musl, sem npm no runtime) + `docker-compose.yml` (Postgres, Redis, MCP opcional). CI: `.github/workflows/ci.yml` lê `.nvmrc`.

Para rodar todas as integrações, configure bancos exclusivos de teste em `DATABASE_URL` e `REDIS_URL`. `CI=true` exige PostgreSQL e impede omissão silenciosa do FTS; migrações e avaliação exigem banco efêmero de CI. Sem as URLs, as integrações correspondentes são ignoradas; isso não certifica bancos reais. Consulte as [verificações executadas](docs/product/implementation-plan.md).

### Contratos e consulta inteligente

`consultaSemantica` v2 separa agregação (múltiplas métricas) de listagem (dimensões) e mantém v1 compatível. `validar_consulta` aplica o mesmo preflight de `consultar_dados` e só executa envelope vazio. `publicar_skill` funciona em preview/diff + `confirmacaoHash` antes da confirmação efetiva. Anotações podem ter data/cadência de revisão; a fila de `listar_anotacoes` apenas prioriza manutenção do conhecimento e nunca licencia SQL. `listar_metricas_agente.painel` resume tendência, erro, cache e truncamento sem conteúdo sensível. Timings do hub são solicitados por amostragem com `PLUG_SERVER_TIMINGS_SAMPLE_PERCENT` (0..100, padrão 10). O contrato REST versionado é gerado no repositório irmão pelo script `contract:generate`, protegido por baseline que rastreia todos os campos públicos e verificado na CI.

Operação proativa é separada do servidor HTTP: `npm run worker:operacoes` calcula SLO e revisões por `acessoId`, grava somente IDs/contagens/taxas e entrega alertas a uma caixa MCP. Webhook é opcional por acesso, exige confirmação, HTTPS público sem query/credenciais e segredo cifrado; eventos são assinados e entregues pelo menos uma vez. Nenhuma dessas funções é conhecimento, RAG ou licença de SQL.

## Testes live contra o plug-server real

`npm run test:live` roda `tests/live/`, que autentica com uma conta de teste dedicada no plug-server (nunca uma conta de produção) e chama a API real. Requer as variáveis `E2E_AGENT_ID`, `E2E_CLIENT_TOKEN`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD` e `E2E_DIALETO` no `.env` (ver `.env.example`). Sem essas variáveis, a suíte se pula sozinha — nunca falha por falta de credenciais, e nunca roda como parte de `npm test`.

## Conectar um cliente

Ver [docs/clients/connecting-clients.md](docs/clients/connecting-clients.md).

## Documentação

1. Norte — [docs/product/objective.md](docs/product/objective.md)
2. Tools e erros — [docs/mcp/tools.md](docs/mcp/tools.md), [docs/mcp/error-mapping.md](docs/mcp/error-mapping.md)
3. Hub REST — [docs/plug-server/communication.md](docs/plug-server/communication.md) (adapter: [rest-integration.md](docs/plug-server/rest-integration.md))
4. Modelo e FTS — [docs/data/data-model.md](docs/data/data-model.md)
5. Índice — [`docs/README.md`](docs/README.md). Changelog — [`CHANGELOG.md`](CHANGELOG.md). Histórico das três camadas — [docs/proposta-arquitetura-mcp-se7e.md](docs/proposta-arquitetura-mcp-se7e.md)

TypeScript 7 compila e checa tipos; a API TypeScript 6 é usada apenas pelas ferramentas de lint. `npm run compiler:check` confirma o compilador real. Dependências são fixadas pelo lockfile e instaladas por `npm ci`, sem force/legacy-peer-deps. CI inclui Windows, Linux, Redis/PostgreSQL e musl x64/arm64. [Escopo e verificações](docs/product/implementation-plan.md), [cadastro/rotação](docs/auth/vault-and-mcp-token.md).

## Plugin privado do ChatGPT

OAuth integrado opcional para um acesso existente, token somente no navegador. Flag CHATGPT_OAUTH_ENABLED desligada por padrão. Configuração, instalação, segurança, testes e rollback: [contrato ChatGPT](docs/auth/chatgpt-oauth.md). Fonte do pacote: [plugins/se7e-chatgpt](plugins/se7e-chatgpt/README.md).

### Verificação antes do piloto ChatGPT

Execute `npm run chatgpt:check -- --stage=prepare --json` após preparar PostgreSQL/HTTPS. Depois da configuração real da conexão, execute `npm run chatgpt:check -- --stage=pilot --package=<diretorio> --connection-id=<ID_REAL> --json`. O comando é somente leitura e separa prontidão automática de homologação no ChatGPT. Veja [OAuth](docs/auth/chatgpt-oauth.md) e [validação](docs/operations/chatgpt-validation.md).

`test:chatgpt:https` usa TLS real; `test:chatgpt:browser` usa Chromium e um banco efêmero próprio, exigindo NODE_ENV=test e DATABASE_URL de CI. Instale Chromium com `npx playwright install chromium`. O gate `node:check` exige a faixa de engines antes de release:check.
