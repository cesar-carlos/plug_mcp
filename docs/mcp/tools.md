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

| Tool                                                     | Função                                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `treinar_com_sql`                                        | Parse + policy + `sql.execute` (amostra) + merge no grafo. Proíbe `SELECT *`. JOIN se >1 tabela. Depois, cadastre a skill. |
| `explorar_tabelas`                                       | Catálogo de sistema do dialeto.                                                                                            |
| `mapear_tabela`                                          | Colunas no ERP → merge `inferido`.                                                                                         |
| `confirmar_coluna`                                       | Significado/dicionário (`confirmado_usuario`).                                                                             |
| `buscar_contexto`                                        | Busca skills/grafo/notas; na pergunta de dados priorize skills publicadas.                                                 |
| `resolver_conflito`                                      | Resolve fato em `conflito`.                                                                                                |
| `anotar_grafo` / `listar_anotacoes` / `remover_anotacao` | Notas incrementais.                                                                                                        |

## Skills

`criar_skill` → `atualizar_skill` → `validar_skill` (executa amostra) → `publicar_skill`. `listar_skills` / `obter_skill`.

A skill publicada é a bússola da IA. Sem ela, a resposta correta é admitir a lacuna e pedir o cadastro.

## Consulta

`consultar_dados`: execute o `sqlModelo` de uma skill publicada. Autorização = `client_token`. Respeite `max_rows`. Sem skill capaz (incluindo cruzamento), não invente SQL — oriente `treinar_com_sql` e `criar_skill`.
