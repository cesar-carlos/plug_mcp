# Changelog

Todas as mudanças relevantes deste servidor MCP ficam aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Categorias: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**.

Itens novos entram em **Unreleased**. Só promove para uma versão quando houver release explícito.

## [Unreleased]

### Added

- Tool `atualizar_persona`: `nomePersona` (teto 80) + `instrucoesPersona` (teto 4000) no **acesso** (usuário+agentId+token). Confirmação obrigatória; string vazia ou `null` limpa o campo; recusa texto que pareça senha/token/JWT. `listar_acessos` / `verificar_acesso` / resource `persona://{acessoId}` (Bearer) devolvem nome+instruções. `initialize`: 0 acessos = só SQL comum; 1 acesso = SQL + chapéu depois (bloco delimitado: instruções do usuário, não override do SQL); N acessos = não concatenar — a IA lê `listar_acessos`. Sessão que começa com 1 acesso e ganha o 2º (`adicionar_acesso`) **mantém o chapéu 1** em `initialize.instructions` até reconectar; `pre_treino` relê o banco. **Várias personas = vários acessos** (`adicionar_acesso`); um acesso = um chapéu. O mesmo `agentId` entre usuários MCP diferentes pode ter textos diferentes. Persona oriente tom/uso; não recorta skills nem licencia tabela/JOIN/`consultaPermitida`. Migration `0021_acesso_persona.sql` (colunas nulas).
- `GET /docs/mcp/error-mapping.md` serve a matriz de erros (mesmo path de `documentationUrl`). Sem HTML extra.
- `faltas[]` de medida (`kind: kpi`, `nextAction: atualizar_skill`) quando há agregação/`SUM` sem `definicao` — **não** bloqueia `podeLiberar` nem o pacote mínimo. CAST de data/`Situacao` não conta como KPI.
- `publicar_skill` sem `politicaConsulta` devolve o default (`maxRows: 500`, `timeoutMs: 30000`) no `resumoPublicacao`; na confirmação o servidor grava esse default. Sem recorte empresa/filial nem `exigirRecorteTemporal`.
- Envelope de `TABELA_FORA_DO_ESCOPO` / `COLUNA_FORA_DO_ESCOPO` / `JOIN_DESCONHECIDO` com `category`, `nextAction` e `documentationUrl`. `inspecionar_consulta` devolve `columnsMetadata`.
- Envelope de `MULTI_SKILL_PARAMS` e `DIALECT_UNSUPPORTED` com `category`, `nextAction` e `documentationUrl`.
- Resources: `initialize` declara `capabilities.resources`; instructions citam `guia://paginacao`, `guia://dialeto/{mssql|sybase|postgres|firebird}` e `skill://` (só publicada) como chão comum de todo consumidor. Os guias (e prompts `pre_treino` / `consultar_com_skill` / `cadastrar_skill`) entram no bootstrap sem Bearer — `resources/list` já lista `guia://`. `skill://` e tools de skill continuam exigindo Bearer.

### Changed

- `consultaSemantica` honra `tipoJoin` do pacote (`LEFT JOIN` se left; `INNER JOIN` se inner/ausente). `validar_consulta` aceita `options.page`/`page_size` e aplica a mesma regra de `consultar_dados` (TOP/LIMIT no SELECT externo incompatível com página). `consultaSemantica.limite` + `options.page` recusa misturar os dois padrões de corte.
- `enriquecer=completo`: até 16 `sql.execute` com concorrência 4 (`PERFIL_SQL_CONCURRENCY`), sem fundir `getPolicy` e sem retry. Falha isolada continua aviso; o teto 16 e o fail-closed não mudam.
- Cliente REST do hub: AbortSignal de `sql.execute` acompanha o wait do bridge (`options.timeout_ms` + 5s, teto 360s) — não corta em 35s; `PLUG_SERVER_HTTP_TIMEOUT_MS` é piso de login/policy (teto Zod 60s). Dois `http(s).Agent` (auth 4 / SQL 16). Probe TCP keepalive 30s (`keepAliveMsecs`); idle até o peer (Nginx `keepalive_timeout`). Sem retry de SQL. Borda Nginx (`proxy_read_timeout`, ex. 180s) ainda corta skills ~≥175s mesmo com abort MCP ~310s.
- Pre-treino (`initialize.instructions` / `pre_treino`): base comum = SQL no plug-server no dialeto do `agentId` (`sybase`/`mssql`/`postgres`/`firebird` — não assumir mssql) + resources `guia://paginacao`, `guia://dialeto/{dialeto}`, `skill://` + pacote publicado (fail-closed, sem embeddings). Estrutura via `obter_skill` / `skill://` (treino: `explorar_tabelas` / `mapear_tabela`); Firebird só consulta exemplo. Papel = persona do acesso (tom) + skills publicadas (pacote); SQL primeiro, persona depois; conflito → pacote. Canal com o hub é REST (Socket/relay de consumer fora de escopo). Host precisa reconectar após deploy para recarregar `instructions`.
- Pre-treino: nomeia `MULTI_SKILL_PARAMS` no cruzamento; a IA pergunta cardinalidade **e** tipo de JOIN (INNER vs LEFT) e passa `tipoJoin` em `confirmar_relacionamento` (omitir preserva o tipo do SQL/grafo). Continua agregar no banco e params `:nome`.
- Resource `guia://paginacao`: bloco comum distingue `truncated` (teto `max_rows`, caminho sem página) de `paginacao.hasNextPage` (próxima página).
- Mapper e `source`: `-32009` `invalid_payload` → `PLUG_SERVER_ERROR` + `plug_server_http` (reason ganha; não reescrever SQL). Haystack de motor só vira `INVALID_SQL`/`sql_engine` se reason ≠ `invalid_payload`. `-32001` ramifica (`missing_client_token` vs assinatura). Motor `-32101`/`-32102`/`-32107` → `INVALID_SQL`/`QUERY_TIMEOUT` + `sql_engine`. HTTP 404 de agentId nunca registado → `AGENT_UNAVAILABLE` sem retry (`verificar_acesso`). Instructions: `sql`/`sql_engine` corrige no pacote; transporte/`invalid_payload` não reescreve; 429/503 ≠ policy. SQL falho não persiste.
- Validador do pacote (`SELECT *`, AST, `COLUNA_FORA_DO_ESCOPO`, `JOIN_DESCONHECIDO`, `CONSULTA_SEM_RECORTE`, orçamento, `parseSqlModelo`, `DIALECT_UNSUPPORTED`, gates, `expandir_escopo`) preenche `source: sql` (`DomainError.pacote`). `PERMISSION_DENIED` do treino tagueia `client_token_rpc`.
- Hints de `TABELA_FORA_DO_ESCOPO` / `COLUNA_FORA_DO_ESCOPO` / `JOIN_DESCONHECIDO` / `CONSULTA_SEM_RECORTE` / `MULTI_SKILL_PARAMS` / `DIALECT_UNSUPPORTED` / `FANOUT_NAO_DECLARADO` dizem o que ajustar e para não repetir o padrão recusado.
- Falta `kind: kpi` também quando a coluna no pacote tem `papel=medida` e não há overlay em `metricasSaida` (hint via `atualizar_skill` / `registrar_aprendizado tipo=metrica`). `alvo` é `tabela.coluna`; duas tabelas com a mesma medida geram duas faltas. Overlay com o alias (mesmo sem `definicao`) continua só a falta de agregação. Não bloqueia `podeLiberar`. CAST, papel não-medida e quantidade/parcelas/`NroParc`/`NumParc`/`Qtde` não entram.
- Hint de cruzamento em `SKILL_GAP` (`Não cruze skills`) só quando a pergunta parece cruzamento (`cruzar`/`juntas`/`única consulta`). Skill publicada irrelevante (ex. faturamento) pede `listar_skills` sem esse sufixo.
- `consultaSemanticaSugerida`: IR só se o alias for medida no pacote; alias de quantidade fora salvo a pergunta falar de volume; score 0 sem IR certificado omite o esqueleto (não cai no primeiro `SUM`). Empate: IR, depois `definicao`, depois ordem.
- `fluxoTreino.pacoteMinimo` ignora aliases que não são medida (agregação). JOIN isolado coberto por composto vira `nextAction: remover_relacionamento` em vez de `confirmar_relacionamento`.
- FTS: stopwords `tente`/`fazer`/`erro`/`servidor`; `consultasAprendidas` genéricas (“tente fazer a consulta agora”) não entram no envelope. Continua **não** RAG.
- Cobertura certificada de `buscar_contexto` usa conjunto de stems portugueses (inflexão `titulo`/`titulos` pode autorizar `completa`); tokens extra na pergunta continuam a impedir. `candidatos[].termosAusentes` e hint de parcial citam até 3 stems. `params.tipo` sai do haystack JS (alinhado ao FTS). Telemetria `busca.skillNotPublished`. `skill_gap` continua sem insert quando já há skill publicada.
- `listar_lacunas` default só `status=aberta`. `buscar_contexto` faz upsert da `skill_gap` e arquiva quando a pergunta passa a `SKILL_NOT_PUBLISHED` ou consulta permitida.
- Após `initialize` autenticado, se SHA/versão mudou, o servidor envia `notifications/tools/list_changed`.
- `mapear_tabela` / deriva: assinatura no recorte do pacote (`validada`/`publicada`/`rascunho_revalidacao`). Remap de tipo compatível com o papel (ex. uuid→date) **não** rebaixa a skill.
- `inspecionar_consulta`: `SELECT *` cru de **uma** tabela do allowlist (`validada`/`publicada`/`rascunho_revalidacao` do agente), sem WHERE; o servidor injeta TOP/LIMIT (teto 100, sem `options.page` e sem máscara). Colunas novas entram no grafo como `inferido` (`colunasNovasNoGrafo[]`) — `confirmar_coluna` (lote `colunas[]`); skill **publicada** já consulta, senão republicar. JOIN inventado continua recusado. Célula binária vira stub `kind: anexo` (sem blob). Treino e `consultar_dados` seguem nomeados + recorte.
- `INVALID_SQL` do motor (`-32009` com haystack de engine / `-32101` / `-32102`): `hint` e `details.engineMessage` trazem a mensagem (coluna/objeto inválido → `nextAction: mapear_tabela`). `-32009` `invalid_payload` não entra neste caminho.
- `consultar_dados`: `skillIds` opcional (omitido = união das skills **publicadas** do `agentId`; se vierem, recortam). Sem SQL/IR/id, `sqlModelo` só com uma skill âncora. `consultaAprendidaId` reexecuta o SELECT gravado (exclusivo com `sql` e IR). Envelope `skillIds` = skills cujas tabelas estão no SQL.
- `confirmar_relacionamento` sem `tipoJoin` **não** grava `inner` por default por cima de LEFT já inferido do `sqlModelo` ou do grafo — preserva o tipo. `tipoJoin` explícito continua a valer.
- `consultaSemantica` v1: `metricas[]`, filtros `like`/`is_null`/`between`, `having[]`, `limite` (TOP/LIMIT, sem `options.page`).
- `confirmar_coluna` aceita `colunas[]` em lote e devolve `fluxoTreino`. Skill **publicada** consulta a coluna na hora (hint de inspeção não pede republicar).

### Fixed

- `expandir_escopo` em skill publicada não copia JOIN só `inferido` (`herdar_catalogo`) para o pacote: mesma origem mínima de `criar_skill`/`validar_skill` (`confirmado_usuario` / `validado_execucao`). O validador só autoriza o JOIN depois de `confirmar_relacionamento`.
- `descobrir_tabela` recorta colunas e arestas ao pacote publicado (fingerprints como `obter_skill`), sem vizinhança extra do grafo.
- Merge de relacionamento: origem mais fraca não sobrescreve `tipoJoin` (LEFT confirmado não vira `inner` de template).
- `treinar_com_sql` poda JOIN isolado coberto por composto no grafo (como `confirmar_relacionamento`).
- Envelope de anexo alinhado ao mapa: `PRIVACIDADE_NEGADA` só pessoal/segredo; handle de inspeção (legado) é `MIDIA_ORIGEM_INVALIDA`. `MIDIA_TIPO_RECUSADO` / `MIDIA_ORIGEM_INVALIDA` levam `source: mcp` / `stage: anexo` (tipo recusado é `category: validation`, não privacy). `CONSULTA_ORCAMENTO` de mídia aponta `omitir_coluna_ou_reduzir` (não agregar). Inspeção omite handle no stub (sem `put`).
- Detecção de anexo: coluna tipada (`image`/`blob`/`bytea`/`varbinary`/grafo `binario`) extrai sem piso de 96 chars; `Buffer`/`Uint8Array` reais não vazam via `JSON.stringify`; zip/ole sem magic não devolvem 2048 chars de base64. Handle de `inspecionar_consulta` não é exportável; pessoal/segredo não emitem handle nem bytes. `PRIVACIDADE_NEGADA` não aponta `inspecionar_consulta`. Teto local de mídia é `CONSULTA_ORCAMENTO` com `source: mcp` / `stage: anexo` (não o validador SQL). Store de handles cap por `usuarioId`; estouro de pixels vira `MIDIA_TETO`.
- Gzip do hub: após `gunzipSync`, o cliente HTTP remove `content-length` junto com `content-encoding` (o length era do corpo comprimido).
- `compose().close()` destrói o pool `http(s).Agent` do hub (`destroyHubHttpAgents`).
- Envelope: `JOIN_DESCONHECIDO` aponta `nextAction: obter_skill` (não `confirmar_relacionamento` — confirmar JOIN só no hint se o usuário ensinar). `DIALECT_UNSUPPORTED` aponta `inspecionar_consulta` sem `sql` (Firebird: consulta exemplo; não reenviar SQL livre).
- `consultaSemantica` reescreve alias do `sqlModelo` (`cr` / `[cr]`) na `expr` certificada para o nome físico da tabela no pacote. Não inventa JOIN.
- `validar_consulta` / `validar_skill`: o wrap `_validacao` tira o `ORDER BY` externo (SQL Server 1033). `ORDER BY` em `OVER (...)` permanece.
- `TABELA_FORA_DO_ESCOPO` em `descobrir_tabela` aponta `explorar_tabelas`; no validador SQL aponta `obter_skill`.
- `documentationUrl` do envelope deixa de apontar para 404: a matriz é pública no mesmo origin do `/health`.
- `consultar_dados` aceita `columnsMetadata` só com `name` (`type`/`nullable` opcionais no `outputSchema`). O MCP preenche as chaves (`null` ou tipo/`nullable` do grafo, também no alias de `column_ref`). `type` vazio do hub cai no grafo; CAST/agregação não copiam tipo.
- `consultar_dados.avisos` de `REGRA`/`METRICA`: com `tabelaId`, a tabela tem de estar no SQL mesmo se o `skillId` bater; teto de 3 `REGRA` ranqueia por overlap com tabelas/aliases do SELECT. Globais de processo e regras de outro domínio não entram.
- `skill://` não embute guia sybase quando não há acesso daquele `agentId`: omite `guiaDialeto` e avisa `DIALETO_AUSENTE` (não mente o dialeto). Com acesso, usa o dialeto real.
- `consultar_dados` com `page`+`page_size` em mssql: SQL Server 1033 do wrap gerenciado vira `INVALID_SQL` (não `PLUG_SERVER_ERROR`), com hint de `TOP n` sem `options.page`. O rewrite `OFFSET`/`FETCH` continua no `plug_agente`.
- `descobrir_tabela` omite nome que não é identificador SQL (título de anotação não vira coluna). `registrar_aprendizado` tipo=dicionário com título inválido grava a nota e não cria coluna no grafo.
- `buscar_contexto` com cobertura completa devolve `fluxoTreino` da skill publicada (`publicar_skill` feito). `SKILL_GAP` sem skill em andamento que cubra a pergunta omite o checklist (não finge `criar_skill` pendente) e o hint não pede sinônimo. Hint de cruzamento só na pergunta de cruzamento.
- `consultaSemanticaSugerida` ignora CAST/data em `metricasSaida`; só agregação. Sem medida certificada, sem overlap e sem IR no pacote, o esqueleto é omitido.
- HTTP 429/503 do hub usam `source: plug_server_http` (não `client_token_rpc`). HTTP 5xx com haystack `denied`/`permission` e sem RPC de policy fica `PLUG_SERVER_ERROR` + `plug_server_http` (não `PERMISSION_DENIED`). `consultar_dados` preserva `source`/`stage` no wrap de SQL não classificável.

### Security

- `sanitizeEngineMessage` redige JSON `"client_token":"..."` (aspas na chave), além de `client_token=` / Bearer / JWT.

## [0.2.0] - 2026-08-30

### Added

- Telemetria de `buscar_contexto` em `audit_log` (counts/enums: conhecimentos, slot narrativo, cobertura, permitida, gap, `listarSkills`) **sem** a pergunta. `listar_auditoria` devolve `telemetria` só nessa tool; `listar_metricas_agente.busca` agrega totais.
- `buscar_contexto.consultaSemanticaSugerida`: esqueleto (`metrica`/`dimensoes`/`colunaData`) só se `consultaPermitida` e houver KPI (`consultaSemantica` persistida ou `metricasSaida`). Entre skills com cobertura `completa`, escolhe o haystack de KPI (alias+definição+grão) com mais tokens da pergunta; empate: IR persistido, depois ordem. Prefira `consultar_dados.consultaSemantica`.
- `fluxoTreino.pacoteMinimo`: orientação para publicar uma tabela com WHERE ou agregação. **Não** afrouxa os gates (JOIN sem cardinalidade continua bloqueado).
- Template `herdar_catalogo`: tabela `pagar` e JOINs compostos empresa+filial (`pares[]`). Só grafo. Envelope `origem: "inferido"`, `publicaSkill: false` — não autoriza consulta.
- `buscar_contexto.conhecimentos[]`: evidência léxica ranqueada (regra, glossário, métrica, pergunta aprendida, skill, tabela). Teto 8 (1 slot reservado para regra/glossário/métrica com `skillId`), trecho truncado. Hit FTS entra mesmo sem substring JS; `ts_rank` desempatra. **Não** autoriza SQL — `consultaPermitida` continua só com cobertura certificada. FTS (`portuguese` + `unaccent`) + `ILIKE` no Postgres; sinônimo resolve skill por id/slug/nome **sem** concatenar UUID na tsquery. Nota com `skillId` inclui a skill em `candidatos` mesmo se o nome não bater. Após deploy, reconectar o cliente MCP.
- Tools `listar_conflitos` e `remover_relacionamento` (este com confirmação): o agente lista ids de conflito e apaga um JOIN pelo fingerprint, em vez de adivinhar.
- `faltas[]` (`kind`, `alvo`, `nextAction`) em `listar_skills` / `obter_skill`. `publicar_skill` sem confirmação devolve `publicado: false`, `resumoPublicacao` e `faltas[]` — não invente o resumo.
- Health injeta `GIT_SHA` / `SOURCE_COMMIT` / `GITHUB_SHA` no `sha` (PM2, Docker, CI). Snapshot de `tools/list` no teste de integração. Após deploy, reconectar o cliente MCP.
- Rate limit da tool MCP preenche `source: "mcp"` e `stage: "rate_limit"` no envelope de erro. Não varre todos os `DomainError`. `CACHE` continua aviso; `SKILL_GAP` de `buscar_contexto` permanece no envelope de sucesso.

### Changed

- Hint de `buscar_contexto` cita até 3 `consultasAprendidas[].id` para reuso em `obter_skill.consultasExemplo`. Cobertura parcial pede `registrar_aprendizado tipo=sinonimo` mesmo sem slot narrativo. Skill puxada só pela nota (cobertura `desconhecida`) com regra em `conhecimentos[]` também pede `obter_skill`. `McpServer.version` lê `buildInfo().version`.
- Busca de `consulta_aprendida` ranqueia só a **pergunta** (não o SQL) e só status `ativa`. Cobertura certificada segue nome/slug/descrição/params/`metricasSaida`/sinônimos — corpo e título de regra não completam cobertura. Postgres: `ORDER BY ts_rank` (score até `conhecimentos[]`); `ILIKE` de skill lê nome/descrição de params e alias/definição/grão de `metricasSaida` (não dump JSON nem `expr`). Tsquery vazia cai só no `ILIKE`. `grafoParaTreino.anotacoes` recorta tabela pela policy (id irresolvível omite); nota sem tabela só entra se for global ou a `skillId` estiver nos candidatos.
- `buscar_contexto` **não** devolve `sqlModelo` nem SQL de `consultasAprendidas` (só id/pergunta/skillIds/execucoes/status). O SELECT está em `obter_skill` (`consultasExemplo`). Após deploy, reconectar o cliente MCP.
- Skill `validada` com perfil incompleto: `fluxoTreino.proximoPasso` aponta a tool da primeira falta (`confirmar_relacionamento`, `mapear_tabela`, `listar_conflitos`…) e nunca fica `null`.
- JOIN composto substitui pares isolados (subconjunto) no grafo e no pacote. `uniaoEscopos` também descarta o subconjunto.
- `mapear_tabela` substitui tipo físico incompatível (ex. uuid vs data) sem apagar descrição, dicionário ou `sensibilidade` confirmada. Gate de publicação trata papel `data` em família uuid como falta de perfil.
- `inspecionar_consulta` aceita skill `validada` e `rascunho_revalidacao`; recusa rascunho. `descobrir_tabela` continua só em skill publicada.
- `buscar_contexto` mede cobertura por nome, slug, descrição, params e `metricasSaida` — **não** pelo `sqlModelo`. `SKILL_NOT_PUBLISHED` só se a skill em treino cobre a pergunta.

### Security

- Migration `0019_drop_unused_vector.sql`: `DROP EXTENSION IF EXISTS vector` (pgvector de `0008` nunca usado; busca é FTS).
- Migration `0017_fts_hardening.sql`: `SET search_path = pg_catalog, public` em `mcp_unaccent` / `mcp_skill_search_vec`; GIN composto `(agent_id, search_tsv)` com `btree_gin`.
- Migration `0018_fts_rank_trgm.sql`: pesos FTS A/B/C em `mcp_skill_search_vec` (nome/slug, descrição/params, métricas) e `pg_trgm` em nome/slug/pergunta. O papel da migration precisa de `CREATE EXTENSION` (`unaccent`, `btree_gin`, `pg_trgm`).

### Added

- Overlay de KPI (`metricasSaida[]`) em `criar_skill` / `atualizar_skill`: só aliases já no pacote (`definicao`, `grao`, dimensões, status, `colunaData`). Alias/expr inventados → `COLUNA_FORA_DO_ESCOPO`. `registrar_aprendizado` com `tipo=metrica` + `skillId` usa o mesmo overlay.
- `confirmar_coluna.skillId` persiste a coluna no pacote e sincroniza com o grafo. `sensibilidade` só com `confirmadoPeloUsuario`.
- Tool `despublicar_skill`: publicada → validada sem apagar pacote, params nem consultas aprendidas.

### Changed

- `listar_skills` devolve status, `motivoRevalidacao`, `podeLiberar` e `fluxoTreino` (sem `sqlModelo`). `rascunho_revalidacao` pede `validar_skill` e depois `publicar_skill`.
- Rename de `slug` em `atualizar_skill` exige confirmação; conflito → `CONFLICT`; não rebaixa status. Patch de KPI também preserva status.
- Perfil/`validado_execucao` não apaga `sensibilidade` confirmada pelo usuário.

### Fixed

- Typecheck: telemetria de `buscar_contexto` é espalhada em `Record<string, unknown>` antes do `LoggerPort`.
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
