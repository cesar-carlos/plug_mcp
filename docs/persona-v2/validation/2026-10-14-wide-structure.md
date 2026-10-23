# Estrutura ampla na cadeia persistente — 2026-10-14

Avanço da etapa 4 do [plano restante](../remaining-plan.md). Não conclui o plano
ou gates de release. Os três manifestos mantêm ready false, quatorze gates
obrigatórios e nenhum aceito.

## Entrega e correção

A fixture cria quinze tabelas e uma view concedida para compor dezesseis recursos
em quatro páginas. Uma segunda view não é concedida. Policy usa regras explícitas,
sem flags globais; somente `operation_fixture` aceita escrita. As tabelas antigas
e suas condições de teste foram preservadas. Setup confere a base privada antes
do DDL; reinícios recuperam cofre/configuração, sem recriar essas estruturas.

Cada motor inspeciona quatro páginas, recusa composição com lacuna e compõe IDs
invertidos conservando ordem/menor validade. Publica padrão e skill com JOINs
compostos entre páginas e consulta uma linha sintética com origem/completude.
O observer comprova a recepção de `expectedStructure` com dezesseis recursos,
registrando só contagens/estados, sem SQL, parâmetros ou resultados.

Duas ações fixas do companion, sem SQL/identificadores externos, conferem a base
antes de alterar apenas `wide_07`. Coluna fora do treinamento preserva a consulta;
alteração do tipo de uma coluna treinada gera SOURCE_STRUCTURE_MISMATCH no agente.
O MCP descarta dados, suspende a publicação utilizada e retorna STALE_AUTHORIZATION.
A skill independente continua consultando na mesma fonte.

A primeira rodada encontrou uma falha real: SQL Anywhere usava o discriminador
de materialized view como se fosse view regular. A consulta fixa agora distingue
BASE/VIEW por `SYSTAB.table_type_str`, sem aceitar materialized views implicitamente.
A [referência SAP](https://help.sap.com/docs/SAP_SQL_Anywhere/93079d4ba8e44920ae63ffb4def91f5b/3beaaafb6c5f1014a708bc9a46535407.html)
documenta os valores legíveis. A correção foi executada no SQL Anywhere 16 real;
enforcement continua desconhecido e não habilita constraints.

Foram ajustadas expectativas novas: aliases explicitamente entre aspas preservam
nomes no Firebird; drift verifica o envelope seguro MCP e o motivo nativo no observer.
O teste de identidade usa tabela concedida com coluna inexistente, demonstrando
recusa pela identidade antes do SQL sem esbarrar primeiro na policy restrita.
Não houve afrouxamento de autorização ou fallback de metadados.

## Resultados e ambiente

| Verificação                                         | Resultado                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Primeira cadeia, fixture `23562eb034af`             | 26 passaram e oito falharam; diagnóstico preservado, não aceito                   |
| Cadeia corrigida, fixture `8782bbbf514b`            | 34/34, nenhum skip, 178,93 segundos                                               |
| Agente, validação estrutural/identidade dirigida    | 14/14; análise estática dos arquivos alterados sem problemas                      |
| MCP                                                 | Lint, tipos com TypeScript 7 e build passaram                                     |
| Contrato hub                                        | Preflight fixado passou antes dos processos/migrations; sem alteração do contrato |
| Documentação/formatação e integridade do inventário | Verificadas nesta rodada                                                          |

Node 24.21.0, TypeScript 7.0.2 real. Hub PostgreSQL/Prisma com autenticação e
ClientAgentAccess reais; MCP em processo separado e PostgreSQL de controle;
agente companion com Drift, cofre Windows DPAPI, Socket.IO, ODBC e journal reais.
Nenhuma conexão MCP direta às bases de negócio. Credenciais/bancos/DSN/cofre
pertencem exclusivamente às fixtures em loopback.

Motores identificados por suas provas: PostgreSQL 17.0.11, SQL Server 16.00.4236,
SQL Anywhere 16.00.0000 e Firebird 06.03.1812 WI-V Firebird 5.0. São strings de
versão reportadas, não prova independente de todos os patches. Drivers: psqlODBC
18.00.0000, SQL Server ODBC 18 (2018.0186.0001.01), SQL Anywhere 16.0.0.2043
64-bit, Firebird ODBC WI_T2.0.5.156 e fbclient WI-V5.0.4.1812. Hashes no inventário.

Cada motor registrou duas consultas bem-sucedidas com dezesseis recursos e uma
recusa nativa de drift. A suíte restante passou em consultas, cruzamentos,
treinamento/templates/datasets, operações, aprovação, confirmação perdida,
journals, reinícios e revogação, dentro dos limites da fixture já documentados.

## Revisão efetiva e limites

O [inventário](2026-10-14-wide-structure-files.json) fixa fontes, testes, contratos,
locks, drivers e manifestos relacionados dos três projetos. MCP base
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`; hub base
`bfb40becd42c5452b19b0df13698d212a0238ddc`. O agente recebeu externamente o commit
`1057b11384d2b8ecfd6c1c5d79d03d029afc270f` durante a preparação; a rodada final
usou esse HEAD com a correção local do catálogo SQL Anywhere. HEAD não substitui
os hashes dos arquivos efetivamente usados. Durante o fechamento, o commit externo
`37e36d86f1cf9e65438d4f60c48fa8ce6dc1e405` incorporou a mesma correção e documentação.
O diff foi conferido: somente aquela linha do catálogo mudou entre esses commits
no código de produto, com os mesmos bytes testados. O inventário registra esse
HEAD final; nenhum commit/push foi feito por esta tarefa.

Não houve alteração de migration aplicada, contrato RPC/OpenAPI, entrada principal,
publicação de imagem ou deploy. Ambas as fixtures foram removidas especificamente,
incluindo seus bancos, volumes, arquivos e DSN; recursos preexistentes preservados.

Ainda faltam a matriz integral de constraints/perfis, mínimos privilégios nativos,
relações reversas/N:N, drift/revogação concorrentes e adoção compartilhada em DML.
As relações 1:1 e o grão desta fixture são declarações sintéticas revisadas, sem
inferir enforcement SQL Anywhere. Contas DBA de fixture não comprovam mínimos
privilégios no motor; policy restrita é evidência diferente.
Companion/reinício não certificam instalador desktop, concorrência do cofre,
TLS/Redis distribuídos, quedas reais durante commit, plugin ou avaliação da IA.
Relatórios anteriores e a regressão local da biblioteca continuam históricos.
O aceite exige evidência do candidato integral, não apenas estes 34 casos.
