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

## Integração do baseline na main

O baseline persona-v2 foi integrado como código executável de desenvolvimento,
incluindo a correção do orçamento das jornadas, suas dependências, migrations,
console, testes e guardas de distribuição. O arquivo histórico de fontes do
commit `54e3a4e` continua preservado; esta integração incorpora os arquivos em
seus caminhos reais, sem promover a entrada v2 a runtime padrão ou produção.

O pin do hub foi revisado para `8a4d9a559702cc742a839b0b6b3b70ec3b7aa4a2`.
A única dependência funcional adicionada ao hub é o prazo explícito e limitado
das sessões manuais do companion de fixture, com parada cooperativa. O contrato
bundled e o snapshot histórico continuam com seus hashes anteriores; a verificação
de commit exato e ancestralidade não foi relaxada. O lockfile local do hub e as
alterações de instalador/updater do agente não fazem parte desta integração.

### Verificações da integração

- `release:check` no checkout isolado: Node 24.21.0, TypeScript 7.0.2,
  documentação, contrato do hub, lint, formatação, tipos, build e console aprovados.
- Suíte geral: **1601 aprovados, 91 opcionais sem ambiente**; frontend:
  **86/86 aprovados**. Não somar esses totais às suítes dirigidas sobrepostas.
- Migrations legadas novas/upgrade e concorrência OAuth PostgreSQL aprovadas.
- Integração persona-v2 PostgreSQL: **328/328**; cache Redis: **8/8**.
- Pin, bloqueio de publicação e empacotamento: **35/35**, incluindo **26/26**
  do pacote. A fixture agora filtra `build` somente dentro da origem copiada;
  a regressão reproduziu a exclusão indevida quando um ancestral se chamava build.
- Hub: lint, tipos, compilação do companion, contrato e **60/60 testes de
  contrato** aprovados. CI e CodeQL do commit do hub também aprovados.
- Candidata local: recusas de produção/segredo/comando, banco legado/checksum,
  ausência de DDL automático, 43 migrations, assets, quatro jobs, backup/restore
  e restart aprovados, com limpeza confirmada. A imagem não foi publicada.
- Console e percursos manuais coordenados têm evidência separada em
  [troca de fonte](2026-10-23-query-source-knowledge-reset.md): 61/61 Chromium,
  treinamento e publicação manual com casos/CLI nos três motores. Esses testes
  identificam a própria imagem e não certificam retrospectivamente outra revisão.

A primeira matriz do checkout integrado passou **85/85**, sem filtro,
com inventários estáveis: `2026-10-23T18:02:28.390Z` a `2026-10-23T18:16:20.144Z` UTC;
`Duration  799.94s (tests 99%)`. Essa rodada conservava o pin anterior e a imagem manual.

A rodada final repetiu **85/85 sem filtro**, usando o hub publicado no pin novo
e uma candidata local reconstruída do checkout integrado. Intervalo:
`2026-10-23T18:21:58.889Z` a `2026-10-23T18:33:23.463Z` UTC; `Duration  682.64s (tests 99%, import 1%)`.
`testExitCode:0`, `unchanged:true`, `authorizesRelease:false`.

Imagem local final: `se7e-persona-v2:integration-baseline-20261023`, ID
`sha256:255b5504e2fc20c91f191416496beb370e1079f30fbfb8fc5e93bb3e9fddfbcc`.
Foi construída sobre o commit-base MCP `54e3a4e` com o baseline ainda pendente
no checkout; esse label não é o commit final da integração. Os inventários abaixo
identificam exatamente as fontes locais exercitadas, inclusive alterações locais.
Não equivalem a uma atestação de imagem construída por CI no commit final.

| Projeto | Commit-base do checkout                    | Snapshot SHA-256                                                   | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| mcp     | `54e3a4e14b6b7dd395d86c74e7614ba61c50b22f` | `00c035aa66b2be144db6ef35db390a75b7f4d681a1ae0b99e864798aab76f6c7` | 1130     |
| hub     | `8a4d9a559702cc742a839b0b6b3b70ec3b7aa4a2` | `9202f2f682705228cdb99d4990330a0dc600fcbf60ad4aa12d10dafdd90e0ee3` | 1024     |
| agent   | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

As fontes ficaram congeladas durante cada rodada e os inventários finais foram
iguais aos iniciais. Após a rodada, somente o registro desta evidência, o changelog
e a referência documental da rule de testes foram atualizados; a contagem ficou
no índice de evidências. Uma linha vazia extra no fim do script privado de smoke
também foi removida, sem alterar execução, runtime ou hashes históricos. Cada matriz usou fixture
nova; a limpeza verificou propriedade e não tocou bancos operacionais. Logs brutos
permanecem locais, sem incluir manifestos/segredos na distribuição.

Nenhum timeout, cota SQL, aprovação, assertion ou gate foi relaxado. As cotas de
tráfego específicas da fixture continuam distintas dos defaults de produção.
Os três manifestos conservam `ready:false` e gates incompletos; o guard de release
continua recusando publicação. Integrar código na main não encerra aceite humano,
HTTPS/ChatGPT, corte coordenado ou homologação instalada. **Deploy bloqueado.**
