# Comunicação com o plug-server (visão do MCP)

O hub é um proxy: o consumer (MCP) manda um comando; o hub valida, empacota em `PayloadFrame` e despacha JSON-RPC 2.0 para o `plug_agente` no namespace Socket `/agents`. A resposta volta pelo **mesmo canal** em que o consumer entrou.

Fonte: `plug_server/docs/PROJECT_OVERVIEW.md` e `plug_server/docs/api/api_rest_bridge.md`. OpenAPI vivo: `GET /docs` / `GET /docs.json`.

## Canais

| Canal                      | Entrada do consumer            | Streaming para o consumer                           | Canal do MCP         |
| -------------------------- | ------------------------------ | --------------------------------------------------- | -------------------- |
| REST                       | `POST /api/v1/agents/commands` | Não. Hub **materializa** o stream e devolve um JSON | **Sim** (único)      |
| Socket legado `/consumers` | evento `agents:command`        | Sim (`agents:command_stream_*`)                     | Não (fora de escopo) |
| Socket relay `/consumers`  | `relay:rpc.request`            | Sim; idempotência por conversa                      | Não (fora de escopo) |

REST é o canal do MCP: cada `tools/call` é um request isolado, sem sessão Socket. O hub já materializa `stream_id`. Socket `/agents` é o namespace do `plug_agente` (hub → agente), não um canal deste servidor. Socket/relay de consumer (`/consumers`, `prefer_db_streaming`) está **fora de escopo**.

Auth, catálogo, CRUD e métricas do hub **não** existem no Socket — só HTTP.

```text
IA ──MCP tools──► se7e-mcp-server ──REST + JWT do Client do usuário──► plug-server
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
      "options": { "max_rows": 500, "execution_mode": "preserve" }
    }
  }
}
```

| Campo do body | Papel                                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentId`     | Um agente por envelope. Batch JSON-RPC (array em `command`) vai todo para o **mesmo** agente.                                                                                                                                                                                |
| `command`     | Objeto JSON-RPC ou array (máx. 32). Discriminado por `method`.                                                                                                                                                                                                               |
| `timeoutMs`   | Espera do **bridge** (default 30 s, teto 360 s). Não confundir com `options.timeout_ms` no agente. O MCP envia o wait efetivo (`timeout_ms + 5s` quando há timeout da skill) e aborta o HTTP só depois desse wait + download do JSON — não usa um teto fixo de 35s na query. |
| `command.id`  | Omitido → hub gera UUID e **espera** resposta. `null` → notification (`202`). String/number → correlação. Replay do mesmo `id` em ~2 min no mesmo `agentId` → `-32014` `replay_detected` (por isso o MCP gera UUID novo a cada `executeSql`).                                |

Métodos usados pelo MCP hoje: `sql.execute`. Útil em diagnóstico: `client_token.getPolicy` (sem SQL). Outros (`sql.executeBatch`, `agent.getHealth`, `rpc.discover`, …) existem no hub; não expor como tool até haver caso de uso.

### `sql.execute` — params relevantes

| Campo                        | Obrigatório | Notas                                                                                                                                                                                                                           |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sql`                        | sim         | Até 1 MiB UTF-8 no hub. Precisa de `FROM` com tabela/view real.                                                                                                                                                                 |
| `params`                     | não         | Nomeados. Até 2 MiB JSON.                                                                                                                                                                                                       |
| `client_token`               | condicional | Obrigatório se o agente exige autorização por token.                                                                                                                                                                            |
| `options.max_rows`           | não         | Hub aceita até 1_000_000; o MCP aplica teto próprio (`QUERY_*`).                                                                                                                                                                |
| `options.timeout_ms`         | não         | Timeout **no agente** (1..300_000).                                                                                                                                                                                             |
| `options.page` + `page_size` | não         | Juntos; exigem `ORDER BY` no SELECT externo (contrato agente v2.4+). O MCP omite `execution_mode` e o hub usa `managed`. Sem o par, envia `execution_mode: preserve`.                                                           |
| `options.execution_mode`     | não         | `managed` (default no hub, pode reescrever para paginar) ou `preserve`. Sem paginação o MCP envia **`preserve`**: já aplica `max_rows` e não pode deixar o hub reescrever `SUM`/`COUNT`. Com `page`+`page_size`, omite o campo. |

O adapter normaliza o envelope (`response.item.result`) para `{ columns, rows }`. HTTP `200` com `response.item.error` **ainda é falha** — mapear via `mapPlugServerFailure`, não tratar como sucesso.

### Células binárias (`sql.execute` result)

O `plug_agente` (`normalizeOdbcWireCell`) serializa `varbinary` / `bytea` / `image` (ODBC `Uint8List`) como **string base64** no JSON. O hub REST **não** reencoda; o MCP também não. Não é o caminho habitual `{ type: "Buffer", data: [...] }` (Node `JSON.stringify(Buffer)`), hex, nem célula omitida — o MCP trata Buffer JSON / array de bytes só como defesa.

Estouro no agente: JSON-RPC `-32105` `reason: result_too_large` (MCP → `CONSULTA_ORCAMENTO` / `sql_engine`). Payload ~10 MB → `-32009`. Materialize REST overflow → HTTP 503. O MCP **não** inventa RPC: se o blob passar, extrai para handle **antes** do corte de 2048 caracteres e **não** despeja bytes nas rows (stub `kind: anexo`). Célula acima do teto local também é `CONSULTA_ORCAMENTO` com `source: mcp` / `stage: anexo` (não é o validador do pacote — **não** reescreva o SQL). `Buffer`/`Uint8Array` reais extraem; zip/ole sem tipo não vazam 2048 chars de base64.

## Classificação SQL no agente

O `plug_agente` **classifica** o SQL para decidir se o `client_token` autoriza aquela tabela/operação. Sem tabela/view no `FROM`, a classificação falha e o agente nega:

- JSON-RPC `-32002`, `message`: `Not authorized`
- `data.technical_message` contém `classification`
- Acontece **mesmo** com `all_tables: true` / `all_permissions: true`

`map-plug-error.ts` mapeia esse caso para `INVALID_SQL` (não `ACCESS_REVOKED`). Token válido + SQL com FROM ainda pode falhar se o dialeto do acesso estiver errado (ex.: `sybase` numa base SQL Server). `consultar_dados` completa o hint com as tabelas do SQL enviado. Fontes do catálogo já referenciam tabelas reais do ERP; o cuidado vale para SQL ad-hoc e testes live (usar catálogo de sistema: `sysobjects`, `sys.objects`, `pg_catalog.pg_class`, `RDB$RELATIONS`).

## Erros que o hub devolve

Dois envelopes possíveis no mesmo POST:

1. **HTTP** 401 / 403 / 429 / 503 — falha no hub (JWT, `ClientAgentAccess`, rate limit, agente offline, materialização REST estourou).
2. **HTTP 200 + JSON-RPC error** em `response.item.error` — o agente recebeu e recusou/falhou.

Códigos RPC que o MCP mapeia:

| RPC                                                                           | Situação típica                         | `code` MCP                               | `source`           |
| ----------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- | ------------------ |
| `-32001` `missing_client_token`                                               | `client_token` ausente                  | `MISSING_CLIENT_TOKEN`                   | `client_token_rpc` |
| `-32001` `invalid_signature` / `authentication_failed`                        | credencial/assinatura inválida          | `ACCESS_REVOKED`                         | `client_token_rpc` |
| `-32002`                                                                      | classificação SQL                       | `INVALID_SQL`                            | `sql_engine`       |
| `-32002`                                                                      | política / token                        | `ACCESS_REVOKED`                         | `client_token_rpc` |
| `-32008` / `-32107`                                                           | timeout no agente / motor               | `QUERY_TIMEOUT`                          | `sql_engine`       |
| `-32009` `reason: invalid_payload`                                            | frame / PayloadFrame / batch            | `PLUG_SERVER_ERROR`                      | `plug_server_http` |
| `-32009` haystack de motor (reason ≠ `invalid_payload`) / `-32101` / `-32102` | SQL inválido / execução no dialeto      | `INVALID_SQL` + `details.engineMessage`  | `sql_engine`       |
| `-32103`                                                                      | transação (MCP só SELECT)               | `INVALID_SQL`                            | `sql_engine`       |
| `-32105`                                                                      | resultado grande demais                 | `CONSULTA_ORCAMENTO`                     | `sql_engine`       |
| 1033 / `ORDER BY` em derived table (mssql, wrap `managed`)                    | Paginação gerenciada                    | `INVALID_SQL`                            | `sql_engine`       |
| `-32013`                                                                      | rate limit no agente                    | `RATE_LIMITED`                           | `client_token_rpc` |
| `-32000`                                                                      | agente conhecido, socket down           | `AGENT_UNAVAILABLE`                      | `plug_server_http` |
| `-32014`                                                                      | replay do mesmo `command.id`            | `PLUG_SERVER_ERROR`                      | `plug_server_http` |
| `-32104` / `-32106`                                                           | pool / conexão com o ERP                | `AGENT_UNAVAILABLE`                      | `plug_server_http` |
| HTTP 404                                                                      | `agentId` nunca registado nesta réplica | `AGENT_UNAVAILABLE` (`retryable: false`) | `plug_server_http` |
| HTTP 429 / 503                                                                | quota do hub / fila / Nginx             | `RATE_LIMITED` / `AGENT_UNAVAILABLE`     | `plug_server_http` |

HTTP 200 + JSON-RPC de motor (`-32102`, `-32101`, `-32009` com haystack de motor **e** reason ≠ `invalid_payload`) **não** vira `PLUG_SERVER_ERROR`: a IA lê `INVALID_SQL` + `source: sql_engine` e distingue do validador do pacote (`source: sql`). `-32009` `reason: invalid_payload` **é** transporte (`PLUG_SERVER_ERROR` + `plug_server_http`) mesmo se o haystack parecer motor — **não** reescreva o SQL. HTTP 5xx com texto `denied`/`permission` e sem RPC de policy também **não** vira `PERMISSION_DENIED`. SQL recusado **não** persiste. Tabela completa e hints: [`../mcp/error-mapping.md`](../mcp/error-mapping.md).

## Limites que importam para o MCP

Camadas independentes: Nginx (borda, costuma `503`) → Express (`429` `TOO_MANY_REQUESTS`) → agente (`-32013`).

`proxy_read_timeout` da borda do hub (ex. 180s no example de produção) corta o POST de `sql.execute` mesmo se o MCP esperar ~310s no teto (`timeout_ms` 300s + 5s de wait + 5s de download). Skills ~≥175s falham nessa borda; **120s** passa se o `location` de `/api/v1/agents/commands` estiver deployado com esse timeout. Isso não se mexe neste repo.

No REST de comandos, o hub materializa o stream em memória. Estouro de linhas/chunks de materialização → `503`. O MCP **não** muda para Socket: já corta em `QUERY_ABSOLUTE_MAX_ROWS` (5_000) **antes** de depender do teto do hub.

`consultar_dados` deve preferir agregação, `WHERE` e paginação no SQL — não aumentar tetos. Pools HTTP, keepAlive e abort deste MCP: [rest-integration.md](rest-integration.md).

## O que não fazer neste canal

- Não abrir Socket `/agents` (é o namespace do `plug_agente`).
- Não misturar `agentId`s num único batch.
- Não reusar `command.id` entre chamadas.
- Não comprimir SSE do MCP; compressão gzip do **hub** (`payloadFrameCompression`) é outro hop e hoje fica no default do plug-server.
- Não executar SQL mutante em testes live, mesmo com token permissivo.
