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

Servidor Redis 7 (`redis:7-alpine`) e cliente npm `redis` têm versões independentes. `REDIS_URL` vazio mantém stores locais; URL configurada conecta ao Redis na composição. Node/PM2 no host precisa do overlay de porta local; o container MCP usa o nome interno `redis`. Sessões MCP e bytes dos anexos permanecem no processo. [Configuração e diagnóstico](../operations/redis.md).

## Identidade

Bearer MCP → hash SHA-256 → `acesso.token_hash` (não `usuario_mcp`). ALS na borda com `(usuarioId, acessoId)`. Casos de uso recebem `usuarioId`; `requireAcesso` usa o acesso ligado à sessão. Cofre: [vault-and-mcp-token.md](../auth/vault-and-mcp-token.md).

## Plug-server

`PlugServerGatewayPort`: `login`, `refresh`, `requestAgentAccess`, `getAgentAccessStatus`, `putClientToken`, `getClientTokenPolicy`, `executeSql`. Canal: **só REST**. Contrato do hub: [communication.md](../plug-server/communication.md). Adapter (timeout, dois Agents, keepAlive): [rest-integration.md](../plug-server/rest-integration.md).

## Grafo e skills

Escrita do grafo com `withAcessoLock(acessoId)`. Grafo, skills e aprendizado por `acesso_id`. Leitura filtrada por `getClientTokenPolicy` (policy recorta SQL/leitura **dentro** do grafo daquele acesso). Consulta só com **pacote publicado** — o grafo apoia o treino, não licencia JOIN. Contrato: [objective.md](../product/objective.md) e [tools.md](../mcp/tools.md).

_Porquê_ das três camadas (histórico): [proposta-arquitetura-mcp-se7e.md](../proposta-arquitetura-mcp-se7e.md).

PreparedQuery tipado concentra preparação compartilhada de validar/consultar. SkillRepositoryPort distingue revisão editável e snapshot ativo; SkillPublicacaoRepositoryPort faz publicação transacional com CAS. SetupOperationRepositoryPort armazena hashes e reclama POST atomically; segredos entram somente pelo formulário. CryptoPort continua abstraindo envelope versionado/rotação.

## Conexão ChatGPT

[OAuth opcional](../auth/chatgpt-oauth.md) delega um acesso existente; não altera a autoridade das publicações, a policy ou confirmações. /mcp permanece manual. Perfil/contexto/revogação são tools exclusivas de /mcp/chatgpt. Falha de autenticação OAuth tem stage=oauth e desafio MCP; erros de hub/SQL não provocam reconexão OAuth.

AuthorizedUnitOfWorkPort entrega ports transacionais, sem tipos de Drizzle/PostgreSQL no domínio. O adapter PostgreSQL bloqueia acessos em ordem de ID, depois a concessão e os registros de negócio; revalida prazos antes do commit. Repositórios têm efeitos classificados explicitamente, sem interceptação de SQL. Operações de remoção usam uma transação multirrepositório. Nenhuma chamada ao hub é permitida com essa transação aberta; etapas persistidas em torno de chamadas externas são autorizadas separadamente.
