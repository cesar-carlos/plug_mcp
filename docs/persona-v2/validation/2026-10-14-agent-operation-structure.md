# Fundação estrutural dos lançamentos no agente — 2026-10-14

Avanço das etapas 4/8 do [plano restante](../remaining-plan.md). Não conclui
adoção compartilhada em DML, cadeia persistente ou gates de release.

## Entrega

Agente decodifica `expectedStructure` opcional somente em execução, exige
`expectedSource` e inclui o conteúdo no hash local durável. O handler exige
`sqlOperations.structureGuard:1` negociado pelos dois pares, sourceSchema e
sourceIdentity v1; constraints também exigem sourceConstraints v1. Ausência
ou versão incompatível recusa antes de claim/conexão. Pares antigos não recebem
a nova capacidade implicitamente; operações sem expectativa mantêm seu contrato.

Autorizador revalida leitura dos recursos estruturais, além de escrita. A factory
ODBC usa uma conexão: identidade, consultas fixas de tabelas/colunas/constraints
utilizadas, identidade novamente e só então início da transação. Prova não abre
outra conexão, não executa DDL e não repete SQL. Cada consulta fixa e contagem
auxiliar do driver entra no teto de 32 comandos; excesso é recusado antes do SQL
de identidade/negócio. Drift preserva SOURCE_STRUCTURE_MISMATCH internamente,
com recusa pré-transação e intenção terminal que não reexecuta em duplicata.

Interfaces, schema JSON/OpenRPC, testes, decorators de falha e companion de
casos foram atualizados juntos. Não alteradas migrations aplicadas ou bases
operacionais. Sem mudança no contrato fixado do hub nesta rodada.

## Evidências

| Verificação                                                                   | Resultado                                                                                                                    |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Agente: operações, autorização, negociação, executor e contratos documentados | 163 testes passaram                                                                                                          |
| Análise estática dos arquivos alterados                                       | Sem problemas                                                                                                                |
| Matriz ODBC obrigatória                                                       | 83/83, nenhum skip: PostgreSQL 19, MSSQL 19, SQL Anywhere 19, Firebird 26                                                    |
| Novos casos nativos                                                           | Prova de colunas/identidade antes de INSERT; expectativa divergente sem DML, inclusive chamada duplicada, nos quatro motores |

Fixture `se7e_persona_4a01bbf89cba_test`, credenciais/DSNs/arquivos e bancos
exclusivos de teste em loopback. Runner do agente usa ODBC, transação, SQLite/Drift
durável e executor reais; a autoridade desta matriz é sintética. Não é transporte
MCP → hub → agente. O MCP apenas compila material sintético para os casos legados
do runner; não conecta a bases cadastradas pelo usuário.

Versões reportadas pelos motores: PostgreSQL 17.11, SQL Server 16.0.4236.2,
SQL Anywhere 16.0.0.2043, Firebird 5.0.4. ODBC reportado: 18.00.0000, 18.06.0001,
16.00.2043 e 02.00.0156, respectivamente. Hashes dos drivers e arquivos efetivos
no [inventário](2026-10-14-agent-operation-structure-files.json); não confundir
versão do arquivo DLL com versão reportada por ODBC.

Descoberta DTD encontrou o daemon do IDE, sem aplicativos conectados. Tentativa
de hot reload retornou ausência de app; não foi iniciado/recarregado agente
operacional. Testes Flutter e a matriz nativa compilaram e executaram os arquivos
novos. Isso não comprova runtime/instalador desktop ou hot reload concluído.

A fixture foi removida especificamente após capturar as evidências, com bancos,
volumes, DSN, processos e arquivos próprios. Recursos preexistentes foram
preservados. O inventário registra os checkouts efetivos no fechamento, incluindo
outras alterações locais; isso não certifica essas outras jornadas. Os commits
base e hashes dos arquivos são referências distintas, sem commit desta tarefa.

## Limites e continuação

Ainda faltam transporte/negociação/OpenAPI/snapshot coordenados no hub e a adoção
em publicações/preparações no MCP, com recursos DML qualificados, outputs,
verificações auxiliares e revalidação de versões compartilhadas. Comprovante
durável ainda precisa registrar motivo seguro de recusa, para que o MCP suspenda
dependências estruturais exatas sem inferir o motivo de um estado cancelado.

Casos nativos novos comprovam colunas; não encerram a matriz de PK/UNIQUE/FK,
metadata timeout, revogação concorrente, mudança administrativa simultânea ou
mínimos privilégios no motor. SQL Anywhere continua com enforcement desconhecido.
As contas de fixture não comprovam mínimos privilégios. O fixture autoriza DDL
somente no operador de teste, sem expor essa capacidade ao produto.

MCP/hub/agente mantêm ready false e nenhum dos quatorze gates aceito. Nenhuma
branch, commit, push, imagem ou deploy foi criado por esta tarefa. Evidências
anteriores não certificam automaticamente estes arquivos ou a integração futura.
