# Arquitetura hexagonal

```text
Cliente MCP
   │  Streamable HTTP
   │  Bearer token MCP  (ou bootstrap sem Bearer)
   ▼
Express  /mcp  /setup/:code  /health  /.well-known/oauth-protected-resource
   │
use-cases  →  ports  ←  adapters (Drizzle, REST plug-server, crypto)
```

- **domain**: entidades (`UsuarioMcp`, `Acesso`, grafo, skill), ports, `DomainError`.
- **application**: um caso de uso por tool (`cofre`, `treinar-com-sql`, `consultar`, `skills`, `aprendizado`).
- **infrastructure**: HTTP, MCP SDK, Drizzle, adapter REST, Pino. Tools `skill_*` por sessão atrás de `MCP_SKILL_TOOLS_ENABLED`; resource `skill://`; prompts. Cache de resultado agregado (Redis opcional).
- **composition**: `compose.ts` escolhe memória ou Postgres (`DATABASE_URL`).

## Identidade

Bearer MCP → hash SHA-256 → `usuario_mcp`. ALS só na borda (`currentAccountId()`). Casos de uso recebem `usuarioId`.

## Plug-server

`PlugServerGatewayPort`: `login`, `refresh`, `requestAgentAccess`, `getAgentAccessStatus`, `putClientToken`, `getClientTokenPolicy`, `executeSql`. JWT do hub por usuário (`UsuarioTokenManager`). Cache de policy por hash do `client_token`. Canal da Fase 1: REST `POST /api/v1/agents/commands` (`sql.execute`, `client_token.getPolicy`, `execution_mode: preserve`). Socket fica fora desta fase.

## Grafo e skills

Escrita do grafo com `withAgentLock`. Dialeto no primeiro merge. Leitura filtrada por `getClientTokenPolicy`.

O grafo apoia o treino e acumula fatos confirmados pela execução. A consulta na sessão usa skill publicada como **escopo**: sem `sql`, o servidor executa a consulta exemplo (`sqlModelo`); com `sql`, o validador recusa tabela/coluna/JOIN fora do pacote. Sem skill capaz, a IA admite a lacuna.
