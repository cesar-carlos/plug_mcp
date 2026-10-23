# Origem editorial dos casos de consulta — 2026-10-22

## Implementação

Casos preparados com sementes do dataset associado ao template agora guardam
`editorialOrigin`. A gravação pelo console fixa catálogo, fonte/versão/dialeto,
template/versão/hash e dataset/versão/hash, com hashes das sementes originais e
salvas. O servidor revalida as referências e recalcula se as sementes diferem;
não confia no status ou nos hashes alegados pelo cliente.

Omitir a origem na edição conserva a já registrada. Edição delegada de caso já
vinculado mantém essa referência sob autorização vigente, sem fornecer novas
linhas do dataset. Acrescentar origem exige sessão Client. A referência não
autoriza, aprova semântica ou produz relatório técnico. Casos antigos permanecem
sem origem presumida; nenhuma migration foi necessária. O conteúdo usa o JSON
de teste existente, separado da auditoria; a biblioteca continua cifrada.

O console mostra a referência ao reabrir o caso, inclusive após novo login,
distinguindo a última gravação das alterações em memória. O runner usa os casos
salvos; não busca implicitamente linhas na biblioteca.

## Verificações locais

| Verificação           | Resultado e alcance                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Unitários afetados    | 55/55 em cinco arquivos; inclui confirmação de referências, hashes falsos e sementes editadas |
| Integração PostgreSQL | 100/100 nos arquivos shared-knowledge e setup-delegation; autoridade remota sintética         |
| Chromium dirigido     | 1/1; carregar, preservar edição, salvar e reabrir origem após novo login                      |
| Chromium completo     | 56/56, PostgreSQL de controle/fixtures e hub sintético                                        |
| Frontend              | Lint, tipos, 86/86 testes e build                                                             |
| Servidor              | Lint, tipos e build                                                                           |
| Contrato              | training:check passou com leitura do checkout do hub                                          |

A primeira execução do frontend falhou por arquivos temporários ausentes do
executor antes de carregar seis suítes. A repetição em pasta temporária exclusiva
passou. A primeira execução de training:check foi impedida pelo acesso restrito
ao checkout irmão; a repetição com permissão de leitura passou, sem mudar a
referência do hub. Não houve falha de produto ocultada por retry de SQL.

Os testes PostgreSQL cobrem referência falsa, conservação da origem omitida,
recalculo de alteração e restauração das sementes, fonte alterada, catálogo
revogado e ausência de aprovação herdada. Delegação cobre recusa ao acrescentar
origem, edição de caso já vinculado e revogação remota. Não constitui uma nova
matriz específica de linhagem por OAuth nem validação de autoridade persistente.

## Candidata e cadeia persistente

Imagem local inicial `se7e-persona-v2-candidate:dataset-lineage-20261022`, ID
`sha256:2cdc041fe7c3dd07565a4c7c1535a242f57f977bb84ed54fa0fcf0555db37dd0`.
Não foi publicada.

- Inspeções: 3 passaram, 76 fora do filtro de 79. De 20:22:06 a 20:22:49 UTC,
  inventários antes/depois iguais e wrapper zero, com limpeza confirmada.
- Primeira rodada dos runners: os três testes passaram, mas **a rodada foi
  recusada** por mudança no snapshot do agente durante trabalho de outra tarefa.
  De 20:23:26 a 20:24:45 UTC, agente passou de
  `e22e33ec5be4c77bba43bc2eabccd83a610fa84e2cf4258cf727145fe74ad256` para
  `2aa9bb47437d790eef037294934190ef98e36e256f14fdc633090621195e13c3`.
  `testExitCode: 0`, `unchanged: false`, `result: failed`; wrapper não zero e
  limpeza confirmada. Não certifica um candidato estável.

Inventário da rodada de inspeções:

| Projeto | Commit-base                                | SHA-256 efetivo                                                    | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `6a12361cda901cc34521ea270c456ccdbc957b157f5f8cecad44bc49aab0b209` | 1094     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` | 1024     |
| Agente  | `3b4f099e64a319a100cd93e00667ffca4afef732` | `e22e33ec5be4c77bba43bc2eabccd83a610fa84e2cf4258cf727145fe74ad256` | 2674     |

São alterações locais, não commits novos. Inspeções observaram PostgreSQL
`17.0.11`, SQL Server `16.00.4236` e SQL Anywhere `16.00.0000`.
Drivers conferidos na fixture dos runners; inventário de arquivos, sem prova de
carregamento da DLL por chamada:

| Driver          | Versão                                    | SHA-256                                                            |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| podbc35w.dll    | 18.00.0000                                | `452afccffb9b7ffbdb736b8ba1cba9d7b1e11b09ffaee9cf85d6d3788cace991` |
| dbodbc16.dll    | 16.0.0.2043 (64-bit)                      | `571e105fb3e14e754b16863739d402022d0e1f64a10d0b224c4e6dd429d5e8be` |
| msodbcsql18.dll | 2018.0186.0001.01 ((DS_Main).170626-2112) | `b510668814e68df5018f6f3de0d203fd9b8628b1901d46ed3762ee263b87bbbb` |

## Pendências e limites

### Repetição com snapshot estável

Após coordenação autorizada pelo usuário e liberação do agente pela outra tarefa,
foi montada a imagem local
`se7e-persona-v2-candidate:dataset-lineage-final-20261022`, ID
`sha256:250ba1723618818aa0f1d2e513081d98a48e7a2393ac7d20e687911cf2de1952`.

De 20:29:06 a 20:30:37 UTC, **6 cenários passaram**, 73 fora do filtro de 79.
Filtro: `publicação SQL genérica com fixtures variadas e rollback|inspeciona metadados pela conexão`.
São três inspeções e três runners de publicação SQL, pela cadeia persistente
MCP → hub Prisma → agente → motor. Os casos registram a origem pela sessão
Client; o runner confere o conteúdo salvo e produz seu próprio relatório técnico.
Não é uma rodada integral dos 79 cenários nem homologação de toda linhagem OAuth.

`testExitCode: 0`, `unchanged: true`, `result: passed`; wrapper retornou zero e
confirmou remoção somente da fixture. Nenhum processo de outra tarefa foi encerrado.
Inventários antes/depois idênticos, com os mesmos commits-base da tabela anterior:

| Projeto | SHA-256 efetivo                                                    | Arquivos |
| ------- | ------------------------------------------------------------------ | -------- |
| MCP     | `dd1d38c75ada36da2c4ee51f817d927e892da69baf933a4d432e8862b0c52841` | 1094     |
| Hub     | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` | 1024     |
| Agente  | `ee7a3b62b92a38a999c29d93e52929a04a42707494b878af28e1038c873bd984` | 2674     |

As inspeções observaram as mesmas três versões de motores listadas acima;
os drivers da fixture final foram novamente conferidos, com os mesmos hashes.
Node `24.21.0` e TypeScript `7.0.2` passaram nos verificadores próprios.
Documentação e formatação passaram; o verificador de release recusou a publicação
como esperado. Os links e o encerramento documental desta evidência são
posteriores à imagem final e não a certificam retroativamente.

### Ainda fora do aceite

Não encerra seleção de outros datasets, datasets de operações/cruzamentos,
homologação instalada, avaliação da IA ou gates de liberação. HTTPS e ChatGPT
permanecem manuais. `ready: false` permanece obrigatório.
