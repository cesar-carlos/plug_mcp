# Changelog

Todas as mudanças relevantes deste servidor MCP ficam aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Categorias: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**.

Itens novos entram em **Unreleased**. Só promove para uma versão quando houver release explícito.

## [Unreleased]

### Added

- Tools dinâmicas `skill_{slug}` por skill publicada, com `tools/list_changed` ao publicar.
- Resources `skill://{agentId}/{slug}` e prompts `consultar_com_skill` / `cadastrar_skill`.
- Anotações MCP nas tools, `structuredContent` tabular, truncagem de células e teto `max_rows`.
- Validação de `Origin` (403), `WWW-Authenticate` RFC 6750, metadata de recurso sem AS, TTL do token MCP (`MCP_TOKEN_TTL_DAYS`).
- Rate limit por tool (tetos distintos para bootstrap, listagens e consulta/`skill_*`/`treinar_com_sql`).
- Coluna `token_expires_at` em `usuario_mcp` (migration `0009_token_ttl.sql`).

### Changed

- `consultar_dados` exige `skillId` de skill **publicada** e recusa SQL solto; o `sqlModelo` é revalidado na execução.
- `buscar_contexto` devolve `consultaPermitida` e `gap.code = SKILL_GAP` quando não há skill publicada capaz (o grafo fica só em `grafoParaTreino`). Rascunhos vêm em `skillsParaTreino`.
- Consulta ao ERP é **enforced** por skill; grafo não licencia SQL ad-hoc.
- `buscar_contexto` casa a pergunta por termos (OR + ranking), não mais `ILIKE` da frase inteira.
- `treinar_com_sql` sempre grava origem `validado_execucao` após execução; `confirmadoUsuario` saiu da tool (`confirmar_coluna` segue para significado).
- `validar_skill` / `treinar_com_sql` aceitam `params` nomeados (ausentes → `null` na validação).

### Removed

- Alias `SERVICE_AUTH_EXPIRED` (401 do hub = só `USER_AUTH_EXPIRED`).
- Authorization Server / OAuth 2.1 próprio do MCP.
- Catálogo seed `Fonte` (`vendas` / `produtos` / `clientes`).
- Client de serviço (`PLUG_SERVER_CLIENT_*`) no ambiente de runtime.
- Variáveis `EMBEDDING_*` (config morta; busca semântica não está implementada).
- Código `ACESSO_PENDING` (nunca lançado; o real é `AGENT_ACCESS_PENDING`).

### Fixed

- Skill parametrizada (`:nome` / `@nome`) passa em `validar_skill` (envelope vazio) e pode ser publicada.
- Colunas de JOIN vão para a tabela dona (alias/qualificador); chaves do `ON` entram no relacionamento.
- Expressão no SELECT sem `AS` é recusada em vez de gravar alias lixo no grafo.
- `tools/list_changed` notifica sessões que compartilham o `agentId`, não só o usuário que publicou.
- Rate limit por tool lê o IP no AsyncLocalStorage (sem corrida entre requests).

### Security

- Origin mismatch no Streamable HTTP → 403. Bearer expirado → 401. Sessões MCP continuam in-memory (1 instância PM2).
- Imagem Docker deixa de usar `node:*-alpine` (1 crítica + 7 altas no npm/yarn empacotados). Runtime passa a ser Alpine 3.24 com o binário Node 24.19.0 musl, sem npm/npx/yarn.

## [0.1.0] - 2026-08-16

### Added

- Commit inicial do servidor MCP Se7e (Streamable HTTP, Express, Drizzle).
