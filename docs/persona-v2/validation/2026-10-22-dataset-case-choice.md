# Escolha explícita de datasets nos casos — 2026-10-22

## Implementação e contrato

O editor de casos de consulta permite listar e escolher versões de datasets
do mesmo catálogo e da versão exata do template de origem. A lista paginada
retorna somente referências; selecionar não lê linhas, altera sementes, salva
casos ou aprova testes. Preparação separada fixa ID/versão/hash e confirma
substituição. Rascunho sem dataset inicial também pode fazer essa escolha.

O servidor revalida fonte, revisão e papel editorial. Dataset de outro template,
hash incorreto, cursor de outro escopo e revogação são recusados. Não adota a
versão mais recente nem altera o vínculo original da importação. Sessão Client
pode registrar a escolha ao salvar; edição delegada conserva a origem do caso,
sem poder trocá-la ou obter novas linhas da biblioteca.

A migration aditiva **0043** cria somente o índice da consulta por template e
versão. Migrations anteriores e dados existentes foram preservados. Aplicação
continua explícita; startup não migra o banco. Nenhum contrato do hub/agente
foi alterado nesta entrega.

## Verificações locais

| Verificação            | Resultado                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Integração PostgreSQL  | 121/121 em shared-knowledge, setup-delegation e postgres                                                  |
| Unitários afetados     | 55/55 em cinco arquivos                                                                                   |
| Chromium dirigido      | 1/1: duas versões, escolha sem alteração automática, confirmação/cancelamento e releitura da origem salva |
| Chromium completo      | 56/56, com hub sintético e bancos de controle/fixture isolados                                            |
| Frontend               | Lint, tipos, 86/86 testes e build                                                                         |
| Servidor               | Lint, tipos e build                                                                                       |
| Contrato e ferramentas | training:check, Node 24.21.0 e TypeScript 7.0.2 passaram                                                  |

A integração cobre 23 versões em duas páginas sem duplicação, versão antiga
escolhida explicitamente, versão de template incompatível, ausência de dataset
inicial, hash incorreto, sessão/CSRF, outra persona e revogação. Listar/carregar
não aumenta revisão, cria casos ou relatórios. Gravação posterior conserva a
origem escolhida sem aprovação herdada. O conjunto inclui baseline novo e
reaplicação de migrations; não modifica banco operacional.

A primeira rodada de integração teve 120 testes aprovados e um erro de
expectativa no teste novo: entrada incompleta usa HTTP 409 no contrato vigente,
não 400. Ajustada somente a expectativa, o cenário dirigido e a repetição
integral passaram. Lint apontou retorno explícito e leitura tipada do DTO nos
testes; ambos corrigidos sem relaxar regras.

## Candidata e cadeia persistente

Imagem local `se7e-persona-v2-candidate:dataset-choice-20261022`, ID
`sha256:1f856f5fc85d49b6396cb29ec2eaad517e0fd4d84402a0dd88f6a0d57371491d`.
Não foi publicada.

De 20:45:32 a 20:47:05 UTC, **6 cenários passaram**, 73 fora do filtro de 79.
Filtro: `publicação SQL genérica com fixtures variadas e rollback|inspeciona metadados pela conexão`.
São três inspeções e três runners de publicação SQL, pela cadeia
MCP → hub Prisma → agente → motor, com contas, armazenamento e policies reais
de fixture. O operador cria duas versões sintéticas do dataset. A importação
fixa a primeira; a leitura padrão ainda retorna sua linha de ID 9. A escolha
explícita da segunda retorna ID 10 e alimenta os casos do runner, cuja
publicação continua exigindo seu próprio relatório.

Não é uma nova rodada integral dos 79 cenários. O cenário de escolha no
navegador usa hub sintético; o percurso do runner usa a API Client real da
composição persistente, sem executar DML experimental em fontes de usuário.

`testExitCode: 0`, `unchanged: true`, `result: passed`; wrapper zero e limpeza
da fixture confirmada. A coordenação autorizada manteve Flutter/companion sem
sobreposição com os testes da outra tarefa. Nenhum arquivo do agente foi editado.

Inventários antes/depois idênticos:

| Projeto | Commit-base                                | SHA-256 efetivo                                                    | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `e108f88b893d57ef2851bbd50927006537d3dbbaa3409d044eeac5d62198ace4` | 1096     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` | 1024     |
| Agente  | `ce4ec55c7ec869f735beb250d88d545edc9da549` | `ee7a3b62b92a38a999c29d93e52929a04a42707494b878af28e1038c873bd984` | 2674     |

São snapshots efetivos, não commits novos do MCP/hub. As inspeções observaram
PostgreSQL `17.0.11`, SQL Server `16.00.4236` e SQL Anywhere `16.00.0000`.
Drivers conferidos durante a fixture, sem afirmar rastreamento da DLL por chamada:

| Arquivo         | Versão                                    | SHA-256                                                            |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| podbc35w.dll    | 18.00.0000                                | `452afccffb9b7ffbdb736b8ba1cba9d7b1e11b09ffaee9cf85d6d3788cace991` |
| dbodbc16.dll    | 16.0.0.2043 (64-bit)                      | `571e105fb3e14e754b16863739d402022d0e1f64a10d0b224c4e6dd429d5e8be` |
| msodbcsql18.dll | 2018.0186.0001.01 ((DS_Main).170626-2112) | `b510668814e68df5018f6f3de0d203fd9b8628b1901d46ed3762ee263b87bbbb` |

## Limites

Não habilita conversão entre templates, escolha de datasets por MCP, datasets
de operações/cruzamentos, avaliação da IA ou aceite instalado. A documentação
de encerramento é posterior ao inventário e não certifica outro candidato.
HTTPS e ChatGPT permanecem manuais; `ready: false` e o bloqueio de deploy são
preservados.
