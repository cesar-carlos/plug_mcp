# Adapter REST neste MCP

Canal da Fase 1: **somente REST**. Contrato do hub: [communication.md](communication.md). Autenticação Client / aprovação / `client_token`: [auth.md](auth.md).

Base URL: `PLUG_SERVER_BASE_URL` (ex.: `https://plug-server.se7esistemassinop.com.br`). Prefixo canónico: `/api/v1`.

## Endpoints que o adapter chama

| Método | Caminho                                    | Port                                           |
| ------ | ------------------------------------------ | ---------------------------------------------- |
| POST   | `/client-auth/login`                       | `ServiceTokenManager`                          |
| POST   | `/client-auth/refresh`                     | `ServiceTokenManager`                          |
| POST   | `/client/me/agents`                        | `requestAgentAccess`                           |
| GET    | `/client/me/agents/{agentId}`              | `getAgentAccessStatus`                         |
| GET    | `/client/me/agent-access-requests`         | resolução de 403 (pending vs rejected/revoked) |
| PUT    | `/client/me/agents/{agentId}/client-token` | `putClientToken`                               |
| POST   | `/agents/commands` (`sql.execute`)         | `executeSql`                                   |

`GET /client/me/agents/{agentId}/client-token` existe no hub; o MCP não lê o token de volta — a fonte local criptografada é a autoridade para montar o RPC.

## `ServiceTokenManager`

- Cache em memória do `accessToken` / `refreshToken`.
- Refresh proativo ~60 s antes do `exp`.
- Promessa `inflight` única (evita N logins simultâneos).
- Refresh falhou → login completo. Sem secrets → `SERVICE_AUTH_EXPIRED`.
- Em `401` mid-request: `invalidate()` + um retry.
- Logs: só `accessTokenLen`, nunca o valor (ver `security.mdc`).

## Por que não Socket agora

Cada tool MCP é um request isolado — o caso que o hub recomenda para REST. O bridge já materializa `stream_id`. Trocar para `relay:*` no futuro altera só o adapter atrás de `PlugServerGatewayPort`.
