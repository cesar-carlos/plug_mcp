# Treinamento: gates locais e cadeia completa — 2026-10-22

Rodada de homologação local, sem deploy, push de imagem ou aceite de gates.
O [roteiro manual](../onboarding.md#roteiro-manual-de-treinamento-no-candidato-isolado)
continua exigindo ambiente e fontes próprios, revisão humana e concessões explícitas.

## Candidata e escopo

Imagem usada: `se7e-persona-v2-candidate:dataset-choice-20261022`, ID
`sha256:1f856f5fc85d49b6396cb29ec2eaad517e0fd4d84402a0dd88f6a0d57371491d`.
Inclui seleção de datasets e migration 0043. Não houve alteração de runtime
nesta rodada; as mudanças versionadas desta tarefa são documentais.

O inventário da árvore contém registros documentais posteriores à construção
da imagem. A rodada identifica imagem e snapshots separadamente; não afirma
identidade byte a byte entre toda a árvore e o filesystem da imagem.

## Gates locais completos

`npm run release:check` retornou zero com Node **24.21.0** e TypeScript **7.0.2**.
Passaram documentação, contrato/histórico do hub, lint, formatação integral,
tipos, testes, build e frontend. A suíte geral registrou **1.588 aprovações e 91
omissões condicionais**, em 116,11 segundos; frontend, **86/86**. O resultado
inicial não certificava os testes omitidos.

As condições foram conferidas nos testes: dependem de PostgreSQL/Redis, com
schema legado para as integrações da entrada principal. Foi criada fixture
separada da persona-v2, em loopback, com nome e rótulo únicos, senha aleatória
somente no ambiente do processo e cleanup condicionado à propriedade.
As migrations legadas foram aplicadas **somente nesse banco descartável**.
Não houve transferência de schema, credenciais ou dados entre gerações.

A primeira execução com serviços teve **1.678 aprovações e uma falha**: o runner
legado recusou o nome `_test` escolhido para a fixture. Sua proteção exige
`se7e_*ci`, `CI=true` e opt-in explícito. Não foi relaxada. Depois da remoção da
primeira fixture, uma nova foi provisionada com nome adequado e as mesmas
proteções. A repetição executou **1.679/1.679**, **178/178 arquivos**, sem
omissões, em 110,39 segundos, início 16:59:55 (America/Cuiaba).

Serviços observados nessa regressão geral:

| Serviço                      | Versão | Imagem local                                                                                        |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| PostgreSQL legado de fixture | 16.15  | `pgvector/pgvector:pg16`, `sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b` |
| Redis de fixture             | 7.4.9  | `redis:7-alpine`, `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99`         |

A imagem PostgreSQL é a usada pelo CI legado para suas migrations históricas;
não acrescenta extensão vetorial ao controle v2. A fixture e seus volumes foram
removidos; conferência posterior encontrou zero containers com o prefixo da
rodada. O ambiente do processo foi restaurado. A repetição não consultou ERP.

Esses totais se sobrepõem: não somar 1.588, 1.678 e 1.679 como casos distintos.
O harness de referência incluído nos testes não é avaliação da IA consumidora.

## Matriz persistente completa

Modo `prisma`, imagem candidata e fixtures PostgreSQL/SQL Server/SQL Anywhere.
De **20:51:13 a 21:02:29 UTC**, **79/79 cenários passaram**, sem filtro e sem
omissões, em **675,25 segundos**. Os casos incluem o percurso Chromium de persona,
fontes, treinamento, publicação, token e consulta, além das famílias de
autorização, conhecimento, cruzamentos, operações, recuperação e anexos da suíte.
O runner genérico de consulta também usa escolha explícita de dataset v2,
conservando a leitura padrão da versão originalmente importada.

`testExitCode: 0`, `unchanged: true`, `result: passed`; wrapper retornou zero e
confirmou remoção somente da fixture. Cofre e autoridade são persistentes na
fixture, com comunicação MCP → hub → agente → motor. Não equivale a instalar
o agente desktop/supervisor nem a executar toda a matriz do aceite produtivo.

Inventários antes/depois idênticos:

| Projeto | Commit-base                                | SHA-256 efetivo                                                    | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `ec6be3c138ce30ad5a4595a164a469ddbfdb3c9d973f199cb69c41f616a53bb3` | 1096     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` | 1024     |
| Agente  | `ce4ec55c7ec869f735beb250d88d545edc9da549` | `ee7a3b62b92a38a999c29d93e52929a04a42707494b878af28e1038c873bd984` | 2674     |

Snapshots locais não são novos commits do MCP/hub. Alterações posteriores,
inclusive de outras tarefas do agente, exigem sua própria verificação e não
herdam aprovação desta rodada. A coordenação dos testes foi autorizada pelo
usuário; o companion/Flutter foi liberado após a limpeza, sem encerrar processos
alheios.

Versões observadas pelas inspeções:

| Motor        | Versão     |
| ------------ | ---------- |
| PostgreSQL   | 17.0.11    |
| SQL Server   | 16.00.4236 |
| SQL Anywhere | 16.00.0000 |

Drivers conferidos na fixture durante a execução; não é rastreamento da DLL por
chamada:

| Arquivo         | Versão                                    | SHA-256                                                            |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| podbc35w.dll    | 18.00.0000                                | `452afccffb9b7ffbdb736b8ba1cba9d7b1e11b09ffaee9cf85d6d3788cace991` |
| dbodbc16.dll    | 16.0.0.2043 (64-bit)                      | `571e105fb3e14e754b16863739d402022d0e1f64a10d0b224c4e6dd429d5e8be` |
| msodbcsql18.dll | 2018.0186.0001.01 ((DS_Main).170626-2112) | `b510668814e68df5018f6f3de0d203fd9b8628b1901d46ed3762ee263b87bbbb` |

## Evidências auxiliares e continuidade

### Revalidação após alteração posterior do agente

Depois da limpeza da rodada integral, outra tarefa alterou
`odbc_statement_executor.dart` e seu teste de polling, para permitir relógio
controlado no teste. O diff foi conferido em leitura: o padrão do executor
continua `Stopwatch.new`. Nenhum arquivo do agente foi editado por esta tarefa.

Foi executado um novo recorte com a mesma imagem MCP, de **21:06:41 a
21:08:07 UTC**: **6/6 cenários selecionados passaram**, 73 fora do filtro de 79,
em 85,33 segundos. Filtro:
`publicação SQL genérica com fixtures variadas e rollback|inspeciona metadados pela conexão`.
São inspeções e runners nos três motores, com as mesmas versões de motor
observadas. É regressão de integração SQL, não medição da latência de polling
nem substituição da suíte unitária/CI do agente.

Antes/depois iguais, com commits-base e contagens da tabela anterior:

| Projeto | SHA-256 efetivo                                                    |
| ------- | ------------------------------------------------------------------ |
| MCP     | `d3233e8491dfd097b49b2b053a09ccf8ade6072f9f179ba57d6059f2bc977aaa` |
| Hub     | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` |
| Agente  | `83d74f73ff206f7905933f1774c2896a00e5bb3982d495501e63c1db328fee0c` |

Wrapper zero, `testExitCode: 0`, `unchanged: true`, `result: passed` e limpeza
confirmada. A rodada de 79 continua vinculada ao snapshot anterior; não se
atribui sua cobertura integral à alteração posterior.

### Registros e itens abertos

Logs locais ignorados:
`node_modules/.cache/manual-training-release-check.log`,
`manual-training-tests-with-services-name-refused.log`,
`manual-training-tests-with-services.log` e
`manual-training-current-full-chain.log`; o recorte posterior está em
`manual-training-post-polling-chain.log`. O relatório conserva a recusa inicial;
a repetição não a transforma em aprovação histórica.

O roteiro manual ganhou ensaios explícitos de template, abertura do rascunho,
dataset, origem salva e substituição. Não foi registrada uma sessão humana de
treinamento nesta tarefa. A suíte Chromium completa do console permanece na
[rodada da seleção](2026-10-22-dataset-case-choice.md); não foi reexecutada aqui.

Continuam pendentes os itens do [plano restante](../remaining-plan.md), incluindo
datasets de outros tipos de skill, condições operacionais/instalação do agente,
acessibilidade integral, avaliação da IA e aceite por gate. HTTPS e ChatGPT
permanecem manuais. `ready: false` continua obrigatório; os resultados não
autorizam produção ou publicação de imagem.

O verificador `persona:release-check` foi executado e recusou publicação por
aceite incompleto, como esperado. `release:check` verifica código e testes;
não substitui esse portão de autorização de release.
