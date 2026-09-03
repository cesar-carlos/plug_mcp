# Orientação para agentes

## Fontes e precedência

1. `.cursor/rules/product_objective.mdc` — invariantes de produto (base comum SQL+resources;
   pacote publicado = autoridade).
2. `.cursor/rules/security.mdc` — cofre, segredos, portões e isolamento de cache.
3. `src/infrastructure/mcp/server-instructions.ts` — instruções runtime enviadas
   a IAs consumidoras no `initialize`.
4. `docs/` — contrato detalhado. Ordem de leitura: `docs/README.md`.
   `docs/mcp/tools.md` e `docs/mcp/error-mapping.md` são as referências de tools e erros.
   `docs/proposta-arquitetura-mcp-se7e.md` é histórico (três camadas), não o aceite.
5. Regras especializadas em `.cursor/rules/` para arquitetura, domínio,
   catálogo, protocolo MCP, plug-server e testes.

Em caso de alteração de comportamento de consulta, treinamento ou pre-treino,
atualize em conjunto as rules aplicáveis, `server-instructions.ts`, a
documentação de produto e os testes correspondentes.

## Invariantes do produto

- O MCP é cofre + grafo de treinamento + skills; não é um proxy SQL genérico.
  A **base comum** de todo consumidor: SQL no plug_server, dialeto do acesso,
  resources (`guia://paginacao`, `guia://dialeto/{mssql|sybase|postgres|firebird}`,
  `skill://{acessoId}/{slug}` = pacote publicado, `persona://{acessoId}` = tom/uso do acesso), estrutura pelas skills publicadas e consultas
  dinâmicas só no pacote (fail-closed). Sem embeddings. Guias já no bootstrap
  (sem Bearer); `skill://` e `persona://` exigem Bearer. Não assuma mssql — leia o guia do
  acesso. Identificar o GDBR do acesso e emitir SQL compatível é **treino + IA** — o
  `plug_server` é hub (não implementa linguagem SQL nem rewrite de dialeto);
  `sql_engine` é o motor/GDBR via `plug_agente`. Skill treinada num dialeto não
  licencia `TOP`/`OFFSET` de outro GDBR. O **papel** combina a persona do acesso (tom, `atualizar_persona`)
  com as skills publicadas daquele acesso (pacote). SQL comum primeiro;
  persona depois; em conflito vale o pacote fail-closed. Persona não recorta
  skills **neste acesso** (outro token = outro catálogo) nem licencia consulta.
  Senha autentica, não particiona. Hub SQL continua `agentId` + `client_token`.
  **1 client_token = 1 persona = 1 catálogo** (`acesso_id`). Mesmo e-mail/`agentId`
  + outro token (`adicionar_acesso`) começa vazio. **Várias personas = vários
  acessos**; um acesso = um chapéu — não concatenar nem unir pacotes. N=1: omita
  `acessoId`. N>1: passe `acessoId` **ou** infira (`skillId`/slug único; handle
  em `exportar_anexo`). `listar_auditoria` N>1 exige `acessoId`.
  Resource `skill://{acessoId}/{slug}`. Sessão que começa com 1 acesso e ganha
  o 2º (`adicionar_acesso`) mantém o chapéu 1 em `initialize.instructions` até
  reconectar; `pre_treino` relê o banco. O mesmo `agentId` entre usuários MCP
  diferentes pode ter textos e skills diferentes; o trio usuário+agentId+token
  tem uma persona.
- Só o **pacote** de skill publicada autoriza `consultar_dados`. Grafo não
  licencia tabela nem JOIN. `obter_skill` / `skill://` não despejam o grafo.
- A IA executa SQL customizado somente no escopo publicado (validador
  fail-closed). Sem SQL, executa `sqlModelo`.
- Nunca inventar tabela, coluna, JOIN, métrica ou regra de negócio.
- Erro de consulta: a IA lê `code`/`message`/`hint`/`source` (`sql` = validador
  do pacote, `sql_engine` = motor/GDBR via `plug_agente` — não camada de dialeto
  do hub; policy/`client_token_rpc`; HTTP/`plug_server_http`).
  `sql`/`sql_engine` → corrige o SQL no pacote (no dialeto do GDBR) e não
  repete o padrão recusado. Não espere o hub reescrever dialeto.
  `plug_server_http` + `invalid_payload` / `PLUG_SERVER_ERROR` de transporte →
  **não** reescreva o SQL. 429/503 ≠ policy. SQL falho não persiste;
  aprendizado continua sendo sucesso com `pergunta`, `registrar_aprendizado`,
  `salvar_consulta` e `SKILL_GAP` → `lacuna_consulta`.
- Agregações, filtros e paginação devem acontecer no banco.
- Treinamento segue `treinar_com_sql` → `criar_skill` → params →
  `validar_skill` (une `sqlModelo` ao escopo persistido; perfil não apaga
  `sensibilidade` confirmada; `confirmar_coluna` aplica a classe mesmo após
  `validado_execucao`) → confirmação → `publicar_skill`. `atualizar_skill`
  com SQL novo une o AST ao pacote persistido (como `validar_skill`; grafo
  `inferido` não entra; status volta a rascunho). Firebird: treino parseia o `sqlModelo` (não
  `DIALECT_UNSUPPORTED`; sem FIRST/TOP/LIMIT no modelo); consulta publicada só
  exemplo. Aviso `PAGINACAO_MODELO` se o modelo já declara TOP/LIMIT/FIRST.
  Envelope `PACOTE_INCOMPLETO.nextAction` é a primeira falta bloqueante (não
  sempre `validar_skill`). `confirmar_relacionamento` sem `skillId` grava só no
  grafo — o validador publicado não vê o JOIN até ele entrar no pacote. Rascunho, validada ou
  `rascunho_revalidacao` não consultam (`rascunho_revalidacao`: validar →
  republicar). `listar_skills` devolve status/`fluxoTreino`/`faltas[]`; o
  pacote fica em `obter_skill`. Skill `validada` com perfil incompleto:
  `proximoPasso` é a tool da primeira falta (nunca `null`). `despublicar_skill`
  rebaixa para validada sem apagar. JOIN composto substitui pares isolados;
  `confirmar_relacionamento` pede cardinalidade e tipo de JOIN (`tipoJoin`;
  omitir preserva LEFT do SQL, não grava inner). `remover_relacionamento` apaga
  um fingerprint. `inspecionar_consulta` aceita
  `validada` e permite `SELECT *` cortado de uma tabela do allowlist (sem máscara;
  colunas novas no grafo `inferido`). Célula binária vira stub `kind: anexo`
  **sem handle** na inspeção (não invente bytes; não use inspeção
  como segunda via de foto pessoal). Foto livre: `consultar_dados` +
  `exportar_anexo`. `consultar_dados` aceita `skillIds` omitido
  (união das publicadas) e `consultaAprendidaId`. `confirmar_coluna` aceita `colunas[]`.
  Cobertura de `buscar_contexto` não usa o SQL nem o corpo da regra;
  `conhecimentos[]` é evidência FTS/`ILIKE` (não RAG), não licença de consulta.
  Stem léxico une inflexão na cobertura. Negação na descrição (incluindo lista
  após “não autoriza cruzar”) não conta.
  Envelope de `buscar_contexto` não inclui `sqlModelo` nem SQL aprendido — reuse
  `consultasAprendidas[].id` em `obter_skill`. Cobertura `composta` + `fatias[]`
  orquestra várias `consultar_dados` (não cruzar SELECT). `consultaSemanticaSugerida`
  com `consultaPermitida` e KPI de agregação (CAST não entra; IR só com alias
  medida no pacote; score 0 sem IR omite; maior overlap da pergunta) **ou**
  listagem só com dimensões/filtros. `metricasSemOverlay[]` não inventa `definicao`. `fluxoTreino.pacoteMinimo` oriente (uma
  tabela; CAST não é medida) sem afrouxar gates. `faltas[]` de KPI (não quantidade/parcelas/`NroParc`/`Qtde`) e JOIN isolado
  coberto por composto não bloqueiam publicação. Falta `kind: param` (tipo
  default `string`) também não bloqueia. `SKILL_GAP` omite `fluxoTreino` salvo skill em andamento e não pede sinônimo. Hint de cruzamento só na pergunta de cruzamento.

## Segurança e autorização

Não exponha senha, `client_token`, JWT do hub ou token MCP. `atualizar_persona` recusa texto que pareça segredo e não persiste. A execução depende
de três portões: JWT Client, `ClientAgentAccess` e policy do `client_token` no
`plug_agente`. Cache de query isola usuário/token/policy/versão no prefixo
`mcp:query:acesso:{acessoId}:` (resultado com anexo **não** é cacheado; handle HMAC+TTL
só em memória). Preserve a origem de cada falha e não faça retry cego.

## Referências rápidas

- Tools e fluxo: `docs/mcp/tools.md`
- Erros e avisos: `docs/mcp/error-mapping.md`
- Objetivo do produto: `docs/product/objective.md`
- Comunicação e auth do hub: `docs/plug-server/communication.md` e
  `docs/plug-server/auth.md`
- Testes: `.cursor/rules/testing.mdc` e `tests/`
