# Autenticação e identidade

Existem **três credenciais distintas**. Confundi-las quebra o onboarding.

## 1. Conta MCP (usuário humano ↔ este servidor)

O host (ChatGPT/Claude/Cursor) autentica-se no MCP via **OAuth 2.1 Authorization Code + PKCE**.

- Metadados: `GET /.well-known/oauth-authorization-server` e `GET /.well-known/oauth-protected-resource`.
- DCR: `POST /oauth/register`.
- Authorize: `GET /oauth/authorize`.
- Token: `POST /oauth/token` (`authorization_code`, `refresh_token`).
- Login/registro: `GET|POST /oauth/login` e `GET|POST /oauth/signup` — única UI web. Não é painel de catálogo.
- JWT de acesso: `sub` = `mcp_account.id`, `aud` = URL do recurso MCP.

O usuário cria uma conta **neste** servidor (e-mail + senha). Essa conta agrupa os ambientes ERP.

## 2. Client de serviço no plug-server (MCP ↔ plug-server)

Contrato completo do hub (papéis `User`/`Client`/`Agent`, aprovação, `client_token`): [`../plug-server/auth.md`](../plug-server/auth.md).

Uma única conta `Client` do plug-server, configurada por secrets:

- `PLUG_SERVER_CLIENT_EMAIL`
- `PLUG_SERVER_CLIENT_PASSWORD`

Fluxo:

1. `POST /api/v1/client-auth/login` → `accessToken` + `refreshToken`.
2. `TokenManager` guarda em memória, renova **antes** do `exp` e em `401`.
3. `POST /api/v1/client-auth/refresh` quando necessário.

Este é o **único** ciclo automático de renovação. O usuário final não vê esses tokens.

## 3. Ambiente do usuário (`agentId` + `client_token` + dialeto)

Por empresa/ERP:

| Campo          | Origem               | Papel                          |
| -------------- | -------------------- | ------------------------------ |
| `agentId`      | Usuário / admin Se7e | Qual agente (banco) consultar  |
| `dialeto`      | Usuário              | Qual variante de SQL base usar |
| `client_token` | Admin do ERP         | Escopo SQL no `plug_agente`    |

O MCP, com a credencial de serviço, chama `POST /api/v1/client/me/agents` para solicitar acesso. O `User` dono do agente aprova. Depois o usuário informa o `client_token` (elicitation). O MCP persiste o token **criptografado** e envia em `sql.execute` — a IA nunca o vê.

## O que o usuário **não** informa

- E-mail/senha do `plug-server`.
- JWT de serviço.
- Senha do banco ERP.
