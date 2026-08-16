# Autenticação no plug-server (visão do MCP)

O hub autentica **três papéis distintos**. O MCP usa só o papel `Client`. Confundir `User`, `Client` e `Agent` quebra login, aprovação e `sql.execute`.

Fonte: `plug_server/docs/api/client_agent_business_rules.md` e `plug_server/docs/api/user_status.md`.

## Papéis

| Papel    | Quem é no ERP Se7e                    | Como autentica                                     | O que pode fazer                           |
| -------- | ------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `User`   | Dono da conta / admin do agente       | `POST /api/v1/auth/login`                          | Aprovar Clients, governar Agents           |
| `Agent`  | `plug_agente` na máquina do cliente   | `POST /api/v1/auth/agent-login` + `agent:register` | Executar SQL no banco local                |
| `Client` | Integrador (este MCP, n8n, app, etc.) | `POST /api/v1/client-auth/login`                   | Comandar **só** Agents com acesso aprovado |

JWT traz `principal_type: "user" | "client"` (agente usa role de namespace `/agents`). Token de `client` **não** acessa rotas de `user` e vice-versa.

O MCP **nunca** faz `auth/login` nem `agent-login`. Credenciais de serviço: `PLUG_SERVER_CLIENT_EMAIL` / `PLUG_SERVER_CLIENT_PASSWORD` (conta `Client` já `active`).

## Três checagens em cascata

Cada `consultar_dados` passa por **três** portões independentes. Falhar em qualquer um bloqueia a query.

```text
1. JWT de Client (hub)          → o MCP é quem diz ser?
2. ClientAgentAccess (hub)      → este Client pode falar com este agentId?
3. client_token (plug_agente)   → este SQL é permitido na política do ERP?
```

O MCP não reimplementa (2) nem (3). Só autentica (1), pede aprovação para (2) e **repassa** o token opaco em (3).

## 1. JWT de Client

Rotas (prefixo `/api/v1`):

| Método | Caminho                | Uso no MCP                                     |
| ------ | ---------------------- | ---------------------------------------------- |
| POST   | `/client-auth/login`   | Email + senha → `accessToken` + `refreshToken` |
| POST   | `/client-auth/refresh` | Rotação do access token                        |
| POST   | `/client-auth/logout`  | Não usado na Fase 1                            |
| GET    | `/client-auth/me`      | Diagnóstico (não é tool)                       |

Regras:

- Só conta `Client` com status `active` autentica. `pending` / `rejected` / `blocked` falham no login, no refresh e em rotas Bearer (`403`).
- Cadastro público (`/client-auth/register`) nasce `pending` e exige aprovação do `User` dono (`ownerEmail`). O MCP **não** registra Clients em runtime — a conta de serviço já existe.
- Toda chamada autenticada: `Authorization: Bearer <accessToken>`.
- `ServiceTokenManager` guarda o par em memória, refresca ~60 s antes do `exp`, e em HTTP `401` invalida e tenta de novo uma vez.

Rate limits do hub (produção, ordem de grandeza — confirmar em `limites_acesso_e_quotas.md` do plug-server): login por IP; refresh tem janela própria mais folgada; `POST /agents/commands` conta por JWT `sub`. Headers `Retry-After` / `RateLimit-Reset` devem ser respeitados (`RATE_LIMITED`).

## 2. Acesso Client → Agent (`ClientAgentAccess`)

Um `Client` **não** herda os Agents do `User`. Cada `agentId` precisa de pedido + aprovação.

```text
MCP                         plug-server                      User (dono)
 │  POST /client/me/agents        │                               │
 │  { agentIds: [uuid] }          │                               │
 │───────────────────────────────►│  email / inbox de aprovação   │
 │  requested / newRequests /     │──────────────────────────────►│
 │  alreadyApproved               │                               │
 │                                │  approve → cria ClientAgentAccess
 │  GET /client/me/agents/{id}    │◄──────────────────────────────│
 │  200 = approved                │
 │  403 = ainda sem acesso        │
```

| Método | Caminho                                    | Semântica                                                                     |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------- |
| POST   | `/client/me/agents`                        | Pedir acesso. Idempotente se já aprovado (`alreadyApproved`).                 |
| GET    | `/client/me/agents/{agentId}`              | `200` se aprovado; `403` se não. Inclui `hasClientToken`, `isHubConnected`.   |
| PUT    | `/client/me/agents/{agentId}/client-token` | Grava o token SQL no hub (opcional para o agente; o MCP também envia no RPC). |
| GET    | `/client/me/agent-access-requests`         | Pedidos `pending` / `approved` / `rejected` / `expired` / `revoked`.          |

`isHubConnected` é um **instantâneo desta réplica** do hub (agente registado em `/agents` neste processo). Com várias instâncias, pode ser `false` mesmo com o agente online noutra réplica.

Em comandos (`POST /agents/commands`):

- `principal_type: user` → autoriza por `AgentIdentity` (é dono).
- `principal_type: client` → autoriza por `ClientAgentAccess`. Sem linha = HTTP `403` (`AGENT_ACCESS_DENIED` no MCP).

Revogação (owner ou o próprio Client) derruba o acesso imediato. Socket `/consumers` ativo é desconectado (`AGENT_ACCESS_REVOKED`); no REST, o próximo comando falha `403`.

## 3. `client_token` (autorização SQL no agente)

Não é o JWT do Client. É um token **opaco** (ou JWT próprio do agente) emitido pelo admin do ERP. O `plug_agente` classifica o SQL e aplica a política (`all_tables`, regras por tabela, permissões read/update/delete/ddl).

- Obrigatório em `sql.execute` quando `enableClientTokenAuthorization` está ativo no agente (aliases aceitos pelo hub: `client_token`, `clientToken`, `auth`).
- O MCP persiste criptografado (`ambiente.client_token_encriptado`) e só descriptografa ao montar o body do RPC.
- Nunca vai para log, resposta de tool ou `hint` de erro.
- Introspecção **sem SQL**: RPC `client_token.getPolicy` no mesmo `POST /agents/commands`.

SQL precisa ser **classificável**: o agente identifica tabela/view no `FROM`. `SELECT 1` sem `FROM` é negado com JSON-RPC `-32002` mesmo com política permissiva. Detalhe em [communication.md](communication.md).

## O que o usuário final informa (e o que não informa)

Informa, via tools MCP: `agentId`, `dialeto`, `client_token`.

Não informa: senha do `plug-server`, JWT de serviço, senha do banco ERP. Ver [`../auth/identity-and-oauth.md`](../auth/identity-and-oauth.md).

## Conta bloqueada

`User` ou `Client` `blocked`: login/refresh `403` (`Account is blocked`); Bearer ainda válido é recusado após lookup da conta; sockets `/consumers` deixam de autorizar eventos (e o hub desconecta no bloqueio). O MCP mapeia persistência disso para `SERVICE_AUTH_EXPIRED` / `AGENT_ACCESS_DENIED` conforme o status HTTP — não tente “consertar” com retry cego.
