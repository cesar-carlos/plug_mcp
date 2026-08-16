# Comunicação com o plug-server (visão do MCP)

O hub é um proxy: o consumer (MCP) manda um comando; o hub valida, empacota em `PayloadFrame` e despacha JSON-RPC 2.0 para o `plug_agente` no namespace Socket `/agents`. A resposta volta pelo **mesmo canal** em que o consumer entrou.

Fonte: `plug_server/docs/PROJECT_OVERVIEW.md` e `plug_server/docs/api/api_rest_bridge.md`. OpenAPI vivo: `GET /docs`.

## Canais

| Canal                      | Entrada do consumer            | Streaming para o consumer                           | Fase 1 do MCP                          |
| -------------------------- | ------------------------------ | --------------------------------------------------- | -------------------------------------- |
| REST                       | `POST /api/v1/agents/commands` | Não. Hub **materializa** o stream e devolve um JSON | **Sim**                                |
| Socket legado `/consumers` | evento `agents:command`        | Sim (`agents:command_stream_*`)                     | Não                                    |
| Socket relay `/consumers`  | `relay:rpc.request`            | Sim; idempotência por conversa                      | Não (port já permite trocar o adapter) |

REST é o canal certo para tool MCP: cada `tools/call` é um request isolado, sem sessão Socket. O hub já materializa `stream_id`. Relay (`prefer_db_streaming`) entra depois, atrás de `PlugServerGatewayPort`, sem mudar tools.

Auth, catálogo, CRUD e métricas do hub **não** existem no Socket — só HTTP.

```text
IA ──MCP tools──► se7e-mcp-server ──REST + JWT Client──► plug-server
                                                         │  rpc:request
                                                         ▼
                                                    plug_agente ──SQL──► ERP
```

Bootstrap do agente (não é trabalho do MCP): `agent-login` → Socket `/agents` → `agent:register` → (opcional) `agent:ready`. Sem registro, o comando falha (`AGENT_UNAVAILABLE` / agente offline).

## Envelope REST (`POST /api/v1/agents/commands`)

Header obrigatório: `Authorization: Bearer <accessToken do Client>`.

```json
{
  "agentId": "<uuid>",
  "timeoutMs": 30000,
  "command": {
    "jsonrpc": "2.0",
    "method": "sql.execute",
    "id": "<uuid>",
    "params": {
      "sql": "SELECT ... FROM ...",
      "params": { "dataInicio": "2026-08-01" },
      "client_token": "<opaco>",
      "options": { "max_rows": 500 }
    }
  }
}
```

| Campo do body | Papel                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentId`     | Um agente por envelope. Batch JSON-RPC (array em `command`) vai todo para o **mesmo** agente.                                                                                                                                                 |
| `command`     | Objeto JSON-RPC ou array (máx. 32). Discriminado por `method`.                                                                                                                                                                                |
| `timeoutMs`   | Espera do **bridge** (default 30 s, teto 360 s). Não confundir com `options.timeout_ms` no agente.                                                                                                                                            |
| `command.id`  | Omitido → hub gera UUID e **espera** resposta. `null` → notification (`202`). String/number → correlação. Replay do mesmo `id` em ~2 min no mesmo `agentId` → `-32014` `replay_detected` (por isso o MCP gera UUID novo a cada `executeSql`). |

Métodos usados pelo MCP hoje: `sql.execute`. Útil em diagnóstico: `client_token.getPolicy` (sem SQL). Outros (`sql.executeBatch`, `agent.getHealth`, `rpc.discover`, …) existem no hub; não expor como tool até haver caso de uso.

### `sql.execute` — params relevantes

| Campo                        | Obrigatório | Notas                                                                                                                                                                      |
| ---------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sql`                        | sim         | Até 1 MiB UTF-8 no hub. Precisa de `FROM` com tabela/view real.                                                                                                            |
| `params`                     | não         | Nomeados. Até 2 MiB JSON.                                                                                                                                                  |
| `client_token`               | condicional | Obrigatório se o agente exige autorização por token.                                                                                                                       |
| `options.max_rows`           | não         | Hub aceita até 1_000_000; o MCP aplica teto próprio (`QUERY_*`).                                                                                                           |
| `options.timeout_ms`         | não         | Timeout **no agente** (1..300_000).                                                                                                                                        |
| `options.page` + `page_size` | não         | Juntos; exigem `ORDER BY` explícito (contrato agente v2.4+).                                                                                                               |
| `options.execution_mode`     | não         | `managed` (default no hub, pode reescrever para paginar) ou `preserve`. O MCP envia **`preserve`**: já aplica `max_rows` e não pode deixar o hub reescrever `SUM`/`COUNT`. |

O adapter normaliza o envelope (`response.item.result`) para `{ columns, rows }`. HTTP `200` com `response.item.error` **ainda é falha** — mapear via `mapPlugServerFailure`, não tratar como sucesso.

## Classificação SQL no agente

O `plug_agente` **classifica** o SQL para decidir se o `client_token` autoriza aquela tabela/operação. Sem tabela/view no `FROM`, a classificação falha e o agente nega:

- JSON-RPC `-32002`, `message`: `Not authorized`
- `data.technical_message` contém `classification`
- Acontece **mesmo** com `all_tables: true` / `all_permissions: true`

`map-plug-error.ts` troca o hint genérico de `ACCESS_REVOKED` (“peça outro token”) por orientação para ajustar o SQL. Fontes do catálogo já referenciam tabelas reais do ERP; o cuidado vale para SQL ad-hoc e testes live (usar catálogo de sistema: `sysobjects`, `sys.objects`, `pg_catalog.pg_class`, `RDB$RELATIONS`).

## Erros que o hub devolve

Dois envelopes possíveis no mesmo POST:

1. **HTTP** 401 / 403 / 429 / 503 — falha no hub (JWT, `ClientAgentAccess`, rate limit, agente offline, materialização REST estourou).
2. **HTTP 200 + JSON-RPC error** em `response.item.error` — o agente recebeu e recusou/falhou.

Códigos RPC que o MCP mapeia:

| RPC      | Situação típica                  | `code` MCP             |
| -------- | -------------------------------- | ---------------------- |
| `-32001` | `client_token` ausente           | `MISSING_CLIENT_TOKEN` |
| `-32002` | política / classificação / token | `ACCESS_REVOKED`       |
| `-32008` | timeout no agente                | `QUERY_TIMEOUT`        |
| `-32009` | SQL inválido no dialeto          | `INVALID_SQL`          |
| `-32013` | rate limit no agente             | `RATE_LIMITED`         |
| `-32000` | agente offline / não pronto      | `AGENT_UNAVAILABLE`    |

Tabela completa e hints: [`../mcp/error-mapping.md`](../mcp/error-mapping.md).

## Limites que importam para o MCP

Camadas independentes: Nginx (borda, costuma `503`) → Express (`429` `TOO_MANY_REQUESTS`) → agente (`-32013`).

No REST de comandos, o hub materializa o stream em memória. Estouro de linhas/chunks de materialização → `503` (prefira Socket para resultados enormes). O MCP já corta em `QUERY_ABSOLUTE_MAX_ROWS` (5_000) **antes** de depender do teto do hub.

`consultar_dados` deve preferir agregação, `WHERE` e paginação no SQL — não aumentar tetos.

## O que não fazer neste canal

- Não abrir Socket `/agents` (é o namespace do `plug_agente`).
- Não misturar `agentId`s num único batch.
- Não reusar `command.id` entre chamadas.
- Não comprimir SSE do MCP; compressão gzip do **hub** (`payloadFrameCompression`) é outro hop e hoje fica no default do plug-server.
- Não executar SQL mutante em testes live, mesmo com token permissivo.
