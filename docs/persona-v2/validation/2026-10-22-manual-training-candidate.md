# Candidata para validação do treinamento — 2026-10-22

Rodada de desenvolvimento; não autoriza deploy, publicação de imagem ou aceite
dos gates. O roteiro manual fica no [onboarding](../onboarding.md#roteiro-de-teste-manual-do-treinamento).

## Candidato e verificações locais

Imagem construída localmente, sem push:
`se7e-persona-v2-candidate:manual-training-20261022`.
ID imutável:
`sha256:acdb37f0803d277643f92603a98556ee30ab49e04849017de689346d904ed089`.

A imagem contém a correção de submissão da inspeção, cuja
[reprodução e regressão](2026-10-22-inspection-submit.md) são independentes.
A correção subsequente desta rodada altera somente o observador de fixture do
agente e seu teste/documentação, sem mudança de SQL, policy, journal ou runtime
MCP empacotado. Não houve reconstrução de imagem entre as duas cadeias.

- Console completo: **54 cenários Chromium aprovados**, sem filtro, em 5,4
  minutos, usando PostgreSQL exclusivo e hub sintético. Não é prova de driver.
- Regressão geral: **1.579 testes aprovados, 91 omitidos**, em 132,21 segundos;
  171 arquivos aprovados e seis omitidos. As omissões são integrações opcionais
  legadas de PostgreSQL/Redis sem suas variáveis específicas, não aceite dessas
  integrações ou dos motores. Nenhuma omissão certifica a cadeia v2.
- `training:check`: aprovado contra o contrato/histórico fixados do hub.
- Ensaio de distribuição da imagem: aprovado com 42 migrations; recusas de
  produção/segredo/comando, legado/checksum, ausência de DDL automático, assets,
  servidor, quatro jobs do worker, backup/restauração e reinício. A composição
  descartável foi removida pelo controlador.

Logs locais auxiliares, ignorados pelo Git:
`node_modules/.cache/manual-training-{console-full,unit,base-final,image-build,image-smoke}.log`.

## Primeira cadeia: falha de evidência concorrente

Modo `Persistence prisma`, imagem candidata e fixtures novas PostgreSQL,
SQL Server e SQL Anywhere. **73 aprovações e seis falhas**, sem filtro, em
594,55 segundos. Não é rodada aprovada e não deve ser omitida da avaliação.

Cinco falhas ocorreram ao ler JSON inválido no ledger de metadados SQL Anywhere
do observador. A sexta, de recuperação dos journals, dependeu do percurso
interrompido e encontrou duas operações incertas preparadas em vez de três.
Não se atribui sucesso de recuperação ao cenário que não foi concluído.

O teste isolado do observador reproduziu a perda: **256 respostas concorrentes
deixaram somente dois registros** em arquivo temporário próprio. O observador
abria handles concorrentes de append no Windows. A gravação agora usa fila
serializada, aguardada antes da resposta; falha de escrita propaga e impede
registrar sucesso posterior. Nenhuma linha inválida é ignorada e nenhum SQL é
reenviado para recompor contagens.

Três testes passaram após a correção: integridade de todos os registros
concorrentes, propagação da falha do delegado e propagação da falha de arquivo.
O teste usa somente arquivos temporários, sem banco ou aplicativo operacional.

Log da falha preservado em `node_modules/.cache/manual-training-full-chain.log`;
regressão em `manual-observer-before.log` e `manual-observer-after.log`.
Os três inventários antes/depois ficaram iguais; o registrador conservou
`testExitCode: 1` e `result: failed`. A fixture foi removida pelo guard de posse.

## Segunda cadeia

**79 de 79 cenários aprovados, sem filtro**, em 681,59 segundos, início 14:50:57
(America/Cuiaba), com fixture nova e observador corrigido. Inclui Chromium de
criação/treinamento/publicação/consulta, cenários de cache, conhecimento, DML,
reinício composto e recuperação dos journals que falharam na rodada anterior.
O wrapper terminou com código zero e confirmou a remoção somente da fixture.

| Projeto | Commit-base                                | Inventário antes/depois SHA-256                                    | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `313afaee71212ada614f2b7e00c21ad5ae0dd0e12f3d4de1434e5fad42998edd` | 1089     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` | 1024     |
| Agente  | `3b4f099e64a319a100cd93e00667ffca4afef732` | `0ab35f7275a6bc9852715977fec131ad21d7c52b3f9650b38c77da41e53d775f` | 2670     |

Inventários incluem alterações locais, não são novos commits. Diferença MCP
entre as duas rodadas inclui atualização do roteiro/documentação; fontes da
imagem não foram alteradas. Evidências nesta pasta são excluídas do inventário
conforme o contrato do registrador. Log: `manual-training-full-chain-final.log`.
O registrador concluiu `unchanged: true`, `testExitCode: 0` e `result: passed`.

Versões observadas por `sql.describeSchema` na segunda rodada, preservadas no
log antes da limpeza:

| Motor        | Versão observada |
| ------------ | ---------------- |
| PostgreSQL   | `17.0.11`        |
| SQL Server   | `16.00.4236`     |
| SQL Anywhere | `16.00.0000`     |

Após a cadeia, foram corrigidos quatro avisos de estilo apenas no arquivo de
teste do observador (importação redundante, const e leitura de existência).
O observador executado na cadeia e os runtimes permaneceram iguais; os hashes
da tabela certificam a rodada anterior a essa edição de teste e às atualizações
documentais finais, não um novo snapshot integral.

Após esses ajustes de estilo, os três testes foram repetidos com aprovação e
`dart analyze` dos dois arquivos alterados terminou sem avisos. O patch dos
arquivos rastreados alterados passou em `git diff --check`.

`docs:check` terminou sem problemas. O verificador de release recusou publicação
conforme esperado; nenhum gate foi aceito por esta rodada.

## Drivers e limites

Arquivos dos drivers usados na configuração das duas fixtures, identificados
por versão de arquivo e SHA-256; isso não é um rastreamento de DLL carregada em
cada chamada. Versões de motor observadas por RPC são evidência separada.
Os três hashes foram reconferidos na segunda fixture e permaneceram iguais.

| Driver                       | Versão do arquivo                           | SHA-256                                                            |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| PostgreSQL `podbc35w.dll`    | `18.00.0000`                                | `452afccffb9b7ffbdb736b8ba1cba9d7b1e11b09ffaee9cf85d6d3788cace991` |
| SQL Anywhere `dbodbc16.dll`  | `16.0.0.2043 (64-bit)`                      | `571e105fb3e14e754b16863739d402022d0e1f64a10d0b224c4e6dd429d5e8be` |
| SQL Server `msodbcsql18.dll` | `2018.0186.0001.01 ((DS_Main).170626-2112)` | `b510668814e68df5018f6f3de0d203fd9b8628b1901d46ed3762ee263b87bbbb` |

Nenhuma base ou credencial do usuário foi utilizada. Permanecem pendentes o
ciclo elevado do agente instalado, condições operacionais ampliadas, HTTPS e
ChatGPT manuais, avaliação separada da IA e aceite dos treze gates. O manifesto
permanece `ready: false`. O plano completo não está concluído.
