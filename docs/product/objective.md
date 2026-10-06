# Objetivo de produto

O MCP existe para **dar à IA uma base de conhecimento** sobre o ERP do acesso (`agentId` + `client_token` daquele e-mail). A **base comum** de todo consumidor MCP é SQL no **plug_server**, no **dialeto do acesso**, com resources (`guia://paginacao`, `guia://dialeto/{mssql|sybase|postgres|firebird}` já no bootstrap e após Bearer; `skill://{acessoId}/{slug}` = pacote publicado, exige Bearer; `persona://{acessoId}` = tom/uso do acesso, exige Bearer), estrutura pelas **skills publicadas daquele acesso** e consultas dinâmicas só no pacote (validador fail-closed). Sem embeddings. Não assuma mssql — leia o guia do acesso. Identificar o GDBR ligado ao acesso e escrever SQL compatível é responsabilidade do **treino** e da **IA** — não do `plug_server` (hub: encaminha `sql.execute`, policy, PayloadFrame, timeouts; não implementa linguagem SQL, rewrite de dialeto nem classificação de erro mssql/sybase/postgres/firebird). Skill treinada num dialeto não licencia `TOP`/`OFFSET` de outro GDBR. A especialidade em SQL permanece. O **papel** combina a **persona do acesso** (`atualizar_persona`: `nomePersona` + `instrucoesPersona` — tom/uso) com as **skills publicadas** daquele acesso (pacote: nome, descrição, `metricasSaida`, regras). SQL comum primeiro; persona depois; em conflito vale o pacote fail-closed. Persona **não** recorta skills **neste acesso** (outro token = outro catálogo) nem licencia tabela, coluna, JOIN ou `consultaPermitida`. **1 `client_token` = 1 persona = 1 catálogo isolado** (skills/grafo/aprendizado em `acesso_id`; senha autentica, **não** particiona). Mesmo e-mail/`agentId` + outro `client_token` (`adicionar_acesso` / `registrar_acesso`) começa **vazio** e emite um **Bearer novo**. **Várias personas = vários acessos = vários tokens MCP**; um Bearer = um chapéu — não concatenar. O Bearer autentica exatamente um acesso: as tools **omitem** `acessoId`. `acessoId` de outra persona → `VALIDATION_ERROR`. Hub SQL continua `agentId` + `client_token` daquele acesso. O trio usuário+`agentId`+token tem **uma** persona; o mesmo `agentId` compartilhado entre usuários MCP diferentes pode ter textos diferentes. Não misture `agentId` no hub — escolha o acesso `sqlAccessState: active` em `verificar_acesso`. A IA lê o pacote, escreve SQL no dialeto do acesso e responde com dados citáveis — sem inventar schema nem especialidade.

Todo `initialize` injeta um **pre-treino de sessão** (SQL comum primeiro). Sem Bearer: só o SQL. Com Bearer: SQL + persona **deste** acesso depois (`blocoPersonaUnico`). `adicionar_acesso` não troca o chapéu desta sessão (devolve `setupUrl` do Bearer novo). Este Bearer **nunca** ganhou um segundo chapéu — o host que reusa a conexão só vê o chapéu 1 em `instructions` até reconectar; `pre_treino` relê o banco desta persona.

## Consulta

A skill publicada é o **pacote de conhecimento** e o **escopo** da consulta: tabelas, colunas físicas, relacionamentos compostos, dicionários, `graoPorTabela`/`graoResultado`, métricas de saída, cardinalidade, regras e consulta exemplo (`sqlModelo`). Fluxo: `buscar_contexto` (candidatos + `cobertura`) / `listar_skills` / `obter_skill` / resource `skill://{acessoId}/{slug}` (mesmo pacote) → a IA escreve SELECT (agregação, `GROUP BY`, `WHERE` no banco) → `consultar_dados` (omite `acessoId`; `skillIds?` + `sql` | `consultaSemantica` | `consultaAprendidaId` + `params` + `pergunta`). `skillIds` omitido une todas as publicadas **deste acesso** (se vierem, recortam). Sem `sql`/IR/id, o servidor executa a consulta exemplo (uma skill âncora). Cruzamento exige JOIN já em algum pacote.

O validador recusa tabela, coluna, alias, UNION/subquery ou JOIN fora do allowlist das skills **publicadas** (união deste acesso se `skillIds` omitido). `buscar_contexto` devolve `cobertura` (`completa` / `parcial` / `desconhecida` / `composta`) e `consultaPermitida` quando a cobertura é completa ou composta (`fatias[]` = várias chamadas, não um SELECT cruzado). Envelope **sem** `sqlModelo` nem SQL aprendido — reuse o `id` em `obter_skill`. `conhecimentos[]` é evidência FTS/`ILIKE` (não RAG); **não** autoriza SQL. Sem skill capaz: `SKILL_GAP` (a busca por termos não prova ausência — `listar_skills`). Skill em treino que cobre a pergunta: `SKILL_NOT_PUBLISHED`. Envelope, IR sugerido e hints: [`../mcp/tools.md`](../mcp/tools.md). Erros (`source` `sql` / `sql_engine` / policy / HTTP): [`../mcp/error-mapping.md`](../mcp/error-mapping.md).

O grafo apoia o **treino** e acumula o que a execução confirma (`validado_execucao`). Não é licença para inventar tabela ou JOIN. `inspecionar_consulta` pode navegar tabelas do allowlist com `SELECT *` cortado (sem WHERE, teto 100, amostra de colunas confirmadas permitidas; sensíveis mascaradas, pessoais/segredos/inferidas omitidas) e grava tipos no grafo como `inferido`; `confirmar_coluna` com `skillId` (lote `colunas[]`) entra no pacote — ampliação exige nova publicação; publicação anterior continua disponível. Treino continua com SELECT nomeado e recorte. Coluna binária (foto/PDF) **não** vai nas `rows`: stub `{ kind: "anexo" }` — handle só de `consultar_dados` chama `exportar_anexo` (mesmos portões); inspeção omite handle no stub; não inventa bytes; não usa inspeção como segunda via de foto pessoal.

## Sem skill

Se não houver skill capaz de buscar o dado **ou** de cruzar as informações pedidas:

1. Ser honesta e pragmática: não há habilidade cadastrada para isso. Não inventar especialidade além das skills publicadas.
2. Não inventar JOIN, tabela, coluna nem dicionário de códigos.
3. Orientar o usuário no passo a passo até **liberar** a skill: `treinar_com_sql` → `criar_skill` (pacote mínimo: uma tabela, WHERE ou agregação, params com descrição; JOIN/KPI só se o usuário pedir — `fluxoTreino.pacoteMinimo` oriente, CAST não é medida, não afrouxa gates) → descrever params (incluindo `tipo`; default `string` é aceito, falta `kind: param` não bloqueia publicar) → `validar_skill` (une `sqlModelo` ao escopo persistido; não apaga `confirmar_coluna` / `confirmar_relacionamento`; perfil não apaga `sensibilidade` confirmada; `confirmar_coluna` aplica a classe mesmo após `validado_execucao`) → confirmação no chat (cardinalidade **e** INNER vs LEFT; passe `tipoJoin`; sem `skillId` o JOIN fica só no grafo) → `publicar_skill`: primeiro revise o `diffPublicacao` e confirme o mesmo `confirmacaoHash` com `confirmadoPeloUsuario: true` (sem `politicaConsulta` grava default de teto/timeout). Hash obsoleto retorna CONFIRMACAO_DESATUALIZADA e exige novo preview; hash ausente nunca publica. Sem confirmação, a tool devolve `resumoPublicacao` e `faltas[]`. `atualizar_skill` com SQL novo une o AST ao pacote persistido (grafo `inferido` não entra) e volta a rascunho. Envelope `PACOTE_INCOMPLETO.nextAction` é a primeira falta bloqueante (não sempre `validar_skill`). Aviso `PAGINACAO_MODELO` se o `sqlModelo` já declara TOP/LIMIT/FIRST. Skill em `rascunho_revalidacao`: validar de novo e republicar. Manutenção: `listar_skills` (status/`fluxoTreino`/`faltas[]`; `obter_skill` para o pacote), overlay de KPI em `metricasSaida` (falta `kind: kpi` também para coluna `papel=medida` no SELECT sem overlay, exceto quantidade/parcelas/`NroParc`/`Qtde`; **não** bloqueia publicação; CAST não é medida), `despublicar_skill` (volta a validada sem apagar), rename de slug com confirmação. JOIN composto substitui pares isolados; isolado coberto pede `remover_relacionamento`. Skill `validada` com perfil incompleto: `proximoPasso` nunca é `null`. Cada tool devolve `fluxoTreino`; o servidor recusa pular.

## Aprendizado

Treinamento é curadoria de pacotes e conhecimento. Sucesso técnico não confirma significado de negócio.

1. consultar_dados pode capturar SQL parametrizado seguro como candidata, associado às skills/publicações efetivas. Pergunta obrigatória; captura sensível ou com literais é omitida sem falhar a consulta.
2. Candidatas não licenciam consultaAprendidaId nem aparecem no contexto de reutilização; retenção de 90 dias.
3. salvar_consulta exige confirmação humana e pacote vigente; exemplos confirmados deixam de ser reutilizáveis quando suas publicações mudam. A avaliação com IA mede qualidade, sem promover consultas automaticamente.
4. registrar_aprendizado registra conhecimento explicitamente ensinado. aprendizado[] na consulta só sinaliza pendência. Mudanças semânticas alimentam o rascunho e exigem republicação.
5. Execução confirma funcionamento técnico, preservando descrição, classificação e cardinalidade confirmadas. Nunca substitui confirmação de negócio. SQL recusado não persiste; SKILL_GAP pode registrar lacuna.

## Comunicação com o ERP

O MCP **não** abre o banco. É um `Client` REST do plug-server (`sql.execute` + `client_token`). O hub **não** implementa linguagem SQL nem rewrite de dialeto: o motor está no GDBR via `plug_agente`. Falha de consulta: leia `code`/`message`/`hint`/`source` (`sql_engine` = motor/GDBR, não camada de dialeto do hub). Canal: [`../plug-server/communication.md`](../plug-server/communication.md). Firebird: treino parseia o `sqlModelo` (não `DIALECT_UNSUPPORTED`; sem `FIRST`/`TOP`/`LIMIT` no modelo). Depois de publicar só executa a consulta exemplo (sem SQL livre nem inspeção ad hoc).

## Cofre e permissão

O usuário já é Client no plug-server. O MCP só guarda e-mail, senha cifrada, `agentId`, `client_token`, dialeto e, no acesso, a persona opcional (`nomePersona` / `instrucoesPersona`). Emite **um token MCP opaco por acesso** (1 Bearer = 1 persona = 1 `CLIENT_TOKEN`). Senha autentica; não particiona.

Regras de tabela/operação: só no plug-server / `plug_agente`. O MCP não cria política SQL. O escopo da skill recorta o que a IA pode pedir; a policy do `client_token` recorta o que o hub executa.

## Fora de escopo

Authorization Server para novas contas e JWT de conta MCP, Client de serviço no `.env`, catálogo pronto (`Fonte` / seed `vendas`). Socket/relay de consumer.

Índice e ordem de leitura: [../README.md](../README.md). O _porquê_ das três camadas (histórico): [../proposta-arquitetura-mcp-se7e.md](../proposta-arquitetura-mcp-se7e.md).

## Governança, publicação e operação

`buscar_contexto` continua lexical (FTS/`ILIKE`); seu `diagnosticoCobertura` separa capacidade ausente de treino, publicação, pacote e composição e entrega um plano ordenado. Isso é evidência para a IA, nunca autorização de consulta. `consultaSemantica` v2 normaliza a forma legada v1 e distingue `agregacao` (uma ou mais métricas) de `listagem` (somente dimensões); ambas empurram filtros, ordenação, limite e paginação para o banco. `validar_consulta` e `consultar_dados` compartilham o mesmo preflight, incluindo política, privacidade, fanout, escopo e recomendações de custo.

Anotações podem carregar fonte, responsável, intervalo inclusivo de vigência e agenda opcional de revisão (`revisarEm`/`periodoRevisaoDias`). Registros legados permanecem `legado`/`vigente`; somente notas ativas no fuso do acesso orientam contexto e avisos. A fila de revisão prioriza manutenção e não altera cobertura nem autorização. `atualizar_anotacao` exige confirmação explícita. O catálogo segue isolado por acesso.

Alertas de SLO, revisão e webhooks são apenas observabilidade operacional isolada por acesso. Guardam identificadores e agregados permitidos; nunca a pergunta, SQL, parâmetros, resultados, credenciais ou corpo de anotação. Eles não são conhecimento, RAG, evidência de cobertura ou licença para consulta.

Cada publicação possui snapshot canônico, versão e hash SHA-256. `publicar_skill` primeiro retorna preview/diff e `confirmacaoHash`; uma publicação efetiva exige o mesmo hash e confirmação atômica. Deriva de schema informa delta, skills/consultas afetadas e ações sem expor SQL aprendido; mudanças incompatíveis rebaixam a skill e invalidam somente seu cache.

Auditoria e métricas guardam apenas metadados permitidos (IDs, origem, contagens, paginação, truncamento, cache, estágio e durações), nunca SQL, pergunta, parâmetros, resultados ou segredos. O painel operacional deriva somente taxas, tendência e percentis desse conjunto seguro. O gateway pode solicitar `serverTimings` por amostragem (`PLUG_SERVER_TIMINGS_SAMPLE_PERCENT`, padrão 10) e registra se o hub devolveu timings. O contrato REST do hub é gerado deterministicamente em `plug_server/contracts/plug-mcp-rest-v1.json`, comparado ao baseline público de compatibilidade e verificado por `contract:check`.

## Publicação e correção dos resultados

Uma identidade de skill possui revisão editável e ponteiro para snapshot ativo imutável. Edição/validação preservam a última publicação válida. Consulta, resource, estrutura e regras autorizadas leem snapshot; ampliação só entra após preview/hash e confirmação atômica. Revogação/restrição atua imediatamente; mudança incompatível suspende somente pacotes afetados. obter_skill permite selecionar rascunho explicitamente.

PreparedQuery unifica validar_consulta e consultar_dados; IR v1 permanece normalizada e v2 distingue agregação/listagem. Recortes físicos dominam todos os caminhos lógicos, SQL inteiro é somente leitura e grão/cardinalidade/origem física bloqueiam fanout. Nenhuma primeira coluna é escolhida para resolver ambiguidade. Três portões vigentes são revalidados na entrega, inclusive cache/anexo.

Credenciais são informadas somente no navegador; tools recusam segredos e retornam URL de operação. [Cofre e recuperação](../auth/vault-and-mcp-token.md).

## Camadas de treinamento

A base comum versionada SQL + plug_server orienta todas as personas; publicação ativa e três portões autorizam; persona personaliza. Curadoria tem preview/hash/CAS por chat. Testes de negócio obrigatórios bloqueiam apenas nova publicação; avaliação fica em runner separado. Templates importam rascunhos, datasets contêm apenas casos sintéticos aprovados; fine-tuning de pesos não integra o servidor. Contrato detalhado: [training.md](training.md).

## Conexão ChatGPT

[OAuth opcional](../auth/chatgpt-oauth.md) delega um acesso existente; não altera a autoridade das publicações, a policy ou confirmações. /mcp permanece manual. Perfil/contexto/revogação são tools exclusivas de /mcp/chatgpt. Falha de autenticação OAuth tem stage=oauth e desafio MCP; erros de hub/SQL não provocam reconexão OAuth.
