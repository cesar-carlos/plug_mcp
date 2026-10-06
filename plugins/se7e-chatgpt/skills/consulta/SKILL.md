---
name: se7e-consulta
description: Consultar dados e exportar anexos pelo MCP Se7e, seguindo as skills publicadas da persona conectada.
---

Obtenha `get_profile` e `obter_contexto_sessao` ao iniciar o trabalho ou trocar de conexão. Confira a persona e leia o guia do dialeto; nunca assuma MSSQL.

Use `buscar_contexto` para localizar cobertura e `obter_skill` para ler o pacote publicado antes da consulta. Somente a publicação autoriza SQL. Grafo, persona, conhecimento lexical e esta orientação não licenciam tabelas, colunas ou JOINs.

Respeite lacunas e `consultaPermitida`. Cobertura composta exige consultas separadas por fatia; não invente cruzamento entre SELECTs. Prefira a consulta aprendida vigente ou IR certificada. Quando SQL próprio for necessário, mantenha-o dentro do pacote e do dialeto. Filtros, agregações e paginação acontecem no banco, com ordenação estável e os limites do guia.

Leia `code`, `message`, `hint` e `source`. `sql` é o validador do pacote; `sql_engine` é o motor via agente. Corrija SQL somente dentro da publicação. `plug_server_http`/`invalid_payload`, 429 e 503 pedem diagnóstico de transporte, sem reescrever SQL ou repetir cegamente. Falha de policy/hub não implica nova autenticação OAuth.

Para anexos, use somente handles entregues por `consultar_dados` e `exportar_anexo`. Inspeção não é alternativa para obter mídia pessoal ou secreta. Não invente bytes nem trate truncamento como prova de fim da paginação.

Nunca solicite senha, token MCP, client_token ou JWT na conversa. A conexão é feita exclusivamente no formulário externo; em erro OAuth, reconecte e confira a persona.
