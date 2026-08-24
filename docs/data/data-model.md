# Modelo de dados

Não há tabela de senha de conta MCP, cliente de Authorization Server nem catálogo pronto.

## Cofre

- `usuario_mcp`: `email_enc`, `email_hash`, `senha_enc`, `token_hash` (SHA-256 do token MCP), `token_expires_at` (opcional; TTL `MCP_TOKEN_TTL_DAYS`). Unique em `email_hash` e `token_hash`.
- `acesso`: `usuario_id`, `agent_id`, `dialeto`, `nome_amigavel`, `client_token_enc`, `client_token_hash`, `status_acesso`. Unique `(usuario_id, agent_id, client_token_hash)`.

## Grafo (`agent_id`, compartilhado)

- `grafo_dialeto`: um dialeto por agente (primeiro escritor).
- `grafo_lock`: lock de merge (`SELECT … FOR UPDATE`).
- `relacionamento_grafo`: `tabela_origem_id`, `coluna_origem`, `tabela_destino_id`, `coluna_destino`, `tipo_join`. O treino grava as colunas reais do `ON` (igualdade `alias.coluna = alias.coluna`); JOIN sem igualdade é recusado; CROSS JOIN **não** grava relacionamento. JOIN no SELECT exige colunas qualificadas (`p.codprod`, não `codprod`).
- Precedência: `validado_execucao` > `confirmado_usuario` > `inferido`. Empate de texto → `conflito`.

## Skills e notas

- `skill`: `slug` unique por `agent_id`, `sql_modelo`, `params` (JSON: `{ nome, descricao, obrigatorio, tipo }[]`, `tipo` = string/number/date/boolean, default string; JSON legado sem tipo vira string), `versao`, `status` (`rascunho` | `validada` | `publicada`). Placeholders `:nome`/`@nome` viram contrato; validar e publicar exigem `descricao` em cada um. Skill **publicada** é a bússola da consulta; sem ela a IA não inventa SQL.
- `anotacao_grafo`: nota/glossário; `tabela_id` opcional.

## Auditoria

- `audit_log`: tool, SQL enviado, sucesso, código, linhas, duração. Sem segredos.

Leitura do grafo é recortada em aplicação pela policy do `client_token` (`allTables` / `tables`). A escrita acumula para todos os acessos daquele `agentId`.
