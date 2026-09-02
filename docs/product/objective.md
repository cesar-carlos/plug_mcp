# Objetivo de produto

O MCP existe para **dar à IA uma base de conhecimento** sobre o ERP do `agentId`. A **base comum** de todo consumidor MCP é SQL no **plug_server**, no **dialeto do `agentId`**, com resources (`guia://paginacao`, `guia://dialeto/{mssql|sybase|postgres|firebird}` já no bootstrap e após Bearer; `skill://` = pacote publicado, exige Bearer; `persona://{acessoId}` = tom/uso do acesso, exige Bearer), estrutura pelas **skills publicadas** e consultas dinâmicas só no pacote (validador fail-closed). Sem embeddings. Não assuma mssql — leia o guia do acesso. Identificar o GDBR ligado ao acesso e escrever SQL compatível é responsabilidade do **treino** e da **IA** — não do `plug_server` (hub: encaminha `sql.execute`, policy, PayloadFrame, timeouts; não implementa linguagem SQL, rewrite de dialeto nem classificação de erro mssql/sybase/postgres/firebird). Skill treinada num dialeto não licencia `TOP`/`OFFSET` de outro GDBR. A especialidade em SQL permanece. O **papel** combina a **persona do acesso** (`atualizar_persona`: `nomePersona` + `instrucoesPersona` — tom/uso) com as **skills publicadas** daquele `agentId` (pacote: nome, descrição, `metricasSaida`, regras). SQL comum primeiro; persona depois; em conflito vale o pacote fail-closed. Persona **não** recorta skills nem licencia tabela, coluna, JOIN ou `consultaPermitida`. **Várias personas = vários acessos** (`adicionar_acesso`); um acesso = um chapéu — não concatenar. O trio usuário+`agentId`+token tem **uma** persona; o mesmo `agentId` compartilhado entre usuários MCP diferentes pode ter textos diferentes. Não misture `agentId` — escolha o acesso `sqlAccessState: active` em `verificar_acesso`. A IA lê o pacote, escreve SQL no dialeto do acesso e responde com dados citáveis — sem inventar schema nem especialidade.

Todo `initialize` injeta um **pre-treino de sessão** (SQL comum primeiro). Sem Bearer: só o SQL. Com Bearer e um acesso: SQL + persona depois. Com vários acessos: SQL comum + “adote a persona desse `acessoId`” (`listar_acessos` / `persona://{acessoId}`) — não concatena chapéus. Sessão que começa com 1 acesso e ganha o 2º (`adicionar_acesso`) **mantém o chapéu 1** em `initialize.instructions` até reconectar; `pre_treino` relê o banco. Host que reusa a conexão pode reler o prompt `pre_treino`.

## Consulta

A skill publicada é o **pacote de conhecimento** e o **escopo** da consulta: tabelas, colunas físicas, relacionamentos compostos, dicionários, `graoPorTabela`/`graoResultado`, métricas de saída, cardinalidade, regras e consulta exemplo (`sqlModelo`). Fluxo: `buscar_contexto` (candidatos + `cobertura`) / `listar_skills` / `obter_skill` / resource `skill://` (mesmo pacote) → a IA escreve SELECT (agregação, `GROUP BY`, `WHERE` no banco) → `consultar_dados(acessoId, skillIds?, sql | consultaSemantica | consultaAprendidaId, params, pergunta)`. `skillIds` omitido une todas as publicadas do `agentId` (se vierem, recortam). Sem `sql`/IR/id, o servidor executa a consulta exemplo (uma skill âncora). Cruzamento exige JOIN já em algum pacote.

O validador recusa tabela, coluna, alias, UNION/subquery ou JOIN fora do allowlist das skills **publicadas** (união do agente se `skillIds` omitido). `buscar_contexto` devolve `cobertura` (`completa` / `parcial` / `desconhecida` / `composta`) e `consultaPermitida` quando a cobertura é completa ou composta (`fatias[]` = várias chamadas, não um SELECT cruzado). Envelope **sem** `sqlModelo` nem SQL aprendido — reuse o `id` em `obter_skill`. `conhecimentos[]` é evidência FTS/`ILIKE` (não RAG); **não** autoriza SQL. Sem skill capaz: `SKILL_GAP` (a busca por termos não prova ausência — `listar_skills`). Skill em treino que cobre a pergunta: `SKILL_NOT_PUBLISHED`. Envelope, IR sugerido e hints: [`../mcp/tools.md`](../mcp/tools.md). Erros (`source` `sql` / `sql_engine` / policy / HTTP): [`../mcp/error-mapping.md`](../mcp/error-mapping.md).

O grafo apoia o **treino** e acumula o que a execução confirma (`validado_execucao`). Não é licença para inventar tabela ou JOIN. `inspecionar_consulta` pode navegar tabelas do allowlist com `SELECT *` cortado (sem WHERE, teto 100, amostra crua) e grava tipos no grafo como `inferido`; `confirmar_coluna` com `skillId` (lote `colunas[]`) entra no pacote — skill **publicada** já consulta; senão republicar. Treino continua com SELECT nomeado e recorte. Coluna binária (foto/PDF) **não** vai nas `rows`: stub `{ kind: "anexo" }` — handle só de `consultar_dados` chama `exportar_anexo` (mesmos portões); inspeção omite handle no stub; não inventa bytes; não usa inspeção como segunda via de foto pessoal.

## Sem skill

Se não houver skill capaz de buscar o dado **ou** de cruzar as informações pedidas:

1. Ser honesta e pragmática: não há habilidade cadastrada para isso. Não inventar especialidade além das skills publicadas.
2. Não inventar JOIN, tabela, coluna nem dicionário de códigos.
3. Orientar o usuário no passo a passo até **liberar** a skill: `treinar_com_sql` → `criar_skill` (pacote mínimo: uma tabela, WHERE ou agregação, params com descrição; JOIN/KPI só se o usuário pedir — `fluxoTreino.pacoteMinimo` oriente, CAST não é medida, não afrouxa gates) → descrever params (incluindo `tipo`) → `validar_skill` (une `sqlModelo` ao escopo persistido; não apaga `confirmar_coluna` / `confirmar_relacionamento`; perfil não apaga `sensibilidade` confirmada) → confirmação no chat (cardinalidade **e** INNER vs LEFT; passe `tipoJoin`) → `publicar_skill` com `confirmadoPeloUsuario: true` (sem `politicaConsulta` grava default de teto/timeout). Sem confirmação, a tool devolve `resumoPublicacao` e `faltas[]`. Skill em `rascunho_revalidacao`: validar de novo e republicar. Manutenção: `listar_skills` (status/`fluxoTreino`/`faltas[]`; `obter_skill` para o pacote), overlay de KPI em `metricasSaida` (falta `kind: kpi` também para coluna `papel=medida` no SELECT sem overlay, exceto quantidade/parcelas/`NroParc`/`Qtde`; **não** bloqueia publicação; CAST não é medida), `despublicar_skill` (volta a validada sem apagar), rename de slug com confirmação. JOIN composto substitui pares isolados; isolado coberto pede `remover_relacionamento`. Skill `validada` com perfil incompleto: `proximoPasso` nunca é `null`. Cada tool devolve `fluxoTreino`; o servidor recusa pular.

## Aprendizado

A base evolui a cada consulta, sem depender da IA lembrar de um passo extra:

1. **`consultar_dados` grava o SQL que funcionou** (`consulta_aprendida` associada a todas as `skillIds`). `pergunta` é obrigatória.
2. **Regra, dicionário, glossário, métrica ou sinônimo** que o usuário ensinou no chat: `consultar_dados.aprendizado[]` na mesma chamada, ou a tool `registrar_aprendizado`. Dicionário exige tabela+coluna. `tipo=metrica` + `skillId` overlaya `definicao` no alias já existente em `metricasSaida` (alias inventado → `COLUNA_FORA_DO_ESCOPO`). Não deixe só no texto da resposta.
3. **`salvar_consulta`** (com `confirmadoPeloUsuario`) amarra uma pergunta clara a um SQL já comprovado — exemplo curado para reuso.
4. Execução bem-sucedida promove colunas e JOINs a `validado_execucao`.
5. `SKILL_GAP` vira `lacuna_consulta` só quando a busca é específica o bastante. `buscar_contexto` devolve as **perguntas** e `id` de `consultasAprendidas` (status `ativa`) e `conhecimentos[]` (evidência; não autoriza consulta). O SQL está em `obter_skill`.
6. SQL recusado pelo validador ou pelo hub **não** é persistido (evita poluir a base). A IA lê `code`/`message`/`hint`/`source`: `sql`/`sql_engine` corrige **dentro do pacote** (no dialeto do GDBR; `sql_engine` é o motor via `plug_agente`, não rewrite do hub) e não repete o padrão; `plug_server_http` + `invalid_payload` / `PLUG_SERVER_ERROR` **não** reescreve o SQL; 429/503 ≠ policy. Correção ensinada pelo usuário: `registrar_aprendizado` / `aprendizado[]` / `salvar_consulta`.

## Comunicação com o ERP

O MCP **não** abre o banco. É um `Client` REST do plug-server (`sql.execute` + `client_token`). O hub **não** implementa linguagem SQL nem rewrite de dialeto: o motor está no GDBR via `plug_agente`. Falha de consulta: leia `code`/`message`/`hint`/`source` (`sql_engine` = motor/GDBR, não camada de dialeto do hub). Canal: [`../plug-server/communication.md`](../plug-server/communication.md). Firebird só executa a consulta exemplo (sem SQL livre nem inspeção ad hoc).

## Cofre e permissão

O usuário já é Client no plug-server. O MCP só guarda e-mail, senha cifrada, `agentId`, `client_token`, dialeto e, no acesso, a persona opcional (`nomePersona` / `instrucoesPersona`). Emite **um** token MCP opaco para identificar o usuário na sessão.

Regras de tabela/operação: só no plug-server / `plug_agente`. O MCP não cria política SQL. O escopo da skill recorta o que a IA pode pedir; a policy do `client_token` recorta o que o hub executa.

## Fora de escopo

Authorization Server próprio, JWT de conta MCP, Client de serviço no `.env`, catálogo pronto (`Fonte` / seed `vendas`). Socket/relay de consumer.

Índice e ordem de leitura: [../README.md](../README.md). O _porquê_ das três camadas (histórico): [../proposta-arquitetura-mcp-se7e.md](../proposta-arquitetura-mcp-se7e.md).
