# Se7e MCP Server

Servidor persona-v2: personas com várias fontes, skills publicadas e concessões
explícitas. `npm run dev`, `npm start`, `npm run db:migrate` e a imagem Docker
padrão usam v2. O projeto ainda não atende clientes; a distribuição inicial é
exclusiva do servidor de teste, conforme DV2-017.

Comece pelo [primeiro deploy de teste](docs/persona-v2/first-test-deploy.md).
O [aceite integral para clientes](contracts/persona-v2-release.json) permanece
bloqueado e separado do [contrato de deploy de teste](contracts/persona-v2-test-deploy.json).

## Requisitos

Node 24.21.0 ou posterior da linha 24 LTS, TypeScript 7 real e PostgreSQL dedicado
à geração v2. Docker/Compose no destino. Redis é opcional para cache v2; não há
fallback para configuração legada. Hub/agente precisam do contrato compatível.

## Setup

### Produção neste servidor (container)

O destino inicial é de teste, com `NODE_ENV=production` e
`PERSONA_V2_DEPLOYMENT=test-server`. O compose padrão inclui
`docker-compose.persona-v2.test.yml`: servidor, worker, migração explícita e
verificação de configuração. Não cria banco nem usa credenciais de exemplo.

Preparação do host, segredos privados, proxy e protocolo SSH:
[procedimento do primeiro deploy](docs/persona-v2/first-test-deploy.md#preparar-o-servidor).
O CI preserva a imagem testada; o deploy transfere os mesmos bytes, verifica
hash/identidade e só então para, migra e inicia. Não há rollback ou retry automático.

### Local (Node + Postgres no Docker)

Provisionar banco MCP vazio dedicado. Preencher `.env` a partir de `.env.example`
com credenciais próprias e `PERSONA_V2_DEPLOYMENT=local`. Não reutilizar o banco
legado, hub ou ERP. A distribuição local com banco/Redis próprios está no
[compose candidato](docs/persona-v2/candidate-distribution.md).

```sh
npm ci
npm run db:migrate
npm run web:build
npm run dev
```

Em outro processo, `npm run worker`. Migrations não são aplicadas no startup.
Console: `/app/`; MCP: `/mcp`; saúde: `/health` e `/ready`. O campo
`complete: false` preserva a distinção entre serviço pronto e aceite integral.

## Bootstrap

Criar persona → cadastrar bases → treinar → publicar → conceder permissões →
conectar → consultar. Credenciais entram somente no navegador. Publicar e
conceder acesso são ações diferentes; aprovação Client de operações permanece
separada. Ver [onboarding](docs/persona-v2/onboarding.md) e
[console](docs/persona-v2/console.md).

## Scripts

| Script                                             | Finalidade                                      |
| -------------------------------------------------- | ----------------------------------------------- |
| `npm run dev` / `npm start`                        | Servidor v2 por fonte / build                   |
| `npm run worker`                                   | Worker v2                                       |
| `npm run db:migrate`                               | Migrações explícitas `migrations/persona-v2`    |
| `npm run release:check`                            | Checks gerais, contrato do hub, testes e builds |
| `npm run test:persona-v2:postgres`                 | Persistência v2 em bases descartáveis           |
| `npm run test:persona-v2:cache`                    | Redis v2 isolado                                |
| `npm run test:persona-v2:browser`                  | Jornadas v2 no navegador                        |
| `npm run docs:check`                               | Links, schemas e cobertura documental           |
| `npm run persona:release-check`                    | Aceite integral para clientes; ainda bloqueado  |
| `npm run dev:legacy` / `npm run db:migrate:legacy` | Somente regressões legadas, com banco separado  |

`runtime:check`, `worker:operacoes`, avaliador legado e alvo Docker `legacy-runtime`
continuam explícitos para regressões. Não fazem parte do deploy padrão.
O [avaliador v2](docs/persona-v2/consumer-evaluation.md) tem comando próprio.

### Contratos e consulta inteligente

[Consultas](docs/persona-v2/source-queries.md),
[cruzamentos](docs/persona-v2/federation.md),
[operações](docs/persona-v2/sql-operations.md) e
[contrato do hub](docs/plug-server/README.md). Consultas não permitem SQL fora do
contrato publicado. Anexos persistidos conservam prazo e vínculo após reinício,
com revalidação de autoridade, sem repetir consultas.

## Testes live contra o plug-server real

`test:live` é uma suíte legada explícita; nunca usar conta ou base operacional
como fixture. Testes v2 pela cadeia têm [procedimento próprio](docs/persona-v2/homologation-chain.md).

## Conectar um cliente

[OAuth v2](docs/persona-v2/oauth.md) e [plugin v2](docs/persona-v2/plugin.md).
Validação manual prévia está dispensada; configuração HTTPS, consentimento e
testes técnicos continuam necessários. Testes no destino não concedem autoridade.

## Documentação

[Índice](docs/README.md), [estado v2](docs/persona-v2/README.md),
[decisões](docs/persona-v2/decisions.md), [evidências](docs/persona-v2/validation.md)
e [changelog](CHANGELOG.md). Históricos e contratos legados não definem a v2.

## Plugin privado do ChatGPT

Usar o pacote da geração v2 com conexão e concessões próprias. Não reutilizar
identidade OAuth, Bearer ou pacote legado. Ver [plugin](docs/persona-v2/plugin.md).

### Verificação antes do piloto ChatGPT

`persona:https-check` verifica o alcance técnico descrito no
[contrato OAuth](docs/persona-v2/oauth.md). Não comprova instalação ou conversa
real, que podem ser exercitadas no servidor de teste sem bloquear seu primeiro arranque.
