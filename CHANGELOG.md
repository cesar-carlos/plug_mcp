# Changelog

Todas as mudanças relevantes deste servidor MCP ficam aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Categorias: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**.

Itens novos entram em **Unreleased**. Só promove para uma versão quando houver release explícito.

## [Unreleased]

### Added

- Tools `listar_conflitos` e `remover_relacionamento` (este com confirmação): o agente lista ids de conflito e apaga um JOIN pelo fingerprint, em vez de adivinhar.
- `faltas[]` (`kind`, `alvo`, `nextAction`) em `listar_skills` / `obter_skill`. `publicar_skill` sem confirmação devolve `publicado: false`, `resumoPublicacao` e `faltas[]` — não invente o resumo.
- Health injeta `GIT_SHA` / `SOURCE_COMMIT` / `GITHUB_SHA` no `sha` (PM2, Docker, CI). Snapshot de `tools/list` no teste de integração. Após deploy, reconectar o cliente MCP.

### Changed

- Skill `validada` com perfil incompleto: `fluxoTreino.proximoPasso` aponta a tool da primeira falta (`confirmar_relacionamento`, `mapear_tabela`, `listar_conflitos`…) e nunca fica `null`.
- JOIN composto substitui pares isolados (subconjunto) no grafo e no pacote. `uniaoEscopos` também descarta o subconjunto.
- `mapear_tabela` substitui tipo físico incompatível (ex. uuid vs data) sem apagar descrição, dicionário ou `sensibilidade` confirmada. Gate de publicação trata papel `data` em família uuid como falta de perfil.
- `inspecionar_consulta` aceita skill `validada` e `rascunho_revalidacao`; recusa rascunho. `descobrir_tabela` continua só em skill publicada.
- `buscar_contexto` mede cobertura por nome, slug, descrição, params e `metricasSaida` — **não** pelo `sqlModelo`. `SKILL_NOT_PUBLISHED` só se a skill em treino cobre a pergunta.

### Added

- Overlay de KPI (`metricasSaida[]`) em `criar_skill` / `atualizar_skill`: só aliases já no pacote (`definicao`, `grao`, dimensões, status, `colunaData`). Alias/expr inventados → `COLUNA_FORA_DO_ESCOPO`. `registrar_aprendizado` com `tipo=metrica` + `skillId` usa o mesmo overlay.
- `confirmar_coluna.skillId` persiste a coluna no pacote e sincroniza com o grafo. `sensibilidade` só com `confirmadoPeloUsuario`.
- Tool `despublicar_skill`: publicada → validada sem apagar pacote, params nem consultas aprendidas.

### Changed

- `listar_skills` devolve status, `motivoRevalidacao`, `podeLiberar` e `fluxoTreino` (sem `sqlModelo`). `rascunho_revalidacao` pede `validar_skill` e depois `publicar_skill`.
- Rename de `slug` em `atualizar_skill` exige confirmação; conflito → `CONFLICT`; não rebaixa status. Patch de KPI também preserva status.
- Perfil/`validado_execucao` não apaga `sensibilidade` confirmada pelo usuário.

### Fixed

- JOIN composto: se o pacote tem `pares[]` com mais de um par, o `ON` incompleto é recusado (fallback v1 só quando não há composto). Evita consulta que “passa” com chave parcial.
- Pacote da skill recebe cardinalidade/tipo do grafo (`sincronizarEscopoComGrafo` em criar/validar/mapear/confirmar/treino); `uniaoEscopos` não apaga cardinalidade já gravada. Fan-out deixa de dar falso positivo em JOIN já perfilado.
- `PERFIL_TETO` é retomável: pula JOIN/coluna já perfilados (`details.retomavel: true`).
- Privacidade resolve alias → tabela física; `segredo` nunca sai (nem em `MAX`/`MIN`); `pessoal` só em `COUNT`. Fan-out também no `sqlModelo` (consulta exemplo / `skill_*`).
- Cache de consulta: chave e deriva usam prefixo `mcp:query:{agentId}:` — invalidar um agente não limpa os outros.
- `IN (:lista)` com array em `params` vira um placeholder por valor; lista vazia é `VALIDATION_ERROR`. Compilador semântico qualifica colunas quando há JOIN.
- `inspecionar_consulta` no Firebird executa a consulta exemplo (sem `sql`); SQL livre continua `DIALECT_UNSUPPORTED`.

### Added

- `sqlAccessState` / `sqlAccessSource` em `listar_acessos` (só cofre) e `verificar_acesso` (hub + policy).
- Envelope de erro com `source`, `stage`, `category`, `nextAction`, `documentationUrl` e `details`.
- `buscar_contexto.blockingReason: SKILL_NOT_PUBLISHED` distinto de `SKILL_GAP`.
- Pré-check `PRIVACIDADE_NEGADA` antes do hub; inspeção continua mascarando pessoal/sensível.
- Compilador semântico emite JOIN a partir de `pares[]`; IR persistido em `criar_skill` / sucesso de consulta.
- Contrato KPI em `metricasSaida` e `politicaConsulta` (migration `0015_politica_lacuna.sql`). Erros `CONSULTA_ORCAMENTO` e aviso `KPI_DESALINHADO`.
- Resources `guia://paginacao` e `guia://dialeto/{dialeto}`; `skill://` inclui IR, política e guia.
- Tools `listar_metricas_agente`, `registrar_lacuna_ferramenta` e `listar_lacunas`.

### Changed

- `publicar_skill` / `podeLiberar` bloqueiam `PERFIL_AUSENTE` (faltas de tipo/cardinalidade).
- Fan-out só nos JOINs do AST ∩ pacote; regex `valor|saldo` é fallback sem `metricasSaida`.
- Deriva automática após `mapear_tabela` (e treino se a flag estiver ligada); primeiro snapshot não rebaixa skill.
- Relacionamentos compostos nativos (`pares[]` + uma cardinalidade) no grafo, no pacote v2 e em `confirmar_relacionamento`. Migration `0014_relacionamento_composto.sql` com backfill do par legado.
- Tool `inspecionar_consulta`: amostra de até 100 linhas, finalidade obrigatória, mascaramento de PII/segredos por linhagem SQL, sem cache/aprendizado/paginação. `SELECT *` é expandido para colunas conhecidas.
- Tool `descobrir_tabela`: estrutura de skills publicadas (colunas, tipos, chaves, sensibilidade, relacionamentos) sem linhas nem DDL.
- Classificação persistida de coluna (`livre`/`pessoal`/`sensivel`/`segredo`) e mascaramento determinístico por sessão.
- Consulta semântica versionada (`consultaSemantica`: métrica, dimensões, filtros, período, ordenação) compilada só com elementos certificados no pacote.
- Detecção de deriva de esquema (`detectar_deriva_esquema`): impacta só as skills da tabela, invalida cache e move para `rascunho_revalidacao`. Não repara schema automaticamente.
- Progresso/cancelamento cooperativo de perfilamento (`cancelar_operacao`) e flags `MCP_INSPECTION_ENABLED`, `MCP_DISCOVERY_QUERY_ENABLED`, `MCP_SEMANTIC_QUERY_ENABLED`, `MCP_SCHEMA_DRIFT_ENABLED`.
- `GET /health` versionado (versão, SHA, buildTime, uptime) e `GET /ready` quando há banco.
- Erros `FANOUT_NAO_DECLARADO`, `FEATURE_DESLIGADA`, `OPERACAO_CANCELADA`. Códigos reservados `PRIVACIDADE_NEGADA` e `SCHEMA_DRIFT` (deriva devolve `drifted` sem throw; inspeção mascara em vez de recusar).

### Changed

- Validador de JOIN exige o conjunto de igualdades (com fallback legado de pares isolados). Cardinalidade composta é perfilada no recorte de empresa/filial.
- `confirmar_relacionamento` grava o recorte em que a cardinalidade foi validada (`escopoValidacao`).

### Security

- Inspeção e descoberta estrutural não persistem amostras. Segredos saem `[redacted]`; PII é pseudonimizada por sessão (`p_<hmac>`); texto livre sai `[texto oculto]`. Auditoria de inspeção grava só metadados (skill, finalidade, colunas).

### Added

- `confirmar_relacionamento.cardinalidade` opcional (`1:1`, `1:N`, `N:1`, `N:N`) para persistir a cardinalidade confirmada no grafo e no pacote de skill.
- Pacote versionado (`pacoteVersao`), `graoPorTabela`/`graoResultado`, `metricasSaida` no escopo da skill. Conhecimento skill-scoped (`anotacao_grafo.skill_id`) e `consulta_aprendida_skill` (multi-skill). Migration `0013_pacote_conhecimento.sql`.
- Validador fail-closed em UNION/INTERSECT/EXCEPT, subqueries em HAVING/JOIN/ORDER, alias desconhecido e coluna ambígua. Tokenizer ignora `::cast`, `@@var` e comentários.
- Erros `ALIAS_DESCONHECIDO`, `COLUNA_AMBIGUA`, `PACOTE_INCOMPLETO`, `MULTI_SKILL_PARAMS`, `METADATA_CONTRATO`.
- `columnsMetadata` (nome/tipo/nullable) no resultado, inclusive com zero linhas. Cache de consulta inclui `usuarioId`, token e versões da skill.

### Changed

- Perfilamento completo inclui colunas usadas em filtros do escopo e `PERFIL_TETO` informa fase, orçamento e pendências; `mapear_tabela` completa tipo/formato físico ausente sem rebaixar a origem validada.
- Cutover quebrável: `obter_skill` e `skill://` usam só o pacote da skill (não o grafo inteiro). Publicadas entram em `rascunho_revalidacao` no backfill (`npm run db:backfill-escopo`), que reconstrói o AST, associa consultas/anotações e limpa o cache `mcp:query:*`.
- Treino grava só nomes físicos (aliases/expressões viram métricas). `criar_skill`/`publicar_skill` exigem fatos confirmados no grafo do escopo. `confirmar_relacionamento` com `skillId` persiste o JOIN no pacote (só o grafo não libera consulta).
- `consultar_dados.pergunta` obrigatória. Cruzar skills exige SQL. Params opcionais viram `null`. Defaults de empresa/filial são imutáveis. Paginação exige metadata do agente.
- `buscar_contexto` ranqueia cobertura; SKILL_GAP da busca por termos pede `listar_skills` antes de desistir.

### Security

- Cache de consulta deixa de ser compartilhado só por `agentId`; isola usuário/token/policy/skill.

### Fixed

- Persistência Drizzle passa a atualizar cardinalidade de relacionamentos já existentes, alinhada ao repositório em memória.

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
- `consultar_dados` devolve `paginacao` (`hasNextPage` / `hasPreviousPage`) quando `page`+`page_size` vão ao hub. `truncated` continua sendo só o teto de `max_rows` (caminho sem página).

### Changed

- Pré-treino de sessão e description de `consultar_dados` distinguem `truncated` (teto `max_rows`) de `paginacao.hasNextPage`, mandam `:nome` no fio e os dois padrões de corte (TOP/LIMIT vs `page`+`page_size` com só `ORDER BY`).
- Pré-treino de sessão (`initialize.instructions` / prompt `pre_treino`) passa a cobrir params nomeados (`:nome`/`@nome`, `:empresa`/`:filial`), os dois padrões de corte (TOP/LIMIT vs `options.page`+`page_size` com só `ORDER BY`), recorte/WHERE e leitura do retorno (`truncated`, `avisos`, tipos).
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

- Placeholders `@nome` no SQL enviado ao hub viram `:nome` (só params conhecidos; `@@variavel` intacta). Sem isso o agente não fazia bind de `@nome`.
- Paginação com `page`+`page_size` recusa também `OFFSET`/`FETCH`/`START AT`/`FIRST` no SQL, não só `TOP`/`LIMIT` do AST.
- `consultar_dados` com `options.page`+`page_size` deixava de falhar no hub: o adapter só envia `execution_mode: preserve` quando não há paginação (com paginação o hub usa `managed`). SQL com `TOP`/`LIMIT`/`FETCH`/`FIRST` e `page` é recusado no validador, sem round-trip.
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
