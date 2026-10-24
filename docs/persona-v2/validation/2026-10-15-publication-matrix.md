# Matriz dos runners: tipos, constraints e triggers — 2026-10-15

Evidência parcial de desenvolvimento. `ready: false`, treze gates requeridos e
nenhum encerrado. Não autoriza deploy, publicação de imagens ou corte.

## Entrega e alcance

Declarações privadas de fixture agora aceitam FK composta e `insertAudit`.
FK conserva pares ordenados e exige PK/UNIQUE anterior compatível. O trigger
fechado copia uma inserção para tabela separada com colunas idênticas, sem cadeia
de triggers, SQL livre ou destino externo. Provisionamento continua exclusivo
do companion em banco descartável; execução dos casos usa MCP → hub → agente.
Limpeza recria tabelas em ordem de dependência e restabelece FKs/triggers.

Casos declarativos atuais por motor:

| Família               | Prova exigida                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Consulta tipada       | BIGINT positivo/negativo além de 53 bits, DECIMAL(28,8), data bissexta, booleanos, UUID, Unicode, vazio e null |
| DML tipado            | Inserção exata desses tipos e conferência de todas as tabelas                                                  |
| PK e UNIQUE           | Caso positivo e duplicatas recusadas com sementes preservadas                                                  |
| NOT NULL              | Parâmetro nulo permitido pelo contrato do teste e recusado pela coluna física                                  |
| FK composta           | Pai correto, pai de outro tenant e PK duplicada na filha                                                       |
| Trigger               | Efeito indireto confirmado, erro no destino com rollback da origem                                             |
| Rollback após trigger | Primeiro comando e cópia indireta desfeitos quando o segundo comando viola constraint                          |

`NATIVE_FAILURE` só passa com receipt `rollback_confirmado`, categoria
`SQL_OPERATION_NATIVE_FAILED` e igualdade de todas as sementes. Não aceita
timeout, transporte, limite de linhas ou resultado desconhecido. Não determina
qual constraint falhou pela mensagem do driver. O caso positivo usa o mesmo SQL
do negativo; a causa exercitada é conhecida pela fixture. A contagem direta
permanece separada das linhas geradas pelo trigger.

Inteiros/decimais de conferência são projetados como texto. O comparador decimal
normaliza somente gramática decimal exata, incluindo `.5` e `-.00000001`;
números JS fracionários/inexatos, expoentes, NaN e separador por vírgula são
recusados. Orientação do runtime, contrato, rules e changelog foram sincronizados.
Não houve migration nem alteração do contrato público do hub/agente nesta tarefa.

## Rodadas

- Primeira: fixture `se7e_persona_f8656ba93451_test`, **38/43**, **262,30 s**.
  O novo modelo de consulta não tinha recorte; compilador recusou corretamente.
  Corrigido o caso sem alterar a proteção. Cruzamentos ficaram impedidos pelas
  dependências anteriores.
- Segunda: fixture `se7e_persona_eb54678f1d60_test`, **38/43**, **360,09 s**.
  O agrupamento de casos excedeu 60 segundos em PostgreSQL/MSSQL e a consulta
  SQL Anywhere teve falha nativa. Famílias foram separadas em testes próprios,
  mantendo limites de SQL e o timeout por teste. Identificadores passaram a ser
  citados explicitamente. Não houve reenvio de operação incerta.
- Terceira: fixture `se7e_persona_374409e07fef_test`, **54/55**, **479,02 s**.
  Constraints, triggers, DML tipado e cruzamentos passaram nos três motores.
  Consulta tipada passou em PostgreSQL/MSSQL; o comparador recusou um valor
  SQL Anywhere. Acrescentada normalização decimal textual sem inteiro, mantendo
  comparação exata. O [inventário dessa rodada](2026-10-15-publication-matrix-third-files.json)
  registra o candidato anterior à correção e a outras mudanças posteriores.
- Final: fixture nova `se7e_persona_eaeda1ad0340_test`, **55/55**, **395,73 s**.
  Os doze relatórios da matriz foram aprovados: quatro famílias em cada motor,
  com trinta casos obrigatórios novos. Consulta SQL Anywhere confirmou a
  normalização exata do decimal textual sem zero inteiro. PostgreSQL `17.0.11`,
  SQL Server `16.00.4236` e SQL Anywhere `16.00.0000`, observados pela inspeção
  do agente. Os cenários anteriores de autorização, operações, cruzamento,
  identidade, cofre/journal e reinício também passaram.

**459 unitários v2** e **195 integrações PostgreSQL** passaram no candidato final. Tipos,
lint/build e análise do companion foram verificados durante a tarefa. Node
24.21.0 e TypeScript 7.0.2 preservados.

O [inventário final](2026-10-15-publication-matrix-files.json) registra hashes,
commits-base e drivers após a execução. Inclui a otimização estrutural e os
arquivos finais de polling/emissão do agente desenvolvidos em outro chat;
nenhuma alteração concorrente desses arquivos ocorreu durante a rodada final.
Inventário parcial de checkout sujo, sem hash anterior à rodada; não é snapshot
integral de release. Todas as quatro fixtures desta tarefa foram removidas pelos
scripts de ownership. Nenhuma fonte cadastrada pelo usuário recebeu escrita.
Não houve nova execução de UI, plugin real, instalador ou avaliação da IA.

## Limitações e continuidade

Matriz representativa dos seis tipos lógicos disponíveis, não de todas as
extensões nativas. CHECK, cascatas, triggers de UPDATE/DELETE ou INSTEAD OF,
cadeias/recursão, collations alternativas e todos os modos de isolamento
continuam fora desta evidência. Variantes de SQL Anywhere além da versão 16
não são homologadas aqui. O trigger usa DDL fixo por motor, conforme a
[referência SAP](https://help.sap.com/docs/SAP_SQL_Anywhere/e38b2f6217f24bdb90a3ff8ae57b1dd5/818f8b2c6ce21014be6dfa4b15caab5e.html).

Os casos são privados, com classificação livre e fontes pretendidas iguais às
fixtures. Não certificam adoção estrutural compartilhada genérica, interface
completa de casos/relatórios, instalador, imagens, plugin real ou IA consumidora.
Comparação técnica não aprova significado de negócio nem concede autoridade.
Produção depende de todos os gates e evidências do candidato exato.

Referências: [contrato](../homologation-chain.md),
[plano restante](../remaining-plan.md), [aceite](../acceptance.md).
