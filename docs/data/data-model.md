# Modelo de dados

Não há tabela de senha de conta MCP, cliente de Authorization Server nem catálogo pronto.

## Cofre

- `usuario_mcp`: `email_enc`, `email_hash`, `senha_enc`, `token_hash` (SHA-256 do token MCP), `token_expires_at` (opcional; TTL `MCP_TOKEN_TTL_DAYS`). Unique em `email_hash` e `token_hash`.
- `acesso`: `usuario_id`, `agent_id`, `dialeto`, `nome_amigavel`, `client_token_enc`, `client_token_hash`, `status_acesso`. Unique `(usuario_id, agent_id, client_token_hash)`.

## Grafo (`agent_id`, compartilhado)

- `grafo_dialeto`: um dialeto por agente (primeiro escritor).
- `grafo_lock`: lock de merge (`SELECT … FOR UPDATE`).
- `tabela_grafo` / `coluna_grafo` / `relacionamento_grafo`: `origem` (`inferido` | `confirmado_usuario` | `validado_execucao`), `status` (`vigente` | `conflito`).
- Precedência: `validado_execucao` > `confirmado_usuario` > `inferido`. Empate de texto → `conflito`.

## Skills e notas

- `skill`: `slug` unique por `agent_id`, `sql_modelo`, `versao`, `status` (`rascunho` | `validada` | `publicada`). Skill **publicada** é a bússola da consulta; sem ela a IA não inventa SQL.
- `anotacao_grafo`: nota/glossário; `tabela_id` opcional.

## Auditoria

- `audit_log`: tool, SQL enviado, sucesso, código, linhas, duração. Sem segredos.

Leitura do grafo é recortada em aplicação pela policy do `client_token` (`allTables` / `tables`). A escrita acumula para todos os acessos daquele `agentId`.
