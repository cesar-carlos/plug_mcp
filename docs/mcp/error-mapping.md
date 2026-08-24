# Mapeamento de erros

Envelope das tools:

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "O client_token não cobre uma ou mais tabelas deste SQL.",
    "hint": "Peça um client_token que inclua essas tabelas.",
    "retryable": false,
    "retryAfterMs": null
  }
}
```

Não vaze stack, SQL interno do MCP, senha, `client_token` ou token MCP.

## Hub / RPC

| Origem                      | `code`                                      | hint típico                                                    |
| --------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| JSON-RPC `-32001`           | `MISSING_CLIENT_TOKEN`                      | Configure o `client_token` no acesso.                          |
| `-32002` + "classification" | `ACCESS_REVOKED`                            | SQL sem FROM classificável; ajuste o SQL, não peça token novo. |
| HTTP 403 Client inativo     | `CLIENT_NOT_ACTIVE` / `AGENT_ACCESS_DENIED` | Ativar o Client; **não** tratar como senha errada.             |
| HTTP 429                    | `RATE_LIMITED`                              | `Retry-After`.                                                 |
| HTTP 503                    | `AGENT_UNAVAILABLE`                         | Agente offline; retry.                                         |
| HTTP 401                    | `USER_AUTH_EXPIRED`                         | Refresh/login com a senha do cofre.                            |
| abort HTTP                  | `PLUG_SERVER_TIMEOUT`                       | Retryable.                                                     |

## Domínio

| `code`                                   | Quando                                           |
| ---------------------------------------- | ------------------------------------------------ |
| `UNAUTHENTICATED`                        | Sem Bearer (fora do bootstrap) ou token inválido |
| `VALIDATION_ERROR`                       | Parâmetro ausente/inválido                       |
| `ACESSO_NOT_FOUND`                       | `acessoId` de outro usuário                      |
| `AGENT_ACCESS_PENDING`                   | Pedido ainda pending                             |
| `DIALECT_CONFLICT`                       | Segundo dialeto no mesmo `agentId`               |
| `CONFLICT`                               | Acesso/skill duplicado                           |
| `CREDENTIAL_STALE`                       | Senha do Client recusada                         |
| `PERMISSION_DENIED`                      | Policy do `client_token`                         |
| `USER_AUTH_EXPIRED`                      | JWT do Client recusado (401 do hub)          |
| `INVALID_SQL`                            | `SELECT *`, mutação, segundo comando         |
| `SKILL_NOT_FOUND` / `ANOTACAO_NOT_FOUND` | Id inexistente neste `agentId`               |
| `SKILL_NOT_PUBLISHED`                    | Skill em rascunho/validada em `consultar_dados` |
| `SKILL_GAP`                              | `buscar_contexto` sem skill publicada capaz (payload, não throw) |
| `RATE_LIMITED`                           | Teto HTTP ou por tool                        |
