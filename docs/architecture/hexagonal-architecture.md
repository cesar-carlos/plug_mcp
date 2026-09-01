# Arquitetura hexagonal

```text
Cliente MCP
   │  Streamable HTTP
   │  Bearer token MCP  (ou bootstrap sem Bearer)
   ▼
Express  /mcp  /setup/:code  /health  /ready  /.well-known/oauth-protected-resource
   │
use-cases  →  ports  ←  adapters (Drizzle, REST plug-server, crypto)
```

- **domain**: entidades (`UsuarioMcp`, `Acesso`, grafo, skill), ports, `DomainError`.
- **application**: um caso de uso por tool (`cofre`, `treinar-com-sql`, `consultar`, `inspecionar`, `exportar-anexo`, `skills`, `aprendizado`).
- **infrastructure**: HTTP, MCP SDK, Drizzle, adapter REST, Pino. Tools `skill_*` por sessão atrás de `MCP_SKILL_TOOLS_ENABLED`; resources `skill://` e `persona://`; prompts. Tools de inspeção/descoberta/deriva atrás de flags. Cache de resultado agregado (Redis opcional; **não** cacheia blob de anexo). Handles de anexo em memória (`AnexoHandlePort`). `GET /health` versionado; `GET /ready` checa o banco quando há `DATABASE_URL`.
- **composition**: `compose.ts` escolhe memória ou Postgres (`DATABASE_URL`).

## Identidade

Bearer MCP → hash SHA-256 → `usuario_mcp`. ALS só na borda (`currentAccountId()`). Casos de uso recebem `usuarioId`. Cofre: [vault-and-mcp-token.md](../auth/vault-and-mcp-token.md).

## Plug-server

`PlugServerGatewayPort`: `login`, `refresh`, `requestAgentAccess`, `getAgentAccessStatus`, `putClientToken`, `getClientTokenPolicy`, `executeSql`. Canal: **só REST**. Contrato do hub: [communication.md](../plug-server/communication.md). Adapter (timeout, dois Agents, keepAlive): [rest-integration.md](../plug-server/rest-integration.md).

## Grafo e skills

Escrita do grafo com `withAgentLock`. Leitura filtrada por `getClientTokenPolicy`. Consulta só com **pacote publicado** — o grafo apoia o treino, não licencia JOIN. Contrato: [objective.md](../product/objective.md) e [tools.md](../mcp/tools.md).

_Porquê_ das três camadas (histórico): [proposta-arquitetura-mcp-se7e.md](../proposta-arquitetura-mcp-se7e.md).
