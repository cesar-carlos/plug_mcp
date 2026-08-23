# Adapter REST neste MCP

Canal da Fase 1: **somente REST**. Contrato do hub: [communication.md](communication.md). Autenticação Client / aprovação / `client_token`: [auth.md](auth.md).

Fonte normativa no hub: `plug_server/docs/api/api_rest_bridge.md` e OpenAPI `GET /docs`. Base URL: `PLUG_SERVER_BASE_URL`. Prefixo: `/api/v1`.

## Endpoints que o adapter chama

| Método | Caminho                                                         | Port                                                   |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------ |
| POST   | `/client-auth/login`                                            | `login` via `UsuarioTokenManager`                      |
| POST   | `/client-auth/refresh`                                          | `refresh` via `UsuarioTokenManager`                    |
| POST   | `/client/me/agents`                                             | `requestAgentAccess`                                   |
| GET    | `/client/me/agents/{agentId}`                                   | `getAgentAccessStatus`                                 |
| GET    | `/client/me/agent-access-requests?search={agentId}&pageSize=20` | resolução de 403 (pending vs rejected/revoked)         |
| PUT    | `/client/me/agents/{agentId}/client-token`                      | `putClientToken` (opcional; o RPC ainda envia o token) |
| POST   | `/agents/commands` (`sql.execute`)                              | `executeSql` — `options.execution_mode: preserve`      |
| POST   | `/agents/commands` (`client_token.getPolicy`)                   | `getClientTokenPolicy` (cache por hash)                |

O MCP não lê o `client_token` de volta do hub — a cópia cifrada no cofre é a autoridade.

Cada `sql.execute` usa `command.id` UUID novo (replay no hub ~2 min). HTTP 200 com `response.item.error` é falha.

## `UsuarioTokenManager`

- JWT do hub **por `usuarioId`**, com e-mail/senha cifrados.
- Refresh proativo ~60 s antes do `exp`.
- Promessa `inflight` por usuário.
- Refresh falhou → login com senha do cofre. Falha de senha → `CREDENTIAL_STALE`.
- Client `pending`/`blocked` → 403 mapeado para ativação, não “senha errada”.
- Logs: só `accessTokenLen`, nunca o valor.

## Por que não Socket agora

Cada tool MCP é um request isolado — o caso que o hub recomenda para REST. O bridge já materializa `stream_id`. Trocar para `relay:*` no futuro altera só o adapter atrás de `PlugServerGatewayPort`.
