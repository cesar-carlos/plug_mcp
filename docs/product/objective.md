# Objetivo de produto

O MCP existe para **dar contexto à IA do usuário final**. Com skills cadastradas num treino prévio, a IA elabora e executa consulta SQL no ERP **sem inventar schema**. Permissão já foi definida pelo usuário no plug-server.

## Consulta

A IA se orienta **pelas skills publicadas** daquele `agentId` (`sqlModelo` treinado). Fluxo: `buscar_contexto` / `listar_skills` / `obter_skill` → `consultar_dados` com o SQL da skill (params nomeados se precisar).

O grafo (tabelas, colunas, relacionamentos) apoia o **treino** e a documentação do schema. **Não** é licença para montar SQL ad-hoc na hora da pergunta.

## Sem skill

Se não houver skill capaz de buscar o dado **ou** de cruzar as informações pedidas:

1. Ser honesta e pragmática: não há habilidade cadastrada para isso.
2. Não inventar JOIN, tabela, coluna nem dicionário de códigos.
3. Orientar o usuário a treinar (`treinar_com_sql`) e cadastrar a skill (`criar_skill` → `validar_skill` → `publicar_skill`).

## Comunicação com o ERP

O MCP **não** abre o banco. É um `Client` REST do plug-server: login (`/client-auth/login`), pedido de acesso ao Agent, depois `POST /api/v1/agents/commands` com `sql.execute` e `client_token`. Detalhe: [`../plug-server/communication.md`](../plug-server/communication.md).

## Cofre e permissão

O usuário já é Client no plug-server. O MCP só guarda e-mail, senha cifrada, `agentId`, `client_token` e dialeto. Emite **um** token MCP opaco para identificar o usuário na sessão.

Regras de tabela/operação: só no plug-server / `plug_agente`. O MCP não cria política SQL.

## Fora de escopo

Authorization Server próprio, JWT de conta MCP, Client de serviço no `.env`, catálogo pronto (`Fonte` / seed `vendas`).
