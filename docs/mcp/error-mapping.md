# Mapeamento de erros

Formato único devolvido às tools:

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Sem permissão para a tabela ITEMVENDA neste ambiente.",
    "hint": "Peça ao administrador do ERP para liberar esta tabela no client_token, ou use outra fonte.",
    "retryable": false,
    "retryAfterMs": null
  }
}
```

- `retryable: true` → a IA pode repetir (com backoff se `retryAfterMs`).
- `retryable: false` → replanejar SQL, pedir dado ao usuário ou repassar a decisão.

Envelope REST vs JSON-RPC e quando o SQL é inclassificável: [`../plug-server/communication.md`](../plug-server/communication.md).

## JSON-RPC do agente / hub

| Código RPC | reason típico                                   | `code` MCP             | retryable |
| ---------- | ----------------------------------------------- | ---------------------- | --------- |
| `-32001`   | `authentication_failed`, `missing_client_token` | `MISSING_CLIENT_TOKEN` | false     |
| `-32002`   | `unauthorized`, `token_revoked`                 | `ACCESS_REVOKED`       | false     |
| `-32008`   | `timeout`                                       | `QUERY_TIMEOUT`        | true      |
| `-32009`   | `invalid_payload`                               | `INVALID_SQL`          | false     |
| `-32013`   | rate limit no agente                            | `RATE_LIMITED`         | true      |
| `-32000`   | `agent_offline`                                 | `AGENT_UNAVAILABLE`    | true      |

## HTTP do bridge

| HTTP               | `code` MCP             | hint                                                                         |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------- |
| 401                | `SERVICE_AUTH_EXPIRED` | Token de serviço será renovado; retry interno. Se persistir, checar secrets. |
| 403                | `AGENT_ACCESS_DENIED`  | Ambiente sem aprovação. Rodar `verificar_status_ambiente`.                   |
| 429                | `RATE_LIMITED`         | Respeitar `Retry-After` / `RateLimit-Reset`.                                 |
| 503                | `AGENT_UNAVAILABLE`    | Agente offline ou fila cheia. Tentar de novo.                                |
| abort/timeout HTTP | `PLUG_SERVER_TIMEOUT`  | A conexão MCP→plug-server estourou `PLUG_SERVER_HTTP_TIMEOUT_MS`. Retryable. |

`verificar_status_ambiente`: HTTP 200 em `GET /client/me/agents/{id}` = `approved`. HTTP 403 dispara `GET /client/me/agent-access-requests`; `pending` permanece pending; `rejected`/`revoked`/`expired` viram `revoked` local; ausência de pedido = `unknown` (não degrada o status local).

## Domínio MCP

| `code`                    | Quando                                                                          |
| ------------------------- | ------------------------------------------------------------------------------- |
| `UNAUTHENTICATED`         | Sem Bearer da conta MCP                                                         |
| `AMBIENTE_NOT_FOUND`      | `ambienteId` inexistente ou de outra conta                                      |
| `FONTE_NOT_FOUND`         | slug desconhecido                                                               |
| `FONTE_JA_EXISTE`         | slug já registrado nesta conta e agente                                         |
| `FONTE_READONLY`          | tentativa de editar/apagar fonte do seed, ou relacionamento incremental no seed |
| `ANOTACAO_NOT_FOUND`      | anotação inexistente neste `agentId`                                            |
| `DIALECT_VARIANT_MISSING` | Fonte sem SQL para o dialeto do ambiente                                        |
| `AGENT_ACCESS_PENDING`    | Pedido de acesso ainda `pending`                                                |
| `VALIDATION_ERROR`        | Parâmetro inválido (uuid, dialeto, etc.)                                        |
| `INTERNAL_ERROR`          | Falha inesperada; mensagem genérica ao modelo                                   |
| `PLUG_SERVER_TIMEOUT`     | Abort HTTP contra o plug-server                                                 |
