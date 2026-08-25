# Modelo de dados

Não há tabela de senha de conta MCP, cliente de Authorization Server nem catálogo pronto.

## Cofre

- `usuario_mcp`: `email_enc`, `email_hash`, `senha_enc`, `token_hash` (SHA-256 do token MCP), `token_expires_at` (opcional; TTL `MCP_TOKEN_TTL_DAYS`). Unique em `email_hash` e `token_hash`.
- `acesso`: `usuario_id`, `agent_id`, `dialeto`, `nome_amigavel`, `client_token_enc`, `client_token_hash`, `status_acesso`, `escopo_padrao` (JSON empresa/filial), `timezone`. Unique `(usuario_id, agent_id, client_token_hash)`.

## Grafo (`agent_id`, compartilhado)

- `grafo_dialeto`: um dialeto por agente (primeiro escritor; `atualizar_dialeto` regrava).
- `grafo_lock`: lock de merge (`SELECT … FOR UPDATE`).
- `coluna_grafo`: além de tipo/descrição/dicionário, `papel` (`chave|dimensao|medida|codigo|data`), `formato` (`date`/`number`), `perfil` (JSON: min/max, nulos, distintos, `candidatosDicionario`). Preenchido no treino/`validar_skill` `enriquecer=completo` (catálogo + MIN/MAX).
- `relacionamento_grafo`: `tabela_origem_id`, `coluna_origem`, `tabela_destino_id`, `coluna_destino`, `tipo_join`, `cardinalidade` (`1:1|1:N|N:1|N:N`). O treino grava as colunas reais do `ON`; `completo` afere cardinalidade com COUNT vs COUNT DISTINCT. JOIN sem igualdade é recusado; CROSS JOIN **não** grava relacionamento.
- Precedência: `validado_execucao` > `confirmado_usuario` > `inferido`. Empate de texto → `conflito`. Execução bem-sucedida de `consultar_dados` promove fatos usados a `validado_execucao`.

## Skills e notas

- `skill`: `slug` unique por `agent_id`, `sql_modelo` (consulta **exemplo**), `escopo` JSON (tabelas, colunas por tabela, relacionamentos, **grão** = GROUP BY ou colunas físicas do SELECT), `params`, `versao`, `status` (`rascunho` | `validada` | `publicada`). Skill **publicada** é o escopo da consulta; a IA escreve SQL dentro desse pacote. Escopo vazio (skills pré-0011) é persistido na primeira leitura (`obter_skill` / `consultar_dados`) ou com `npm run db:backfill-escopo`.
- `anotacao_grafo`: nota/glossário/regra/métrica; `tabela_id` opcional; `tipo` inclui `regra` e `metrica`.

## Aprendizado (migration `0012`)

- `consulta_aprendida`: SQL que funcionou (gravado automaticamente em `consultar_dados`), pergunta, contrato de params, contagem de execuções. `obter_skill.pacote.consultasExemplo` devolve as mais usadas da skill, recortadas pela policy. `buscar_contexto` pede para reutilizar `consultasAprendidas`.
- `sinonimo`: termo → skill/alvo; `buscar_contexto` expande a query.
- `lacuna_consulta`: pergunta que caiu em `SKILL_GAP` (fila de treino).

## Auditoria

- `audit_log`: tool, SQL enviado, sucesso, código, linhas, duração. Sem segredos. `listar_auditoria` lê por usuário/acesso.

Leitura do grafo é recortada em aplicação pela policy do `client_token` (`allTables` / `tables`). A escrita acumula para todos os acessos daquele `agentId`.
