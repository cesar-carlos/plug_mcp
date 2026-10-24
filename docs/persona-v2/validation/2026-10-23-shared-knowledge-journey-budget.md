# Adoção compartilhada e jornadas OAuth — 2026-10-23

## Falha preservada

A rodada integral de 82 casos terminou com **81 aprovados e um timeout** no
caso de adoção compartilhada MSSQL, após 60.015 ms. Durou 648,22 s, de
17:02:11.312 a 17:13:00.740 UTC, na fixture `se7e_persona_8aaf6be19410_test`.
Os inventários dos três projetos permaneceram inalterados. Snapshot MCP:
`152c2f16db25f07c054c3f5f0b1f136bfb3007350acca1c06855fa0f700625f8`.

O caso combinava publicação, biblioteca, curadoria, histórico Bearer, toda uma
bateria OAuth e suspensão. Essa rodada não registrava tempos por fase:
**não permite atribuir o timeout a uma chamada específica ou ao OAuth**.
A duração menor da repetição também não prova a causa da variabilidade anterior.

## Alteração e correspondência dos casos

Os três casos `publica adoção explícita e confere as colunas na conexão executora
sem herdar concessões` conservam todas as verificações editoriais, de biblioteca,
curadoria, histórico Bearer, suspensão e SQL. Somente a chamada da bateria
`exerciseKnowledgeHistoryOAuth` foi movida para três novos casos:
`histórico OAuth compartilhado preserva consentimento e revogação em jornada independente`.

Assim, **82 passam a 85 casos**, sem remover assertions da bateria OAuth.
O helper original permanece inalterado. A preparação independente ocorre dentro
de cada teste, contada nos mesmos 60 segundos; não foi deslocada para hooks.
Ela publica duas versões, adota um perfil físico na antiga e concede explicitamente
as duas skills. PostgreSQL/MSSQL preservam as duas tabelas, PK/UNIQUE, FK composta
e relacionamento; SQL Anywhere conserva o escopo do cenário original.
Consentimento restrito, fonte ausente, paginação do histórico, comparação reversa,
paridade Bearer, conexões independentes e revogação continuam verificados.

Um arquivo de metadados registra motor, jornada, etapa, horário e durações,
sem SQL, nomes de recursos, parâmetros, respostas ou segredos. A fase de
curadoria continua incluindo a espera real de seis segundos pelo vencimento
do calendário e as verificações de paginação, isolamento e revogação.

## Resultados

| Rodada               | Resultado                         | Duração      | Fixture                          |
| -------------------- | --------------------------------- | ------------ | -------------------------------- |
| Proporcional         | 9 aprovados; 76 fora do filtro    | 159,95 s     | `se7e_persona_799b3956bd22_test` |
| Integral, sem filtro | **85/85 aprovados, sem omissões** | **643,56 s** | `se7e_persona_463600ff6495_test` |

A proporcional selecionou inspeção, adoção e histórico OAuth dos três motores.
Não foi apresentada como aprovação integral. A rodada integral ocorreu de
17:30:19.914 a 17:41:04.665 UTC, com `testExitCode:0`, `unchanged:true` e
`authorizesRelease:false`. O runner comparou os três inventários ao término.

| Motor        | Adoção completa | OAuth com preparação própria |
| ------------ | --------------- | ---------------------------- |
| PostgreSQL   | 44.764 ms       | 3.363 ms                     |
| MSSQL        | 40.261 ms       | 2.897 ms                     |
| SQL Anywhere | 39.735 ms       | 2.956 ms                     |

Versões retornadas pelos motores: PostgreSQL `17.0.11`, MSSQL `16.00.4236` e
SQL Anywhere `16.00.0000`, sem normalização desses valores.

| Projeto | Commit-base                                | Snapshot SHA-256                                                   | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `32bb8eceade0af11d13b8e4796687ff45fa644ed7733e91f22c176658d0c8934` | 1117     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

Os snapshots são iguais na rodada proporcional e na integral. Esta documentação
foi acrescentada depois; não altera retrospectivamente os hashes registrados.
Imagem local `se7e-persona-v2:manual-views-20261023`, ID
`sha256:a7ee30b84741bed41642896d19bf365b4a154bff278f6f3aa940f60a6539ea1f`.
Não houve mudança do runtime nem reconstrução/publicação da imagem neste ajuste.

## Limites e limpeza

Lint dirigido, tipos TypeScript, build e formatação dos arquivos alterados
passaram. `docs:check` conferiu 281 documentos, 1291 links e 13 gates, sem
problemas. O guard `persona:release-check` recusou a liberação com exit 1,
como exigido pelo aceite incompleto; isso não foi tratado como falha a contornar.

Preservados `testTimeout:60000`, `hookTimeout:300000`, limites SQL, aprovação,
policies e assertions. A matriz já configurava cotas de tráfego de fixture
`REST_GLOBAL_RATE_LIMIT_MAX`, `REST_AGENTS_COMMANDS_RATE_LIMIT_MAX` e
`SOCKET_RATE_LIMIT_MAX` em 10000. Nenhuma foi alterada: este ensaio **não
homologa as cotas padrão de produção**. A sessão manual tem configuração própria.

As três fixtures terminaram antes da limpeza e foram removidas pelo script
com verificação de escopo/propriedade. Cada repetição utilizou fixture nova;
não houve retry de SQL incerto ou uso de bases operacionais. Logs e tempos locais
ficam em `node_modules/.cache/oauth-budget-targeted.log`,
`oauth-budget-targeted-timings.jsonl`, `full-85-chain.log` e
`full-85-chain-timings.jsonl`. Esses arquivos de trabalho não são distribuição.

Esta evidência complementa o [roteiro manual](../onboarding.md#roteiro-de-teste-manual-do-treinamento)
e as [views nativas](2026-10-23-native-view-chain.md). Não certifica instalação
de produção, avaliação da IA, HTTPS ou ChatGPT. A [matriz de aceite](../acceptance.md)
continua pendente e o manifesto permanece `ready:false`, sem gates concluídos.
