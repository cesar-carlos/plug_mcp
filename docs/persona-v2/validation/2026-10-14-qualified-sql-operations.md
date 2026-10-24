# Recursos qualificados nas operações SQL — 2026-10-14

Avanço das etapas 4/5/8 do [plano restante](../remaining-plan.md). Complementa
o [motivo durável](2026-10-14-durable-operation-reasons.md), sem habilitar adoção
compartilhada em DML ou concluir qualquer gate.

## Comportamento

Treinamento de operação aceita nome canônico simples ou `schema.tabela` nos
motores com namespace. Citação separada em DML, leitura auxiliar e conciliação:
`"public"."operation_fixture"`, `[dbo].[operation_fixture]` e
`[dba].[operation_fixture]`. Firebird permanece sem schema (`"OPERATION_FIXTURE"`),
sem inventar owner, remover qualificação inválida ou mudar semântica nativa.

Capacidades, recortes, outputs e SQL adaptável preservam o nome exato. Misturar
referência simples/qualificada homônimas em tabelas ou recortes é recusado, para
não omitir condição. Contrato fechado e limites estão no [guia](../sql-operations.md#nomes-físicos-das-tabelas).

MCP extrai somente o alvo canônico do compilador e confere policy exata. Agente
aplica correspondência exata somente em `sql.operation.execute`, sem ler/gravar
o cache legado. Outros métodos e semântica das flags globais ficam preservados.
Testes demonstram que uma autorização legada por basename não autoriza o caminho
transacional e que este não sobrescreve a decisão legada. Novos recursos exigem
publicação/concessões explícitas; snapshots e tokens não são convertidos.

Base v2 versionada: `persona-v2-qualified-operation-resources-1`. Contrato do hub
permanece 1.15.0: SQL já era string tipada no transporte, sem campo novo ou mudança
do roteamento. Não houve nova migration ou modificação de migration aplicada.

## Evidências da rodada

| Verificação                                                      | Resultado                                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Cadeia persistente MCP → hub → agente                            | 42 aprovados, 203,64 segundos                                                                 |
| PostgreSQL v2                                                    | 194 aprovados; após versionar o guia, arquivo de contexto/publicação revalidado: 19 aprovados |
| Agente: policy, autorização, guard, executor e ODBC direcionados | 134 aprovados                                                                                 |
| Agente: análise estática                                         | Sem problemas                                                                                 |
| MCP: unidade de nomes físicos e recortes                         | 19 aprovados                                                                                  |
| MCP: regressão completa inicial                                  | 1.306 aprovados, 91 opcionais não executados                                                  |
| MCP: tipos/build/lint e formatação afetada                       | Aprovados                                                                                     |

Regressão completa final: **1.307 aprovados**, 91 opcionais não executados,
75,54 segundos. Inclui o teste adicional de recorte, executado depois da
regressão inicial; guia/contexto foram revalidados depois da atualização da
base. Contagens ou opcionais não executados não encerram gates. Node 24.21.0 e
TypeScript 7.0.2 foram confirmados.

Inventário do candidato, publicações, journals e hashes dos drivers:
[JSON](2026-10-14-qualified-sql-operations-files.json).

## Alcance nativo e limpeza

Fixture dedicada `se7e_persona_7fe98bf39253_test`, com hub Prisma, Client/approval,
processos independentes, Drift/DPAPI/ODBC/journals reais. Os quatro snapshots de
operações publicados conservam nomes e versão do treinamento; os três comandos
INSERT/UPDATE/DELETE usam o mesmo recurso físico. Casos do companion permanecem
limitados à tabela descartável fixa, sem se tornarem runners genéricos.

Rodada cobre IDs/saídas nativas, helper SQL Anywhere, limite com rollback,
aprovação/preparação, confirmação perdida, duplicatas e consulta após reinício.
O carrier estrutural continua sendo fixture de operador; não comprova composição
compartilhada por publicação/preparação. Enforcement SQL Anywhere continua desconhecido.

Versões observadas: PostgreSQL `17.0.11`, SQL Server `16.00.4236`, SQL Anywhere
`16.00.0000`, Firebird `06.03.1812 WI-V Firebird 5.0`. Fixture e recursos exclusivos
foram removidos após capturar evidências, sem fontes/cofres/DSNs operacionais.

Após essa rodada, constatou-se alteração concorrente no arquivo de descoberta
ODBC do agente: prazo assíncrono esgotado permanece irrevogavelmente vencido.
A mudança foi preservada, com **16 testes** de descoberta/consulta verificada
revalidados. A primeira rodada não certifica isoladamente esse novo estado.
Nova fixture `se7e_persona_873d6068bfa8_test` passou em **42 testes, 199,09 segundos**,
com checkpoint SHA-256 de **2.292 arquivos de execução** inalterados antes/depois
da rodada. Esta é a evidência nativa final do estado atual. Foi removida após
captura, inclusive processos, containers/volumes, DSN e diretório exclusivos.
Os hashes, snapshots e metadados de ambas as rodadas ficam no inventário.

Não houve novo ensaio de homônimos físicos em dois schemas da mesma instalação,
collations sensíveis a caixa, Unicode ou toda gramática nativa; esses critérios
continuam pendentes. Recusa de homônimo/alteração de alvo foi testada no validador
e na policy. Não houve navegador, desktop instalado, plugin real ou avaliação IA.
Hot reload foi tentado sem app ativo; nenhum app operacional foi iniciado.

O analyzer inicialmente apontou avisos de const no teste novo, corrigidos antes
da análise final. O compilador TypeScript exigiu estreitar explicitamente a
referência regex nula; corrigido antes dos testes nativos. Nada foi contornado
por relaxamento de tipos, policy, guard, fixture ou versão.

Deploy/imagens continuam bloqueados, sem gates aceitos, branch, commit ou push.
