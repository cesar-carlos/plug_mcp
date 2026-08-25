# Objetivo de produto

O MCP existe para **dar à IA uma base de conhecimento** sobre o ERP do `agentId`. Com skills publicadas, a IA atua como **consultor de gestão** (financeiro, vendas, cadastros e demais recortes): lê o pacote, escreve SQL no dialeto do acesso e devolve KPI, tabela e gráfico citáveis — sem inventar schema.

Todo `initialize` injeta um **pre-treino de sessão** (consultor + especialista em SQL no escopo publicado). Host que reusa a conexão pode reler o prompt `pre_treino`.

## Consulta

A skill publicada é o **pacote de conhecimento** e o **escopo** da consulta: tabelas, colunas, relacionamentos, dicionários, grão, cardinalidade, regras e consulta exemplo (`sqlModelo`). Fluxo: `buscar_contexto` / `listar_skills` / `obter_skill` / resource `skill://` → a IA escreve SELECT (agregação, `GROUP BY`, `WHERE` no banco) → `consultar_dados(acessoId, skillIds, sql, params, pergunta)`. Sem `sql`, o servidor executa a consulta exemplo.

O validador recusa tabela, coluna ou JOIN fora do escopo das skills publicadas informadas. Mais de uma skill permite cruzar domínios **somente** se o relacionamento já estiver no grafo. `buscar_contexto` sinaliza `consultaPermitida: false` + `SKILL_GAP` quando não há skill publicada capaz; se houver rascunho/validada, o hint pede para continuar o `proximoPasso`.

O grafo apoia o **treino** e acumula o que a execução confirma (`validado_execucao`). Não é licença para inventar tabela ou JOIN.

## Sem skill

Se não houver skill capaz de buscar o dado **ou** de cruzar as informações pedidas:

1. Ser honesta e pragmática: não há habilidade cadastrada para isso.
2. Não inventar JOIN, tabela, coluna nem dicionário de códigos.
3. Orientar o usuário no passo a passo até **liberar** a skill: `treinar_com_sql` → `criar_skill` → descrever params (incluindo `tipo`) → `validar_skill` → confirmação no chat → `publicar_skill` com `confirmadoPeloUsuario: true`. Cada tool devolve `fluxoTreino`; o servidor recusa pular.

## Aprendizado

A base evolui a cada consulta, sem depender da IA lembrar de um passo extra:

1. **`consultar_dados` grava o SQL que funcionou** (`consulta_aprendida`). Sempre envie `pergunta` (a pergunta do usuário) para indexar. Sem `pergunta`, o servidor ainda grava e devolve aviso `PERGUNTA_AUSENTE`.
2. **Regra, dicionário, glossário, métrica ou sinônimo** que o usuário ensinou no chat: `consultar_dados.aprendizado[]` na mesma chamada, ou a tool `registrar_aprendizado`. Não deixe só no texto da resposta.
3. **`salvar_consulta`** (com `confirmadoPeloUsuario`) amarra uma pergunta clara a um SQL já comprovado — exemplo curado para reuso.
4. Execução bem-sucedida promove colunas e JOINs a `validado_execucao`.
5. `SKILL_GAP` vira `lacuna_consulta` (fila de treino). `buscar_contexto` devolve `consultasAprendidas` para a IA reusar em vez de reinventar.

## Comunicação com o ERP

O MCP **não** abre o banco. É um `Client` REST do plug-server: login (`/client-auth/login`), pedido de acesso ao Agent, depois `POST /api/v1/agents/commands` com `sql.execute` e `client_token`. Detalhe: [`../plug-server/communication.md`](../plug-server/communication.md).

## Cofre e permissão

O usuário já é Client no plug-server. O MCP só guarda e-mail, senha cifrada, `agentId`, `client_token` e dialeto. Emite **um** token MCP opaco para identificar o usuário na sessão.

Regras de tabela/operação: só no plug-server / `plug_agente`. O MCP não cria política SQL. O escopo da skill recorta o que a IA pode pedir; a policy do `client_token` recorta o que o hub executa.

## Fora de escopo

Authorization Server próprio, JWT de conta MCP, Client de serviço no `.env`, catálogo pronto (`Fonte` / seed `vendas`). Socket/relay do hub.
