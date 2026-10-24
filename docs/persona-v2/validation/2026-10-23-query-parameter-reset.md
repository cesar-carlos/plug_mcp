# Limpeza e treinamento de parâmetros — 2026-10-23

## Falha e correção

Ao sair de Consultas, SQL e valores eram descartados, mas `queryModes` permanecia
em memória. Voltar à mesma publicação conservava “Nulo explícito”, “Texto vazio”
ou “Omitir parâmetro”, embora os valores já estivessem vazios.

A regressão Chromium reproduziu `null` após a navegação, quando esperava `value`.
O console agora limpa modos no mesmo ponto em que descarta valores. Não altera
seleção, publicação, treinamento, permissões ou parâmetros no servidor.

A ampliação do baseline revelou rótulos ambíguos entre nome da skill e nome do
parâmetro. Cada parâmetro ganhou grupo com legenda e rótulos específicos para
nome/tipo/significado. Isso melhora a identificação no editor, sem mudar schema.

## Testes e falhas registradas

- Chromium com PostgreSQL próprio e autoridade sintética: **3 percursos aprovados
  em 13,2 s**, após a correção dos rótulos. Cobrem descarte de nulo/vazio/omissão
  e valores, persistência/releitura de N:N em consultas e regressão das operações.
  Os mesmos percursos já haviam passado em 12,5 s antes da mudança dos rótulos;
  não somar como seis cenários distintos.
- Frontend: **86 testes em 22 arquivos aprovados**; lint, tipos e build passaram.
  Tipos do projeto e lint dirigido dos dois helpers/testes também passaram.
- Primeira cadeia parametrizada: fixture `se7e_persona_7fca6f125167_test`,
  16:08:18–16:08:51 UTC, 1 teste passou e 1 falhou. O percurso parou na releitura
  PostgreSQL devido à ambiguidade dos rótulos. MCP snapshot
  `59e9f8d55aa8ba9585d89a5b95a03363eecb3ad901dbbdfbc1047e486e8885ae`.
  Essa rodada não aprovou consultas parametrizadas. Não foi reiniciada na mesma
  fixture. A imagem `manual-parameters-20261023`, ID
  `sha256:ce1bdf1a756600cc21f91807a35cae402f0ea2db3881482353cbad67ffda908f`,
  foi preservada como candidato anterior.
- Nova cadeia, fixture `se7e_persona_0afc57ed21d1_test`: **2 testes aprovados em
  48,03 s**, 16:11:32–16:12:21 UTC. Inclui a guarda de ACL e o percurso real
  Chromium → MCP → hub Prisma → agentes → PostgreSQL/SQL Server/SQL Anywhere.

O percurso declara `minimum` inteiro obrigatório pelo console, salva e relê seu
tipo e modelo SQL. Publica com prazo humano explícito e concede tokens exatos.
Valor `0` retorna o decimal `10.25`; valor `999` retorna vazio. Parâmetros são
enviados separados do SQL. A rodada conserva edição posterior sem republicação,
recusa de DELETE, tokens distintos, chamada direta negada, retirada de concessão,
consumidor independente e logout. Não captura segredos, screenshots ou traces.

## Candidato e inventários da rodada aprovada

Imagem local nova `se7e-persona-v2:manual-parameters-final-20261023`, ID
`sha256:0691edb6814f92595247e844b6e558a1b417f0f9c69f6084aae9f083f629e6f4`.
Build conferiu TypeScript 7.0.2, servidor/worker e frontend; não houve publicação.

| Projeto | Commit-base                                | Snapshot SHA-256                                                   | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `54eef0960a431f3bcff71a99acdd0ce9531de94a4d569c15eff7b9905055430b` | 1115     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

Fontes idênticas antes/depois; snapshot não é commit publicado. Ambiente Windows,
Node 24 do projeto, PostgreSQL 17/SQL Server 2022 em contêineres e SQL Anywhere 16
com drivers privados. O baseline usa companions com cofre próprio, não o agente
operacional instalado. Não certifica matriz completa de tipos/versões/drivers.

## Limpeza e alcance

Ambas as fixtures tiveram parada limpa confirmada de servidor/worker/companions.
Os bancos próprios do navegador foram removidos pelo teardown; demais recursos
foram removidos pelo procedimento com escopo/propriedade verificados. Nenhuma
base operacional foi usada e não houve retry de SQL na fixture falha.

Os avisos de bundle/dependências permanecem visíveis. HTTPS e ChatGPT seguem para
validação manual. Não houve commit, push ou deploy; manifesto permanece
`ready:false`, sem gates aceitos. A limpeza do formulário e um parâmetro inteiro
não encerram o plano ou a avaliação humana/IA. O [roteiro manual](../onboarding.md#roteiro-de-teste-manual-do-treinamento)
e a [sessão local](../homologation-chain.md#sessão-contínua-para-treinamento-manual)
continuam sendo as instruções de uso, com fixture nova e imagem explícita.
