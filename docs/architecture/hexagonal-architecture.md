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
- **application**: um caso de uso por tool (`cofre`, `treinar-com-sql`, `consultar`, `skills`).
- **infrastructure**: HTTP, MCP SDK, Drizzle, adapter REST, Pino. Catálogo dinâmico: tools `skill_*` por sessão, resource `skill://`, prompts.
- **composition**: `compose.ts` escolhe memória ou Postgres (`DATABASE_URL`).

## Identidade

Bearer MCP → hash SHA-256 → `usuario_mcp`. ALS só na borda (`currentAccountId()`). Casos de uso recebem `usuarioId`.

## Plug-server

`PlugServerGatewayPort`: `login`, `refresh`, `requestAgentAccess`, `getAgentAccessStatus`, `putClientToken`, `getClientTokenPolicy`, `executeSql`. JWT do hub por usuário (`UsuarioTokenManager`). Cache de policy por hash do `client_token`. Canal da Fase 1: REST `POST /api/v1/agents/commands` (`sql.execute`, `client_token.getPolicy`, `execution_mode: preserve`). Socket fica fora desta fase.

## Grafo e skills

Escrita do grafo com `withAgentLock`. Dialeto no primeiro merge. Leitura filtrada por `getClientTokenPolicy`.

O grafo apoia o treino. A consulta na sessão usa skill publicada (`sqlModelo`). Sem skill capaz, a IA admite a lacuna — não deriva SQL do grafo.
