# Adapter REST neste MCP

Canal do MCP: **somente REST**. Contrato do hub: [communication.md](communication.md). Autenticação Client / aprovação / `client_token`: [auth.md](auth.md).

Fonte normativa no hub: `plug_server/docs/api/api_rest_bridge.md` e OpenAPI `GET /docs`. Base URL: `PLUG_SERVER_BASE_URL`. Prefixo: `/api/v1`.

## Endpoints que o adapter chama

| Método | Caminho                                                         | Port                                                                                                                                                            |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/client-auth/login`                                            | `login` via `UsuarioTokenManager`                                                                                                                               |
| POST   | `/client-auth/refresh`                                          | `refresh` via `UsuarioTokenManager`                                                                                                                             |
| POST   | `/client/me/agents`                                             | `requestAgentAccess`                                                                                                                                            |
| GET    | `/client/me/agents/{agentId}`                                   | `getAgentAccessStatus`                                                                                                                                          |
| GET    | `/client/me/agent-access-requests?search={agentId}&pageSize=20` | resolução de 403 (pending vs rejected/revoked)                                                                                                                  |
| PUT    | `/client/me/agents/{agentId}/client-token`                      | `putClientToken` após gravar o acesso e quando o hub passa a `approved`. Best-effort: falha não desfaz o cofre. O RPC ainda envia o token.                      |
| POST   | `/agents/commands` (`sql.execute`)                              | `executeSql` — sem página: `execution_mode: preserve`; com `page`+`page_size`: omite o campo (`managed`). Resultado normaliza `column_metadata` e `pagination`. |
| POST   | `/agents/commands` (`client_token.getPolicy`)                   | `getClientTokenPolicy` (cache por hash)                                                                                                                         |

O MCP não lê o `client_token` de volta do hub — a cópia cifrada no cofre é a autoridade.

Cada `sql.execute` usa `command.id` UUID novo (replay no hub ~2 min). HTTP 200 com `response.item.error` é falha (`mapPlugServerFailure`). Mapa RPC → `code`/`source`: [communication.md](communication.md) e [error-mapping.md](../mcp/error-mapping.md).

## Timeouts e keep-alive

O adapter não corta o HTTP em 35s quando a skill pede mais tempo. `PLUG_SERVER_HTTP_TIMEOUT_MS` (default 35s, **máx. 60s**) é o **piso** de login/refresh/`getPolicy` — não o teto de `sql.execute`. Em `sql.execute`:

- `options.timeout_ms` no agente: teto **300s** (`api_rest_bridge.md` / contrato do `plug_agente`).
- `timeoutMs` no envelope: wait do **bridge** (`max(body, timeout_ms + 5s)`, teto **360s`).
- `AbortSignal` HTTP: esse wait + 5s para baixar o JSON materializado. Sem isso o MCP abortava enquanto o hub ainda esperava o agente.

O cliente HTTP reusa TCP/TLS em **dois** `http(s).Agent`: login/refresh/`getPolicy` (até 4 sockets) e `sql.execute` (até 16), para SQL longo não esgotar o JWT. `keepAliveMsecs: 30000` é **probe TCP keepalive**, não idle de 30s: o socket fica até o peer fechar (`keepalive_timeout` do Nginx do hub). O `fetch` global do Node (undici) fecha idle em ~4s — intervalo típico entre tools MCP — e refazia handshake a cada query. Não há retry automático de SQL (não idempotente; 429 só devolve `retryAfterMs`). JWT vai no `Authorization: Bearer` de cada request; não há cookie jar.

A borda Nginx do hub (`proxy_read_timeout`, ex. **180s** no example de produção) ainda corta o POST de commands **antes** do abort MCP (~310s no teto da skill). Skills ~≥175s falham na borda (504/503) mesmo com wait+download corretos neste repo. Skill com `timeout_ms` **120s** passa (wait ~125s) se o `location` de `/api/v1/agents/commands` com esse timeout estiver deployado. O ajuste é no Nginx do hub, não neste MCP.

Batch JSON-RPC (`command: []`, máx. 32, mesmo `agentId`) e `sql.executeBatch` existem no hub/agente; o MCP **não** agrupa `getPolicy` + `sql.execute` porque a policy entra no cache key e no recorte fail-closed **antes** do SELECT. O adapter REST ainda envia um `command` por POST. `enriquecer=completo` dispara até 16 `sql.execute` com concorrência `PERFIL_SQL_CONCURRENCY` (4) — falha isolada vira aviso.

## `UsuarioTokenManager`

JWT do hub **por `usuarioId`**, só em memória — regras em [auth.md](auth.md). Restart reloga com e-mail/senha cifrados. Rode **1 instância**. Logs: só `accessTokenLen`, nunca o valor.

## Por que não Socket/relay

Cada tool MCP é um request isolado — o caso que o hub recomenda para REST. O bridge já materializa `stream_id`. Socket/relay de consumer (`/consumers`) está **fora de escopo** (não é fase seguinte).
