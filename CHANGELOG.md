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
- Coluna JSON `params` na skill (migration `0010_skill_params.sql`) e checklist `fluxoTreino` nas tools de treino/skill.
- `params[].tipo` (`string` / `number` / `date` / `boolean`); JSON antigo sem tipo vira `string`. Tools `skill_*` e `consultar_dados` recusam valor incompatível.
- `publicar_skill` exige `confirmadoPeloUsuario: true` depois do resumo no chat.

### Changed

- `consultar_dados` exige `skillId` de skill **publicada** e recusa SQL solto; o `sqlModelo` é revalidado na execução.
- `buscar_contexto` devolve `consultaPermitida` e `gap.code = SKILL_GAP` quando não há skill publicada capaz (o grafo fica só em `grafoParaTreino`). Rascunhos vêm em `skillsParaTreino`; se houver skill em andamento, o hint pede para continuar o `fluxoTreino.proximoPasso`.
- Consulta ao ERP é **enforced** por skill; grafo não licencia SQL ad-hoc.
- `buscar_contexto` casa a pergunta por termos (OR + ranking), incluindo `sqlModelo` e contrato de `params`.
- `treinar_com_sql` sempre grava origem `validado_execucao` após execução; `confirmadoUsuario` saiu da tool (`confirmar_coluna` segue para significado).
- `validar_skill` / `treinar_com_sql` aceitam `params` nomeados (ausentes → `null` na validação).
- `criar_skill` exige tabelas do SQL no grafo; `publicar_skill` só libera skill validada com params descritos, sem conflito pendente e com `confirmadoPeloUsuario`.
- `atualizar_skill` só volta a rascunho se o SQL mudar (e recusa tabelas fora do grafo); patch de nome/descrição/params **não** demove `validada`/`publicada`.
- `validar_skill` recusa params sem descrição.
- `treinar_com_sql` e `buscar_contexto` apontam a skill em andamento mais relevante (SQL igual ou tabelas do rascunho ⊆ SQL atual / ranking da query).
- JOIN sem igualdade no `ON` é recusado; CROSS JOIN não grava relacionamento `*`.

### Removed

- Alias `SERVICE_AUTH_EXPIRED` (401 do hub = só `USER_AUTH_EXPIRED`).
- Authorization Server / OAuth 2.1 próprio do MCP.
- Catálogo seed `Fonte` (`vendas` / `produtos` / `clientes`).
- Client de serviço (`PLUG_SERVER_CLIENT_*`) no ambiente de runtime.
- Variáveis `EMBEDDING_*` (config morta; busca semântica não está implementada).
- Código `ACESSO_PENDING` (nunca lançado; o real é `AGENT_ACCESS_PENDING`).

### Fixed

- Skill parametrizada (`:nome` / `@nome`) passa em `validar_skill` (envelope vazio) e só publica com `params.descricao`.
- Colunas do `ON` entram no grafo da tabela dona; SELECT sem qualificador quando há JOIN é recusado (`INVALID_SQL`).
- Expressão no SELECT sem `AS` é recusada em vez de gravar alias lixo no grafo.
- `tools/list_changed` notifica sessões que compartilham o `agentId`, não só o usuário que publicou.
- Rate limit por tool lê o IP no AsyncLocalStorage (sem corrida entre requests).

### Security

- Origin mismatch no Streamable HTTP → 403. Bearer expirado → 401. Sessões MCP continuam in-memory (1 instância PM2).
- Imagem Docker deixa de usar `node:*-alpine` (1 crítica + 7 altas no npm/yarn empacotados). Runtime passa a ser Alpine 3.24 com o binário Node 24.19.0 musl, sem npm/npx/yarn.

## [0.1.0] - 2026-08-16

### Added

- Commit inicial do servidor MCP Se7e (Streamable HTTP, Express, Drizzle).
