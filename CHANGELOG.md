# Changelog

Todas as mudanças relevantes deste servidor MCP ficam aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Categorias: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**.

Itens novos entram em **Unreleased**. Só promove para uma versão quando houver release explícito.

## [Unreleased]

### Added

- Push na `main`, após o CI verde, publica o container MCP por SSH somente quando o commit altera o runtime. A imagem é a `linux/amd64` já testada no CI, identificada pelo SHA que passou. A chave executa `/usr/local/sbin/plug-mcp-deploy`, fora do Git. Falha de `/health` ou `/ready` restaura a imagem anterior. O commit recebe o status `production/mcp` e o host grava `/var/log/plug-mcp-deploy.log`.

### Changed

- Neste servidor o MCP de produção passou a ser o serviço `mcp` do Compose (perfil `container`), em `127.0.0.1:3333`, com `restart: unless-stopped`. O PM2 deixa de subir `se7e-mcp`, para não disputar a porta com o Nginx.
- `.env.example` passa a listar `E2E_AGENT_ID`, `E2E_CLIENT_TOKEN`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD` e `E2E_DIALETO`, vazios. Sem esses valores, `npm run test:live` continua se pulando.

### Fixed — compatibilidade e validação do piloto ChatGPT

- CIMD com IP fixado, callback DNS all/scalar, família explícita, TLS/SNI e conexão nova; regressões com HTTPS nativo.
- securitySchemes principal e _meta no tools/list legado/moderno; desafios OAuth com descrição fixa e descoberta sem erro de token quando não há credencial.
- Formulários compatíveis com Origin do Chromium, callback externo sem Referer e CSP restrita ao destino validado.
- Unidade de trabalho autorizada substitui Proxy/regex SQL; rollback, publicação/remoção/rotação e revogação concorrente em PostgreSQL.
- Chromium/HTTPS/PostgreSQL efêmero no CI e comando read-only chatgpt:check; gate explícito de Node compatível.

### Added — plugin ChatGPT privado e delegação OAuth

- Endpoint opcional `/mcp/chatgpt`, autorização por token MCP no navegador, CIMD/PKCE S256, credenciais opacas com rotação/replay e revogação por acesso/concessão; migração aditiva 0034.
- Perfil estável, contexto de sessão e revogação própria; catálogo compartilhado com metadata OAuth, guards de entrega/mutação, cache/anexos/setup vinculados à concessão e quotas de sessões compartilhadas.
- Pacote privado/portátil com duas skills, montagem sem credenciais e comando local de rollback. Piloto real depende de HTTPS e conexão privada cadastrada; testes locais não o certificam.

### Fixed — integração das branches de CI

- Mescladas as atualizações para `actions/checkout` v7, `actions/setup-node` v7 e `docker/setup-qemu-action` v4, preservando todas nos conflitos do workflow.
- Formatação ignora o checkout auxiliar `plug_server_contract`; o teste de contrato carrega arquivos somente quando a suíte é executada, permitindo sua ausência no job Windows.
- Histórico da branch `epic/ciclo-treino-publicacao` reconciliado após verificar equivalência com o patch já integrado pelo PR #9, preservando o conteúdo atual da main.

### Added — treinamento compartilhado e curadoria

- Base SQL + plug_server 1.0.0 compartilhada por todas as personas: `guia://treinamento-base`, `guia://sql`, `guia://plug-server` e `obter_treinamento_base` no bootstrap; versão/hash, contrato empacotado e gate de consistência. `pre_treino` compõe contexto de sessão, sem treinamento de pesos.
- Curadoria paginada, aprovação por ID/múltiplas skills com preview/hash/CAS, inativação explícita, dedup por contrato/publicações e contagem de execução separada.
- Grão/chaves, constantes de negócio, metadados semânticos de métricas, feedback/revisão e diagnóstico consolidado.
- Casos sintéticos versionados, runner PostgreSQL separado e gates graduais de testes obrigatórios; templates/datasets confirmados sem autoridade herdada.
- Avaliador consome descoberta/resources/schemas reais, compara tipos/decimais exatos e registra ferramentas/duração/consumo; variantes explícitas sem alteração automática de invariantes.
- Migrações 0032/0033 preservam histórico e acrescentam CAS/revisões/recorrência, sem confirmação ou certificação retroativa.
- Tools de curadoria `listar_consultas_aprendidas`, `obter_consulta_aprendida` e `inativar_consulta_aprendida`; `confirmar_grao` distingue origem e resultado, e `confirmar_constante_negocio` admite somente constantes não sensíveis aprovadas no pacote.
- Casos de negócio: `registrar_caso_teste`, `atualizar_caso_teste`, `listar_casos_teste`, `obter_caso_teste` e `arquivar_caso_teste`. Relatórios do runner separado ficam disponíveis em `listar_relatorios_avaliacao`; testes obrigatórios reprovados ou obsoletos bloqueiam somente a nova publicação.
- Feedback e diagnóstico: `registrar_feedback_consulta`, `revisar_feedback_consulta` e `diagnosticar_treinamento`, sem aprovação automática de conhecimento. `exportar_template_skill` / `importar_template_skill` criam rascunhos no destino; `exportar_dataset_treinamento` entrega JSON/JSONL sintético aprovado, com manifesto e partições de treino/desenvolvimento/teste.

### Changed — atualização e autoridade publicada

- Documentação de setup/runtime revisada: Redis 7 separado do cliente npm 6.3.0, conexão host/container, overlay restrito a loopback e diagnóstico; modelo de dados alinhado a aprendizado governado, inspeção protegida e auditoria sem conteúdo sensível.
- Node 24.21 LTS, TypeScript 7 real (API 6 apenas para lint), SDK MCP v2 modular, Express 5/Zod 4/ESLint 10/Vitest 5 e dependências npm estáveis; lockfile e CI Windows/Linux/musl x64/arm64.
- Nova consulta ao npm atualiza `@types/node` para 26.6.4 e remove a exclusão de majors desse pacote no Dependabot; runtime permanece Node 24 LTS e novas APIs exigem compatibilidade com ele.
- Publicação ativa imutável separada da edição: consulta/resources usam snapshot, rascunho não interrompe a publicação anterior. Publish com CAS e confirmação ligada à versão/base; alterações de segurança/cardinalidade suspendem pacotes afetados.
- Aprendizado automático gera candidatas parametrizadas; reuso exige confirmação humana e publicações vigentes. Legados sem evidência viram candidatas, retenção 90 dias e falha de captura não perde consulta.
- Contratos de clientes: `salvar_consulta` sem `confirmacaoHash` retorna preview, inclusive na entrada legada por pergunta/SQL/skill; aprovação por ID ou múltiplas skills exige confirmação e publicações exatas. `obter_skill` lê a publicação ativa por padrão e aceita `revisao=rascunho`; `statusRascunho` é separado de `status`.
- `metricasSaida` inclui unidade/moeda, arredondamento, tratamento de nulos, aditividade, dimensões permitidas e calendário de negócio. `COALESCE`/`ROUND` são aplicados pela IR conforme o contrato; metadados documentais não reescrevem SQL livre.

### Security — isolamento e cofre

- Credenciais somente no navegador: tools de cadastro/manutenção recusam argumentos, retornam URL; GET não consome nem emite Bearer, POST exige CSRF/reautenticação/vínculo, código hash de 256 bits/15 minutos. Rotação invalida Bearer anterior só na conclusão. Envelope AES-GCM v2 com key ID e recriptografia verificável.
- Recortes obrigatórios por lógica da AST, SQL somente leitura com funções permitidas e limites de complexidade, ambiguidade/fanout recusados. Inspeção/perfil omitem valores não classificados/pessoais/segredos; anexos vinculam origem física/publicações, quotas de bytes e autorização revalidada.
- Três portões vigentes em cache/exportação/entrega; Redis lease com proprietário e renovação atômicos, sem consulta concorrente após timeout com lease válido. Sessão MCP legada fixa; protocolo 2026-07-28 por requisição, Origin/Host/proxy configurados.

### Added — avaliação e migração

- 100 cenários sintéticos versionados, resultados PostgreSQL, harness explícito de IA consumidora com modelo registrado e critérios 100% segurança/lacuna e 95% suportados. Ensaio do harness não certifica modelo.
- Migrações 0028–0031: baseline técnico/suspensão de pacotes inseguros, setups legados invalidados, candidatos governados e snapshots imutáveis. Ensaios de banco novo e upgrades 0023/0027. Dependabot por PR, sem merge automático de majors.

### Added — operação confiável

- Migrations `0027`: caixa de alertas por acesso, webhook cifrado e outbox com lease/retry/dead-letter.
- Worker `worker:operacoes`, SLO configurável por ambiente, fila de revisão no fuso do acesso e tools de alerta/webhook confirmadas.
- Singleflight para consultas agregadas e certificação de migrations limpa + upgrade a partir de `0023` na CI.
- Propriedades determinísticas ampliadas para IR v1/v2 e dialetos suportados.

### Added — consultas inteligentes e governança

- IR semântico v2 (agregação/listagem) com compatibilidade v1, preflight compartilhado, `planoConsulta`, recomendações de orçamento e diagnóstico factual de cobertura.
- Governança temporal de anotações (`fonteTipo`, responsável, vigência/status) e `atualizar_anotacao` com confirmação.
- Preview/diff/hash SHA-256 e snapshots versionados para publicação atômica; deriva de schema com deltas e impactos.
- Auditoria estruturada, métricas por skill/origem/erro/cache e timings do hub amostrados por `PLUG_SERVER_TIMINGS_SAMPLE_PERCENT`.
- Contrato REST do hub gerado do OpenAPI (`plug_server/contracts/plug-mcp-rest-v1.json`) e verificação cross-repo na CI.
- Agenda opcional de revisão de conhecimento (`revisarEm`/`periodoRevisaoDias`) e fila segura em `listar_anotacoes`; não altera a vigência nem a autorização de consulta.
- Fixture sintética de consulta, testes gerativos determinísticos do IR, painel operacional anônimo em `listar_metricas_agente` e gate `npm run release:check`.
- Baseline de compatibilidade de campos de resposta do contrato REST: remoção silenciosa falha em `contract:check` e no teste MCP ↔ hub.

### Added

- Token MCP **por acesso** (`acesso.token_hash`): cada `CLIENT_TOKEN` ganha um Bearer distinto. `registrar_acesso` com identidade autenticada no navegador e token novo emite outro acesso; `adicionar_acesso` devolve `setupUrl` da persona nova **sem** trocar a sessão atual. A migration histórica `0023_token_por_acesso.sql` preservou o Bearer do acesso mais antigo e criou entregas legadas em `mcp_setup`; o fluxo atual utiliza `setup_operation` com validade de 15 minutos.
- Entrega persistida legada em mcp_setup foi substituída por setup_operation; 0029 invalida códigos pendentes, preservando Bearers existentes.

### Changed

- O Bearer autentica **exatamente um** acesso (sessão `(usuarioId, acessoId)`). Tools omitem `acessoId`; `acessoId` de outra persona → `VALIDATION_ERROR`. `listar_acessos` / `rotacionar_token_mcp` / `remover_acesso` / `initialize.instructions` / `skill_*` / resources são só desta persona. Não há inferência N>1 nem sufixo `_acesso8` no caminho autenticado. Auth deixa de usar `usuario_mcp.token_hash` (coluna removida no cutover). Cada persona no Cursor é **uma entrada de servidor MCP**.
- Catálogo de treino (skill, grafo, anotações, consultas aprendidas, sinônimos, lacunas, FTS) passa a ser por `acesso_id` — **1 `client_token` = 1 persona = 1 catálogo**. Unique slug `(acesso_id, slug)`. Mesmo e-mail/`agentId` + outro token (`adicionar_acesso`) começa vazio e não vê as skills do primeiro. Resource `skill://{acessoId}/{slug}` (não `agentId` na URI). Cache `mcp:query:acesso:{acessoId}:`. Hub SQL continua `agentId` + `client_token` daquele acesso. Cutover `0022_catalogo_por_acesso.sql`: um acesso no `agentId` anexa; vários duplicam cópias independentes; órfãos (zero acessos) ficam com `acesso_id` NULL e são registrados em `NOTICE` (`grafo_dialeto`/`grafo_lock` apagam órfãos).
- `remover_acesso` in-memory apaga o catálogo daquele `acesso_id` (skills, grafo, anotações, consultas aprendidas, sinônimos, lacunas, snapshots, dialeto/lock), alinhado ao `ON DELETE CASCADE` do Postgres.

### Fixed

- `notifications/tools/list_changed` só acorda sessões **deste** `usuarioId` **e** `acessoId` (não quem só compartilha `agentId` nem persona irmã).
- Escritas do grafo chaveadas por UUID (`listColunas` / `mergeColuna` / `deleteRelacionamento`) recusam mutar linha de outro `acesso_id` mesmo com UUID furtado.
- Falha de rede até o hub (`ECONNREFUSED` / `fetch failed`) deixa de virar `INTERNAL_ERROR` opaco: a IA recebe `PLUG_SERVER_ERROR` + `source: plug_server_http` (retryable, **não** reescrever SQL). HTTP 400 e JSON-RPC `-326xx` também são transporte. Firebird/Sybase `Column unknown` / `not found` apontam `mapear_tabela` com o texto do motor.
- Envelope de erro da tool também preenche `structuredContent` com o mesmo JSON de `content[0].text` (`domain.toJson()`), sem vazar segredos.
- O consumo legado de setup por GET foi substituído: `GET /setup/{code}` somente apresenta o formulário; a conclusão exige POST autenticado, CSRF e claim atômico. Sessão legada fixa usuário/acesso e recusa troca de Bearer para outra persona no mesmo `mcp-session-id`; é necessária nova sessão.
- Wrap genérico do driver (sem detalhe ODBC) no `engineMessage` pede `mapear_tabela` / `obter_skill` e **não** reescrever SQL por `plug_server_http`. `SQLSTATE` `42703`/`42P01` entra no hint quando o motor já mapeia identificador Postgres.

### Added

- Envelope de `buscar_contexto` com cobertura `composta` e `fatias[]`: pergunta de gestão (vendas + receber + pagar) orquestra várias `consultar_dados` em vez de um único `SKILL_GAP`. Não cruza SELECT entre skills. Eixos sem skill ficam em `gap.termosAusentes`.
- `consultaSemanticaSugerida` de listagem certificada (`modo: listagem`) só com dimensões/filtros; `metricasSemOverlay[]` quando a medida não tem `definicao`. Não inventa overlay de `PrecoVenda`/`ValorTotal`.
- Tool `atualizar_persona`: `nomePersona` (teto 80) + `instrucoesPersona` (teto 4000) no **acesso** (usuário+agentId+token). Confirmação obrigatória; string vazia ou `null` limpa o campo; recusa texto que pareça senha/token/JWT. `listar_acessos` / `verificar_acesso` / resource `persona://{acessoId}` (Bearer) devolvem nome+instruções. `initialize` / `pre_treino` sempre um chapéu (`blocoPersonaUnico`): sem Bearer = só SQL; com Bearer = SQL + persona **deste** acesso. `adicionar_acesso` não troca o Bearer atual (o host pode manter `instructions` do chapéu 1 até reconectar; este token nunca ganhou um segundo chapéu). **Várias personas = vários acessos = vários Bearers**. O mesmo `agentId` entre usuários MCP diferentes pode ter textos diferentes. Persona oriente tom/uso; não recorta skills **neste acesso** (catálogo é por `acesso_id` — outro token é outro catálogo) nem licencia tabela/JOIN/`consultaPermitida`. Migration `0021_acesso_persona.sql` (colunas nulas).
- Tool `exportar_anexo`: converte 1 handle de `consultar_dados` (jpeg/png → conteúdo MCP `image`; PDF → `resource`). Mesmos portões de consulta. Inspeção devolve stub **sem** handle; handle legado de inspeção → `MIDIA_ORIGEM_INVALIDA`. Pessoal/segredo → `PRIVACIDADE_NEGADA` (não use inspeção como segunda via). Cap 64 handles/usuário em memória.
- `GET /docs/mcp/error-mapping.md` serve a matriz de erros (mesmo path de `documentationUrl`). Sem HTML extra.
- `faltas[]` de medida (`kind: kpi`, `nextAction: atualizar_skill`) quando há agregação/`SUM` sem `definicao` — **não** bloqueia `podeLiberar` nem o pacote mínimo. CAST de data/`Situacao` não conta como KPI.
- `publicar_skill` sem `politicaConsulta` devolve o default (`maxRows: 500`, `timeoutMs: 30000`) no `resumoPublicacao`; na confirmação o servidor grava esse default. Sem recorte empresa/filial nem `exigirRecorteTemporal`.
- Envelope de `TABELA_FORA_DO_ESCOPO` / `COLUNA_FORA_DO_ESCOPO` / `JOIN_DESCONHECIDO` com `category`, `nextAction` e `documentationUrl`. `inspecionar_consulta` devolve `columnsMetadata`.
- Envelope de `MULTI_SKILL_PARAMS` e `DIALECT_UNSUPPORTED` com `category`, `nextAction` e `documentationUrl`.
- Resources: `initialize` declara `capabilities.resources`; instructions citam `guia://paginacao`, `guia://dialeto/{mssql|sybase|postgres|firebird}` e `skill://` (só publicada) como chão comum de todo consumidor. Os guias (e prompts `pre_treino` / `consultar_com_skill` / `cadastrar_skill`) entram no bootstrap sem Bearer — `resources/list` já lista `guia://`. `skill://` e tools de skill continuam exigindo Bearer.

### Fixed

- `acesso_id` NULL no catálogo deixa de virar tenant `""`: órfãos ficam `null` e não entram em listagens por string vazia.
- `anotar_grafo` e `registrar_aprendizado` (anotação/sinônimo) recusam `skillId`/`alvoId` de outro acesso (`SKILL_NOT_FOUND`). `consultar_dados.aprendizado[]` com `skillId` de outro catálogo **não** falha a consulta: aviso `APRENDIZADO_IGNORADO` e o item não é gravado (o SQL que já rodou continua no envelope).
- `resolver_conflito` e `remover_anotacao` só aplicam ids do acesso resolvido: tabela/coluna/JOIN/anotação de outro catálogo (mesmo e-mail/`agentId`, outro `client_token`) não muta o outro grafo.
- `confirmar_coluna` com `confirmadoPeloUsuario` aplica `sensibilidade` (origem `confirmado_usuario`) mesmo se a coluna já for `validado_execucao`. Perfil/`enriquecer=completo` posterior **não** rebaixa a classe. Se a classe não gravar, a tool recusa com `VALIDATION_ERROR` em vez de `success: true` opaco.
- Lista após “não autoriza cruzar vendas, compras nem títulos” sai do haystack de cobertura: o segundo (e demais) termos da cláusula negada **não** entram em `termosEncontrados`. “Não agrega estoque” continua fora. `SKILL_GAP` por termo só negado não pede sinônimo.
- Descrições de `treinar_com_sql` / `validar_skill` diziam Firebird SQL livre → `DIALECT_UNSUPPORTED` (falso vs o use-case). Treino parseia o `sqlModelo` no dialeto do acesso; `FIRST`/`TOP`/`LIMIT` no modelo é `INVALID_SQL`. `DIALECT_UNSUPPORTED` continua só em `consultar_dados` / `inspecionar_consulta` / `validar_consulta` **com** `sql` depois de publicar.
- `atualizar_skill` com SQL novo apagava tabelas/colunas/JOINs extra do pacote (só reaplicava overlay de KPI). Agora une o AST ao rascunho persistido, como `validar_skill`. Grafo só `inferido` não entra. A revisão editável volta a `rascunho`; havendo publicação ativa utilizável, `status=publicada` e a consulta continua no snapshot anterior até republicação.
- Envelope `PACOTE_INCOMPLETO`: `nextAction` era o fallback `validar_skill`; agora é o da primeira falta bloqueante em `details.faltas[]`.

### Changed

- `parseSqlModelo` / `tryParseSelect` recebem `acesso.dialeto` no treino/criar/validar/atualizar (postgres `LIMIT`/`ILIKE` vs mssql; Firebird via parser transactsql, sem `FIRST` no modelo).
- Params: falta não bloqueante `kind: param` quando `tipo` ficou no default `string` (não impede `podeLiberar`). Passo 4 do pre-treino pede `tipo`.
- `confirmar_relacionamento` sem `skillId` devolve hint: o validador publicado não vê o JOIN até ele entrar no pacote.
- Treino: aviso `PAGINACAO_MODELO` se o `sqlModelo` já declara TOP/LIMIT/FIRST (`options.page` será recusado).

- Pre-treino e docs: identificar o GDBR do acesso e emitir SQL compatível é treino + IA — o `plug_server` (hub) não reescreve dialeto nem trata erro de linguagem SQL; `sql_engine` vem do motor/GDBR via `plug_agente`.
- `validar_skill` une o escopo do `sqlModelo` ao pacote já persistido (não reconstrói o allowlist pelo SELECT). Fotos/JOINs de `confirmar_coluna` / `confirmar_relacionamento` sobrevivem à validação.
- `IN (:lista)`: `validar_consulta` também expande o array; teto documentado de 64 itens (`VALIDATION_ERROR` `source: mcp`) — recorte a lista, não interpole literais. Transporte ODBC/hub de listas grandes permanece no `plug_agente`.
- `consultaSemantica` honra `tipoJoin` do pacote (`LEFT JOIN` se left; `INNER JOIN` se inner/ausente). `validar_consulta` aceita `options.page`/`page_size` e aplica a mesma regra de `consultar_dados` (TOP/LIMIT no SELECT externo incompatível com página). `consultaSemantica.limite` + `options.page` recusa misturar os dois padrões de corte.
- `enriquecer=completo`: até 16 `sql.execute` com concorrência 4 (`PERFIL_SQL_CONCURRENCY`), sem fundir `getPolicy` e sem retry. Falha isolada continua aviso; o teto 16 e o fail-closed não mudam.
- Cliente REST do hub: AbortSignal de `sql.execute` acompanha o wait do bridge (`options.timeout_ms` + 5s, teto 360s) — não corta em 35s; `PLUG_SERVER_HTTP_TIMEOUT_MS` é piso de login/policy (teto Zod 60s). Dois `http(s).Agent` (auth 4 / SQL 16). Probe TCP keepalive 30s (`keepAliveMsecs`); idle até o peer (Nginx `keepalive_timeout`). Sem retry de SQL. Borda Nginx (`proxy_read_timeout`, ex. 180s) ainda corta skills ~≥175s mesmo com abort MCP ~310s.
- Pre-treino (`initialize.instructions` / `pre_treino`): base comum = SQL no plug-server no dialeto configurado no acesso (`sybase`/`mssql`/`postgres`/`firebird` — não assumir mssql) + guias públicos + pacote publicado (fail-closed, sem embeddings). Estrutura via `obter_skill` / `skill://` (treino: `explorar_tabelas` / `mapear_tabela`); Firebird só consulta exemplo. Papel = persona do acesso (tom) + skills publicadas (pacote); SQL primeiro, persona depois; conflito → pacote. Canal com o hub é REST (Socket/relay de consumer fora de escopo). Clientes legados reconectam para recarregar `initialize.instructions`; no protocolo 2026-07-28 o contexto autenticado é recomposto por requisição.
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
- `inspecionar_consulta`: `SELECT *` cru de **uma** tabela do allowlist (`validada`/`publicada`/`rascunho_revalidacao` do acesso), sem WHERE; o servidor injeta TOP/LIMIT (teto 100, sem `options.page` e sem máscara). Colunas novas entram no grafo como `inferido` (`colunasNovasNoGrafo[]`) — `confirmar_coluna` (lote `colunas[]`); skill **publicada** já consulta, senão republicar. JOIN inventado continua recusado. Célula binária vira stub `kind: anexo` (sem blob). Treino e `consultar_dados` seguem nomeados + recorte.
- `INVALID_SQL` do motor (`-32009` com haystack de engine / `-32101` / `-32102`): `hint` e `details.engineMessage` trazem a mensagem (coluna/objeto inválido → `nextAction: mapear_tabela`). `-32009` `invalid_payload` não entra neste caminho.
- `consultar_dados`: `skillIds` opcional (omitido = união das skills **publicadas** deste acesso; se vierem, recortam). Sem SQL/IR/id, `sqlModelo` só com uma skill âncora. `consultaAprendidaId` reexecuta o SELECT gravado (exclusivo com `sql` e IR). Envelope `skillIds` = skills cujas tabelas estão no SQL.
- `confirmar_relacionamento` sem `tipoJoin` **não** grava `inner` por default por cima de LEFT já inferido do `sqlModelo` ou do grafo — preserva o tipo. `tipoJoin` explícito continua a valer.
- `consultaSemantica` v1: `metricas[]`, filtros `like`/`is_null`/`between`, `having[]`, `limite` (TOP/LIMIT, sem `options.page`).
- `confirmar_coluna` aceita `colunas[]` em lote e devolve `fluxoTreino`. Skill **publicada** consulta a coluna na hora (hint de inspeção não pede republicar).

### Fixed

- Migration `0022_catalogo_por_acesso`: o fan-out de catálogo para acessos extras copia `agent_id` nos INSERTs enquanto a coluna ainda é NOT NULL (depois o SQL a remove). Sem isso, `tabela_grafo` (e as demais tabelas do grafo) recusam a duplicação.
- `confirmar_coluna` `livre` não volta a `pessoal`/`segredo` no perfil (`enriquecer=completo`): só origem `confirmado_usuario` altera a classe; o segundo merge `validado_execucao` não reinfere privacidade.
- SQL Server **4104** (`multi-part identifier`) no wrap de paginação gerenciada entra no mesmo ramo de **1033**: `INVALID_SQL` `sql_engine`, hint TOP n sem `options.page`, `nextAction: consultar_dados` (não `validar_consulta`). O rewrite do wrap continua no `plug_agente`.
- Negação na descrição da skill (“Não agrega estoque”) não entra em `termosEncontrados` da cobertura certificada. Cláusulas compostas (“não … e não …”) não deixam o segundo complemento no haystack. `SKILL_GAP` por termo negado não pede sinônimo.
- `expandir_escopo` sem igualdade coluna=coluna aponta `nextAction: confirmar_coluna` (tabela isolada) em vez de convidar JOIN inventado.
- `npm run build`: `ToolContent` de resource exige `blob` ou `text` (união, como o SDK MCP). PDF de `exportar_anexo` já enviava `blob`.
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
