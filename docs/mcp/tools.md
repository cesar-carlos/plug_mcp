# Tools MCP

Sem formulário do SDK e sem catálogo pronto. Token MCP **nunca** aparece no JSON da tool.

Consulta ao ERP na sessão do usuário: **só** com `sqlModelo` de skill publicada. Sem skill capaz (incluindo cruzamento), não inventar SQL.

## Cofre

| Tool                        | Auth    | Função                                               |
| --------------------------- | ------- | ---------------------------------------------------- |
| `registrar_acesso`          | nenhuma | Cria usuário+acesso. Devolve `setupCode`/`setupUrl`. |
| `adicionar_acesso`          | Bearer  | Novo `agentId`/`client_token` sem senha.             |
| `listar_acessos`            | Bearer  | Lista (token mascarado).                             |
| `verificar_acesso`          | Bearer  | Status no hub. Sem polling agressivo.                |
| `remover_acesso`            | Bearer  | Apaga o acesso; o grafo do `agentId` permanece.      |
| `atualizar_credencial_plug` | Bearer  | Nova senha/e-mail do Client.                         |
| `rotacionar_token_mcp`      | Bearer  | Novo `setupCode`; invalida o hash antigo.            |

## Treino e schema

| Tool                                                     | Função                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `treinar_com_sql`                                        | Parse + policy + `sql.execute` (amostra) + merge no grafo (colunas do `ON` com igualdade). Proíbe `SELECT *`. JOIN se >1 tabela; `ON` precisa de `alias.coluna = alias.coluna`. CROSS JOIN não grava relacionamento. Colunas do SELECT precisam de qualificador. `params` opcionais. Origem: `validado_execucao`. Devolve `fluxoTreino` da skill em andamento se o SQL casar. |
| `explorar_tabelas`                                       | Catálogo de sistema do dialeto.                                                                                                                                                                                                                                                                                                                                               |
| `mapear_tabela`                                          | Colunas no ERP → merge `inferido`.                                                                                                                                                                                                                                                                                                                                            |
| `confirmar_coluna`                                       | Significado/dicionário (`confirmado_usuario`).                                                                                                                                                                                                                                                                                                                                |
| `buscar_contexto`                                        | Busca skills/grafo/notas por termos; na pergunta de dados priorize skills publicadas.                                                                                                                                                                                                                                                                                         |
| `resolver_conflito`                                      | Resolve fato em `conflito`.                                                                                                                                                                                                                                                                                                                                                   |
| `anotar_grafo` / `listar_anotacoes` / `remover_anotacao` | Notas incrementais.                                                                                                                                                                                                                                                                                                                                                           |

## Skills

`buscar_contexto` devolve `consultaPermitida`. Se for `false`, vem `gap.code = SKILL_GAP`: **não** chame `consultar_dados`. Se houver rascunho/validada, o `gap.hint` pede para **continuar** o `fluxoTreino.proximoPasso` da skill mais relevante da query (não o primeiro rascunho inserido). Sem skill em andamento, oriente `treinar_com_sql` → `criar_skill` → descrever params (com `tipo`) → `validar_skill` → `publicar_skill` com `confirmadoPeloUsuario: true`. O grafo em `grafoParaTreino` é material de treino, não licença de SQL. Rascunhos/validadas vêm em `skillsParaTreino`. A busca casa também `sqlModelo`, nomes/descrições/`tipo` de `params`.

Cada tool de treino/skill devolve `fluxoTreino`: `passoAtual`, `proximoPasso`, `podeLiberar` e passos (`feito` | `pendente` | `bloqueado`) com `hint`.

| Tool              | Função                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `criar_skill`     | Nomeia um SQL já treinado. **Trava** se as tabelas do `sqlModelo` não estão no grafo. `params[{ nome, descricao, obrigatorio?, tipo? }]` descrevem placeholders (`tipo`: string/number/date/boolean; default string). |
| `atualizar_skill` | Atualiza nome/descrição/SQL/`params`. Se o SQL mudar, as tabelas precisam estar no grafo e o status volta a rascunho. Patch só de nome/descrição/params **mantém** o status.                                          |
| `validar_skill`   | Envelope vazio (sem ler dado). **Recusa** params sem `descricao`. Ausentes → `null`. Marca como validada.                                                                                                             |
| `publicar_skill`  | **Libera** só com checklist completo **e** `confirmadoPeloUsuario: true`. Mostre o resumo no chat antes. Tool `skill_{slug}`.                                                                                         |
| `listar_skills`   | Lista skills do `agentId` do acesso.                                                                                                                                                                                  |
| `obter_skill`     | Obtém por `skillId` ou `slug`; inclui `params` e `fluxoTreino`.                                                                                                                                                       |

Cada skill publicada também vira tool `skill_{slug}` (e `skill_{slug}_{prefixoAgentId}` se houver colisão de slug entre agentIds do mesmo usuário). Resources `skill://{agentId}/{slug}`. Prompts `pre_treino` (persona de sessão, sem args; também no bootstrap), `consultar_com_skill` e `cadastrar_skill`.

## Consulta

`consultar_dados`: **só** `acessoId` + `skillId` + `params` nomeados. **Não** aceita `sql`. Executa o `sqlModelo` persistido da skill **publicada** (re-parse SELECT, bind `:nome`/`@nome`, coerção/recusa pelo `tipo` do contrato). Autorização = `client_token`. Options: `max_rows`, `page`, `page_size`, `timeout_ms`. Sem skill capaz (incluindo cruzamento), não invente SQL.

Resposta tabular: `columns`, `rows`, `rowCount`, `truncated`, `maxRowsApplied` em JSON e em `structuredContent`. Células string são truncadas. SQL não é ecoado no sucesso.
