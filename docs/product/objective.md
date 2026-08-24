# Objetivo de produto

O MCP existe para **dar contexto à IA do usuário final**. Com skills cadastradas num treino prévio, a IA elabora e executa consulta SQL no ERP **sem inventar schema**. Permissão já foi definida pelo usuário no plug-server.

Todo `initialize` injeta um **pre-treino de sessão** (consultor de gestão + SQL só no treino). A IA cruza **resultados** de skills publicadas para KPI e diagnóstico; não monta SELECT/JOIN ad-hoc. Host que reusa a conexão pode reler o prompt `pre_treino`.

## Consulta

A IA se orienta **pelas skills publicadas** daquele `agentId`. Fluxo: `buscar_contexto` / `listar_skills` / `obter_skill` / resource `skill://` → `consultar_dados(skillId, params)`. O servidor **recusa SQL solto**; só executa o `sqlModelo` persistido da skill publicada.

O grafo (tabelas, colunas, relacionamentos) apoia o **treino** (passo a passo até `publicar_skill`) e a documentação do schema. **Não** é licença para montar SQL ad-hoc na hora da pergunta. `buscar_contexto` sinaliza `consultaPermitida: false` + `SKILL_GAP` quando não há skill publicada capaz; se houver rascunho/validada, o hint pede para continuar o `proximoPasso`.

## Sem skill

Se não houver skill capaz de buscar o dado **ou** de cruzar as informações pedidas:

1. Ser honesta e pragmática: não há habilidade cadastrada para isso.
2. Não inventar JOIN, tabela, coluna nem dicionário de códigos.
3. Orientar o usuário no passo a passo até **liberar** a skill: `treinar_com_sql` → `criar_skill` → descrever params (incluindo `tipo`) → `validar_skill` → confirmação no chat → `publicar_skill` com `confirmadoPeloUsuario: true`. Cada tool devolve `fluxoTreino`; o servidor recusa pular (criar sem grafo, validar sem descrição de params, publicar sem checklist ou sem confirmação).

## Comunicação com o ERP

O MCP **não** abre o banco. É um `Client` REST do plug-server: login (`/client-auth/login`), pedido de acesso ao Agent, depois `POST /api/v1/agents/commands` com `sql.execute` e `client_token`. Detalhe: [`../plug-server/communication.md`](../plug-server/communication.md).

## Cofre e permissão

O usuário já é Client no plug-server. O MCP só guarda e-mail, senha cifrada, `agentId`, `client_token` e dialeto. Emite **um** token MCP opaco para identificar o usuário na sessão.

Regras de tabela/operação: só no plug-server / `plug_agente`. O MCP não cria política SQL.

## Fora de escopo

Authorization Server próprio, JWT de conta MCP, Client de serviço no `.env`, catálogo pronto (`Fonte` / seed `vendas`).
