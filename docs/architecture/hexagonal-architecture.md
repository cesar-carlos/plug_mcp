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
- **application**: um caso de uso por tool (`cofre`, `treinar-com-sql`, `consultar`, `inspecionar`, `skills`, `aprendizado`).
- **infrastructure**: HTTP, MCP SDK, Drizzle, adapter REST, Pino. Tools `skill_*` por sessão atrás de `MCP_SKILL_TOOLS_ENABLED`; resources `skill://`; prompts. Tools de inspeção/descoberta/deriva atrás de flags (`MCP_INSPECTION_ENABLED` etc.). Cache de resultado agregado (Redis opcional). `GET /health` versionado; `GET /ready` checa o banco quando há `DATABASE_URL`.
- **composition**: `compose.ts` escolhe memória ou Postgres (`DATABASE_URL`).

## Identidade

Bearer MCP → hash SHA-256 → `usuario_mcp`. ALS só na borda (`currentAccountId()`). Casos de uso recebem `usuarioId`.

## Plug-server

`PlugServerGatewayPort`: `login`, `refresh`, `requestAgentAccess`, `getAgentAccessStatus`, `putClientToken`, `getClientTokenPolicy`, `executeSql`. JWT do hub por usuário (`UsuarioTokenManager`). Cache de policy por hash do `client_token`. Canal da Fase 1: REST `POST /api/v1/agents/commands` (`sql.execute`, `client_token.getPolicy`, `execution_mode: preserve`). Socket fica fora desta fase.

## Grafo e skills

Escrita do grafo com `withAgentLock`. Dialeto no primeiro merge. Leitura filtrada por `getClientTokenPolicy`.

O grafo apoia o treino e acumula fatos confirmados pela execução. Relacionamento composto = `pares[]` + uma cardinalidade (recorte empresa/filial). A consulta na sessão usa skill publicada como **escopo**: sem `sql`, o servidor executa a consulta exemplo (`sqlModelo`); com `sql` ou `consultaSemantica`, o validador recusa tabela/coluna/JOIN fora do pacote. `buscar_contexto` devolve evidência FTS/`ILIKE` (`conhecimentos[]`) e envelope **sem** SQL — o SELECT está em `obter_skill`. Amostra estrutural: `inspecionar_consulta` (teto 100, PII mascarado; aceita validada / `rascunho_revalidacao` / publicada). Sem skill capaz, a IA admite a lacuna.

_Porquê_ das três camadas (histórico): [proposta-arquitetura-mcp-se7e.md](../proposta-arquitetura-mcp-se7e.md). Contrato: [objective.md](../product/objective.md) e [tools.md](../mcp/tools.md).
