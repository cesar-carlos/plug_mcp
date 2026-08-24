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

| Tool                                                     | Função                                                                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `treinar_com_sql`                                        | Parse + policy + `sql.execute` (amostra) + merge no grafo. Proíbe `SELECT *`. JOIN se >1 tabela. `params` opcionais para placeholders. Origem do fato: `validado_execucao`. Depois, cadastre a skill. |
| `explorar_tabelas`                                       | Catálogo de sistema do dialeto.                                                                                                                                                                       |
| `mapear_tabela`                                          | Colunas no ERP → merge `inferido`.                                                                                                                                                                    |
| `confirmar_coluna`                                       | Significado/dicionário (`confirmado_usuario`).                                                                                                                                                        |
| `buscar_contexto`                                        | Busca skills/grafo/notas por termos; na pergunta de dados priorize skills publicadas.                                                                                                                 |
| `resolver_conflito`                                      | Resolve fato em `conflito`.                                                                                                                                                                           |
| `anotar_grafo` / `listar_anotacoes` / `remover_anotacao` | Notas incrementais.                                                                                                                                                                                   |

## Skills

`buscar_contexto` devolve `consultaPermitida`. Se for `false`, vem `gap.code = SKILL_GAP`: **não** chame `consultar_dados`. Oriente `treinar_com_sql` → `criar_skill` → `validar_skill` → `publicar_skill`. O grafo em `grafoParaTreino` é material de treino, não licença de SQL. Rascunhos/validadas vêm em `skillsParaTreino`.

| Tool              | Função                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `criar_skill`     | Nomeia um SQL de negócio já treinado (`sqlModelo` com placeholders `:nome`/`@nome`).             |
| `atualizar_skill` | Atualiza nome/descrição/SQL e volta para rascunho; dispara `tools/list_changed` se já publicada. |
| `validar_skill`   | Envelope vazio (sem ler dado); `params` opcionais (ausentes → `null`). Marca como validada.      |
| `publicar_skill`  | Publica skill validada; registra tool dinâmica `skill_{slug}`.                                   |
| `listar_skills`   | Lista skills do `agentId` do acesso.                                                             |
| `obter_skill`     | Obtém por `skillId` ou `slug`.                                                                   |

Cada skill publicada também vira tool `skill_{slug}` (e `skill_{slug}_{prefixoAgentId}` se houver colisão de slug entre agentIds do mesmo usuário). Resources `skill://{agentId}/{slug}`. Prompts `consultar_com_skill` e `cadastrar_skill`.

## Consulta

`consultar_dados`: **só** `acessoId` + `skillId` + `params` nomeados. **Não** aceita `sql`. Executa o `sqlModelo` persistido da skill **publicada** (re-parse SELECT, bind `:nome`/`@nome`). Autorização = `client_token`. Options: `max_rows`, `page`, `page_size`, `timeout_ms`. Sem skill capaz (incluindo cruzamento), não invente SQL.

Resposta tabular: `columns`, `rows`, `rowCount`, `truncated`, `maxRowsApplied` em JSON e em `structuredContent`. Células string são truncadas. SQL não é ecoado no sucesso.
