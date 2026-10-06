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
  - outro token (`adicionar_acesso` / `registrar_acesso`) começa vazio e ganha um
    **Bearer próprio**. **Várias personas = vários acessos = vários tokens MCP**; um
    Bearer = um chapéu — não concatenar nem unir pacotes. O Bearer autentica
    exatamente um acesso: omita `acessoId`. `acessoId` de outra persona →
    `VALIDATION_ERROR`. Resource `skill://{acessoId}/{slug}` só se for desta sessão.
    `adicionar_acesso` devolve `setupUrl` da persona nova e **não** troca esta sessão.
    O mesmo `agentId` entre usuários MCP diferentes pode ter textos e skills
    diferentes; o trio usuário+agentId+token tem uma persona.
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
  sucesso com pergunta segura captura somente candidata; confirmação humana promove; conhecimento explícito usa `registrar_aprendizado`,
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
  grafo — o validador publicado não vê o JOIN até ele entrar no pacote. Sem publicação ativa, rascunho, validada ou
  `rascunho_revalidacao` não consultam (`rascunho_revalidacao`: validar →
  republicar). `listar_skills` devolve status/`fluxoTreino`/`faltas[]`; o
  pacote fica em `obter_skill`. Skill `validada` com perfil incompleto:
  `proximoPasso` é a tool da primeira falta (nunca `null`). `despublicar_skill`
  rebaixa para validada sem apagar. JOIN composto substitui pares isolados;
  `confirmar_relacionamento` pede cardinalidade e tipo de JOIN (`tipoJoin`;
  omitir preserva LEFT do SQL, não grava inner). `remover_relacionamento` apaga
  um fingerprint. `inspecionar_consulta` aceita
  `validada` e permite `SELECT *` cortado de uma tabela do allowlist (com projeção segura e omissão de colunas pessoais/secretas/inferidas;
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

## Evoluções coordenadas

- `consultaSemantica` v2 é união discriminada: `agregacao` exige `metricas[]` e aceita dimensões; `listagem` exige apenas `dimensoes[]`. v1 continua válida e é normalizada internamente. `consultar_dados` e `validar_consulta` compartilham o preflight e devolvem `planoConsulta`; o validador executa somente envelope vazio.
- `buscar_contexto` devolve `diagnosticoCobertura` factual e lexical (FTS/`ILIKE`, nunca embeddings/RAG). Anotações podem ter governança temporal (`fonteTipo`, responsável, vigência e status) e agenda opcional (`revisarEm`/cadência); a fila de revisão não altera vigência nem licença SQL. Legadas são `legado`/`vigente`, e `atualizar_anotacao` exige confirmação.
- `publicar_skill` começa com preview/diff e `confirmacaoHash`; publicação efetiva exige confirmação explícita e o hash vigente em transação atômica. Snapshots são imutáveis. Deriva detalha deltas, skills/consultas afetadas e rebaixa somente quando o pacote é incompatível.
- Auditoria guarda somente metadados permitidos (IDs, origem, contagens, cache, paginação, truncamento, estágio e duração), nunca SQL, pergunta, parâmetros, resultados ou segredos. Painel operacional deriva apenas taxas/tendência/percentis desses metadados. Timings do hub são opt-in amostrado por `PLUG_SERVER_TIMINGS_SAMPLE_PERCENT` (padrão 10).
- O contrato REST usado pelo MCP é gerado do OpenAPI do hub em `plug_server/contracts/plug-mcp-rest-v1.json`; o baseline `plug-mcp-rest-v1.compatibility.json` proíbe remoção silenciosa de campos públicos. `npm run contract:check` deve permanecer verde no checkout do `plug_server`.
- Operação proativa é observabilidade, não conhecimento: alertas/revisões/webhooks ficam isolados por `acesso_id`, guardam só IDs e agregados permitidos e jamais licenciam SQL. URL/segredo de webhook são cifrados, só HTTPS público sem query/user-info, com DNS privado/loopback bloqueado a cada entrega. Worker separado usa outbox+lease, HMAC e retry/dead-letter; tools de configurar/rearmar exigem confirmação.
- Cache agregado usa singleflight na mesma chave isolada de usuário/token/policy/skill. Redis coordena réplicas por lease e falha aberta; não cachear erro/anexo nem criar retry cego. `test:migrations` valida banco novo e upgrade a partir de `0023` somente em bancos CI efêmeros.

## Autoridade ativa e segurança da evolução

Skill tem identidade, rascunho editável e publicação ativa imutável. Edição/validação mantém a anterior; ampliação exige republicação. status=publicada quando há snapshot utilizável e statusRascunho separado. obter_skill default ativo, revisao=rascunho explícito; skill:// só ativo. Publicar usa CAS/hash ligado a acesso/rascunho/base; confirmação obsoleta exige preview novo. Restrições/revogação/deriva/cardinalidade incompatível suspendem publicações afetadas imediatamente.

Tools de credenciais recebem objeto vazio estrito, retornam setupUrl/expiresAt. GET mostra formulário; POST confirmado/CSRF autentica identidade e vínculo no hub, mostra Bearer uma vez. Código hash de 256 bits/15 minutos; rotação só invalida anterior na conclusão. Snapshot/draft não substituem os três portões vigentes, revalidados em cache/exportação/entrega.

SQL inteiro somente leitura/funções seguras; recortes físicos dominantes em todos os caminhos e JOINs compostos simultâneos. Ambiguidade/fanout recusados; não SUM(DISTINCT valor) automático. Inspeção/perfil omitem valores inferidos/pessoais/segredos, sensíveis permitidos mascarados. Anexos vinculam origem física/publicações exatas e quotas de bytes.

Captura segura gera candidata, nunca licença de reuso. Confirmação humana por salvar_consulta vincula à publicação vigente. Retenção 90 dias. Execução técnica preserva definição/classificação/cardinalidade confirmadas; aprendizado semântico altera rascunho. MCP legado mantém sessão fixa por usuário/acesso; 2026-07-28 recompõe contexto por requisição. Origin/Host/proxy explícitos. Node 24 LTS e TypeScript 7 real no gate.

## Base comum e curadoria versionada

Base canônica: `shared/treinamento-base.ts`, guias públicos e obter_treinamento_base; ref/hash do contrato fixados. `salvar_consulta` é preview/hash/CAS, aprovar não incrementa execução; inativação não é revertida por captura. Grão de origem não é GROUP BY nem prova automática de unicidade. Casos sintéticos obrigatórios precisam de relatório atual do runner separado; ausência avisa. IA não grava aprovação de relatório. Templates criam rascunhos sem autoridade; datasets separam famílias e não mineram auditoria. Atualizar docs/product/training.md, schemas/runtime/rules/testes juntos.

## Delegação ChatGPT opcional

OAuth se7e:access autentica exatamente um acesso existente, sem ampliar pacote/policy. Concessão vinculada ao hash MCP de origem; refresh não troca persona. /mcp/chatgpt exige OAuth desde initialize. Sessões, assinaturas, cache/singleflight e anexos isolam concessão. Verificar antes do hub, gravação local na mesma transação e entrega. Setup derivado guarda concessão e revalida no navegador. Banco indisponível bloqueia; Redis não autoriza. Contrato: docs/auth/chatgpt-oauth.md. Testes: OAuth/CSRF/PKCE/replay/concorrência/revogação, compatibilidade manual e migração 0034.

Gravações OAuth passam pelo AuthorizedUnitOfWorkPort, com repositórios vinculados à mesma transação e efeitos classificados por método. Adapters não interceptam SQL nem usam Proxy de pg. Acessos existentes envolvidos são declarados e bloqueados em ordem de ID antes da concessão e dos registros de negócio; rede do hub permanece fora da transação. Validar TLS/DNS nativo e formulários no Chromium; chatgpt:check é somente leitura e não comprova instalação no ChatGPT.
