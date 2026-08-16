# Arquitetura

## Visão

```text
ChatGPT / Claude / Cursor
        │  Streamable HTTP + OAuth Bearer
        ▼
Se7e MCP Server (Express)
  ├── Authorization Server (login da conta MCP)
  ├── Tools MCP → casos de uso
  └── Catálogo (Postgres)
        │  REST + JWT de serviço (Client)
        ▼
   plug-server
        │  Agent + client_token
        ▼
   plug_agente / ERP
```

O MCP é inteligência + integração. O `plug-server` é autoridade de acesso, execução e limites.

## Hexágono

```text
infrastructure/http + mcp     →  application/use-cases  →  domain
        ▲                                                      │
        └──────── adapters implementam ports ◄─────────────────┘
```

- **domain**: entidades, ports e `DomainError`. Sem Express, Drizzle ou SDK MCP.
- **application**: um caso de uso por tool. Depende só de ports.
- **infrastructure**: Express, OAuth, MCP SDK, Drizzle, cliente REST, Pino, embedding (opcional, atrás de `IndiceContextoPort`).
- **composition**: `compose.ts` monta o grafo de dependências.

## SOLID na prática

- **S**: mapeamento de erro não vive na tool; a tool só serializa `DomainError`.
- **O**: nova tool = novo caso de uso + registro em `infrastructure/mcp/register-tools.ts`.
- **L**: adapters in-memory e Drizzle satisfazem o mesmo port.
- **I**: ports pequenos (`AmbienteRepositoryPort`, `CatalogoRepositoryPort`, …).
- **D**: `PlugServerGatewayPort` esconde REST; Socket pode entrar depois.

## Estrutura

```text
src/
  domain/{entities,ports,errors}
  application/use-cases
  infrastructure/{http,oauth,mcp,plug-server,persistence,logging,crypto,embedding}
  config
  composition
  main.ts
tests/{unit,integration,e2e}
```

## Transporte MCP

- Endpoint: `POST /mcp` (Streamable HTTP). `GET /mcp` e `DELETE /mcp` para SSE/sessão.
- Sessões identificadas por `mcp-session-id`, mantidas em memória em `mcp-http.ts`. O transport Streamable HTTP é in-process (SSE): as sessões não são compartilhadas entre processos — uma réplica ou sticky session em `Mcp-Session-Id`.
- Sessões sem atividade por mais de `MCP_SESSION_IDLE_TIMEOUT_MS` (default 30 min) são encerradas e removidas automaticamente por uma varredura periódica, evitando leak de memória com clientes que nunca enviam `DELETE /mcp`.
- Chamadas autenticadas exigem `Authorization: Bearer <access_token>` da conta MCP.
- Sem token: HTTP 401 + `WWW-Authenticate` apontando para `/.well-known/oauth-protected-resource`.
