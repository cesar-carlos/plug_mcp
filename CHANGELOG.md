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
- Pre-treino de sessão: consultor; SQL no escopo; **aprendizado constante obrigatório** (`pergunta` em `consultar_dados`, `registrar_aprendizado` / `aprendizado[]`).
- Tool `atualizar_dialeto`: muda o lock do `agentId` e rebaixa skills a rascunho (exige `confirmadoPeloUsuario`).
- `consultar_dados` devolve `sqlExecutado`, `paramsUsados`, `asOf`, `recorte`, `escopoAplicado` e `avisos` para citar o número.
- Erros de skill/coluna/tabela inexistente sugerem nomes próximos (distância de edição).
- `consultar_dados` grava o SQL que funcionou (`consulta_aprendida`) e aceita `pergunta` + `aprendizado[]`. Tools `salvar_consulta` (exemplo curado) e `registrar_aprendizado` (regra/dicionário/sinônimo) permanecem para o que o servidor não infere do SELECT.
- Migrations `0011_conhecimento.sql` (`skill.escopo`, papel/perfil/cardinalidade, `acesso.escopo_padrao`/`timezone`) e `0012_aprendizado.sql` (`consulta_aprendida`, `sinonimo`, `lacuna_consulta`).
- Parser AST (`node-sql-parser`) no caminho de SQL livre. Firebird permanece só com consulta exemplo (`DIALECT_UNSUPPORTED`).
- Flag `MCP_SKILL_TOOLS_ENABLED` (default **desligado**) para tools dinâmicas `skill_*`. Cache de resultado agregado (`QUERY_CACHE_TTL_MS`; Redis se `REDIS_URL`).
- `treinar_com_sql enriquecer=completo`: cardinalidade, tipo/formato, perfil min/max/nulos e candidatos a dicionário (teto de 16 queries; falha vira aviso e não desfaz o treino). `validar_skill` aceita o mesmo `enriquecer=completo` para skills já publicadas.
- Persistência preguiçosa de `skill.escopo` derivado do `sqlModelo` (e script `npm run db:backfill-escopo`) para skills antigas com JSON vazio. `escopo.grao` sai do SELECT (GROUP BY ou colunas físicas).
- Suíte adversarial do validador de escopo (CTE, subquery, JOIN inventado no pacote, `SELECT *` aninhado, segundo comando). Teto de `GROUP BY` e aviso `LITERAL_TEXTO`.
- `obter_skill` inclui `consultasExemplo` no pacote. `asOf` usa o timezone do acesso. Aviso `PERFIL_AUSENTE` quando tipo/formato/cardinalidade estão vazios.
- Tool `remover_skill`: apaga a skill (rascunho ou publicada) com `confirmadoPeloUsuario: true`, libera o slug e desvincula consultas/sinônimos. O grafo do `agentId` permanece.
- Funções de janela (`OVER` / `ROW_NUMBER` / `LAG`) no SQL da IA: contam como recorte (não disparam `CONSULTA_SEM_RECORTE`) e as colunas de `PARTITION BY`/`ORDER BY` entram no validador de escopo.

### Changed

- `consultar_dados` exige skill **publicada**. Sem `sql`, executa a consulta exemplo; com `sql`, valida o SELECT da IA contra o escopo. Toda execução bem-sucedida persiste `consulta_aprendida` (envie `pergunta`). `asOf` no fuso do acesso.
- `buscar_contexto` devolve `consultaPermitida`, `consultasAprendidas` e `gap.code = SKILL_GAP` quando não há skill publicada capaz (o grafo fica só em `grafoParaTreino`). Se houver consultas aprendidas, o hint pede para reutilizar esses SQLs. Rascunhos vêm em `skillsParaTreino`; se houver skill em andamento, o gap pede para continuar o `fluxoTreino.proximoPasso`.
- `validar_consulta` liga placeholders ausentes a `null` no dry-run.
- `PLACEHOLDER_ESCOPO` só avisa se o grafo tem a coluna empresa/filial e o SQL não usa `:empresa`/`:filial`.
- Tools `skill_*` desligadas por default (`MCP_SKILL_TOOLS_ENABLED=true` para ligar). Resource `skill://` e `obter_skill` permanecem.
- Consulta ao ERP é **enforced** pelo escopo da skill publicada; grafo não licencia JOIN inventado.
- `buscar_contexto` casa a pergunta por termos (OR + ranking), incluindo `sqlModelo` e contrato de `params`.
- `treinar_com_sql` sempre grava origem `validado_execucao` após execução; `confirmadoUsuario` saiu da tool (`confirmar_coluna` segue para significado).
- `validar_skill` / `treinar_com_sql` aceitam `params` nomeados (ausentes → `null` na validação).
- `criar_skill` exige tabelas do SQL no grafo; `publicar_skill` só libera skill validada com params descritos, sem conflito pendente e com `confirmadoPeloUsuario`.
- `atualizar_skill` só volta a rascunho se o SQL mudar (e recusa tabelas fora do grafo); patch de nome/descrição/params **não** demove `validada`/`publicada`.
- `validar_skill` recusa params sem descrição. Skill **já publicada** permanece publicada após revalidar (`statusPreservado`).
- `consultar_dados` pede `max_rows + 1` ao hub e marca `truncated` só quando veio linha a mais.
- `treinar_com_sql` e `buscar_contexto` apontam a skill em andamento mais relevante (SQL igual ou tabelas do rascunho ⊆ SQL atual / ranking da query).
- JOIN sem igualdade no `ON` é recusado; CROSS JOIN não grava relacionamento `*`.
- SQL que o plug não classifica (`-32002` + classification) vira `INVALID_SQL` (não `ACCESS_REVOKED`); o hint de `consultar_dados` cita as tabelas enviadas. Paginação exige `ORDER BY` também no `sqlModelo` e só encaminha `page` com `page_size`.
- `mapear_tabela` agrupa o catálogo (uma linha por coluna), infere papel/formato e avisa `CATALOGO_TIPOS_AMBIGUOS` quando o JOIN de tipos explode (sybase em SQL Server). JOIN `mssql` usa `user_type_id` e `system_type_id`.
- `buscar_contexto` em pergunta de período (com `consultasAprendidas`) pede para reusar esses SQLs (params de data ou `OVER`/`LAG`) em vez de reinventar a comparação.

### Removed

- Alias `SERVICE_AUTH_EXPIRED` (401 do hub = só `USER_AUTH_EXPIRED`).
- Authorization Server / OAuth 2.1 próprio do MCP.
- Catálogo seed `Fonte` (`vendas` / `produtos` / `clientes`).
- Client de serviço (`PLUG_SERVER_CLIENT_*`) no ambiente de runtime.
- Variáveis `EMBEDDING_*` (config morta; busca semântica não está implementada).
- Código `ACESSO_PENDING` (nunca lançado; o real é `AGENT_ACCESS_PENDING`).

### Fixed

- HTTP 401 do hub: `withHubAuth` invalida o JWT, reloga com a senha do cofre e **repete a operação uma vez** — a tool não falha no primeiro token vencido. Senha do cofre recusada vira `CREDENTIAL_STALE`.
- `putClientToken` deixa de ser API morta: roda após `registrar_acesso` / `adicionar_acesso` e quando `verificar_acesso` vê `approved`. Falha do PUT não desfaz o cofre; 403 com acesso `pending` é esperado.
- Tools de SQL/policy fazem **um** refresh do status no hub se o cofre ainda está `pending`, para não bloquear depois da aprovação do dono.
- Skill parametrizada (`:nome` / `@nome`) passa em `validar_skill` (envelope vazio) e só publica com `params.descricao`.
- Colunas do `ON` entram no grafo da tabela dona; SELECT sem qualificador quando há JOIN é recusado (`INVALID_SQL`).
- Expressão no SELECT sem `AS` é recusada em vez de gravar alias lixo no grafo.
- `tools/list_changed` notifica sessões que compartilham o `agentId`, não só o usuário que publicou.
- Rate limit por tool lê o IP no AsyncLocalStorage (sem corrida entre requests).

### Security

- Pino (e o logger de testes) redigem `senha` / `*.senha`. Instruções das tools pedem para a IA não ecoar senha nem `client_token` (o host MCP ainda pode logar argumentos).
- Origin mismatch no Streamable HTTP → 403. Bearer expirado → 401. Sessões MCP continuam in-memory (1 instância PM2).
- Imagem Docker deixa de usar `node:*-alpine` (1 crítica + 7 altas no npm/yarn empacotados). Runtime passa a ser Alpine 3.24 com o binário Node 24.19.0 musl, sem npm/npx/yarn.

## [0.1.0] - 2026-08-16

### Added

- Commit inicial do servidor MCP Se7e (Streamable HTTP, Express, Drizzle).
