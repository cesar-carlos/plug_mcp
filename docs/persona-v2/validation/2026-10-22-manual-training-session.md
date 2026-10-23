# Sessão contínua isolada de treinamento — 2026-10-22

## Escopo e resultado

Implementada sessão manual de 10–120 minutos (padrão 60), com prazo absoluto,
controle MCP vazio, hub Prisma, agentes/cofres nativos isolados e servidor/worker
da imagem candidata local. Não cria persona nem treinamento automaticamente.
O [contrato de uso](../homologation-chain.md#sessão-contínua-para-treinamento-manual)
inclui inicialização, arquivo privado de acesso e parada cooperativa.

Esta rodada não libera produção nem conclui o plano. HTTPS e ChatGPT permanecem
para validação manual; não houve instalação do aplicativo desktop ou avaliação
da IA. Nenhum gate recebeu aceite.

## Verificações executadas

- Contrato de prazo/processos MCP: **5/5** testes, incluindo prazo fixo sem
  renovação, duração inválida, saída inesperada e erro sem conteúdo privado.
- Helper Dart: **3/3** testes; análise dos três arquivos afetados sem problemas.
- `vitest.persona-manual.config.ts`: **1/1**, 55,31 segundos. Inicialização vazia,
  navegador Chromium criando persona, três fontes, treinamento, publicação,
  token, consulta real e estados de recusa/vazio pelo helper da cadeia existente.
  Servidor/worker e companions encerrados; limpeza guardada concluída.
- Lançador público: iniciado com imagem imutável e 60 minutos. Prontidão com
  `initialPersonas:0`, worker saudável e ACL protegida com duas regras (usuário
  atual e SYSTEM). Parada pedida pelo script próprio, confirmação terminal limpa,
  remoção da raiz e inventário estável. Janela UTC 21:35:34–21:36:39.
- Regressão automatizada: **6/6 selecionados**, 48,04 segundos; filtro
  `consulta publicada, SQL adaptado|inspeciona metadados`. Os outros **73/79**
  cenários ficaram fora desta rodada dirigida. Mantidos os prazos padrão dos
  companions. Janela UTC 21:37:21–21:38:11, inventário estável.
- MCP: tipos, build, lint completo e lint dos scripts afetados aprovados.
  Hub: lint completo aprovado. PowerShell: sintaxe dos três scripts conferida.
  `docs:check`: zero problemas; executado novamente após registrar a evidência.

O ensaio Chromium foi automatizado; não constitui aceite humano. Não se aguardou
uma hora de sessão nem duas horas do teto: testes de relógio provaram a duração
fixa, e os ensaios reais provaram inicialização/parada antecipada. O worker teve
prontidão real, sem repetir nesta rodada toda sua matriz de falhas/concorrência.

## Candidato e revisões efetivas

Imagem de runtime reutilizada explicitamente:
`sha256:1f856f5fc85d49b6396cb29ec2eaad517e0fd4d84402a0dd88f6a0d57371491d`.
Nenhum runtime foi alterado nesta tarefa; os controladores/companions são externos
à imagem. A imagem não é prova automática dos arquivos de controle atuais.

Inventário antes/depois do lançador e da regressão, sem alterações entre leituras:

| Projeto | Commit-base                                | SHA-256 dos arquivos efetivos                                      | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `04de4bbe376997f7fd85f771ff783f33511228958f46ebbebec1c35474fe5270` | 1105     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `306692807969cf1309bda84eca5b613dcd367ebabc9808c853083030a71b23ca` | 1024     |
| Agente  | `1627425c4ff8a73a2df67b948d7dd3688e6fe8a4` | `2f414b2096b75587c8439e72dedb47c068376803b71530b9f15ea9456fcc7e13` | 2676     |

Estes hashes são snapshots, não commits. Documentação/evidência acrescentadas
após a rodada não foram retroativamente incluídas nesses inventários.

Motores observados na regressão: PostgreSQL 17.0.11, SQL Server 16.00.4236 e
SQL Anywhere 16.00.0000. Foram usados os drivers privados/instalados já descritos
na [rodada consolidada](2026-10-22-training-full-gates.md), sem troca de binários
de driver nesta tarefa. Node 24.21.0 e TypeScript 7.0.2 do projeto.

Registros locais em `node_modules/.cache`, com hashes para identificar a rodada:

| Arquivo                                 | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `manual-session-validation.log`         | `a4447923490cf342fc2e7bdc20c31917290a807eb8607760e99882b05c9c0f2e` |
| `manual-launcher-validation.log`        | `29e7260e3326bff463b4ba92532357459101d7fabe2a56905895d69950a1963d` |
| `manual-session-default-regression.log` | `6f9ba0efd54b14097f16cd89502f3993d13af06461d79336f3e45885bae486af` |

Inventários: `persona-chain-sources-f5ba4d89e88b40c6a9157d669fc7d652.json`
e `persona-chain-sources-9338876be1174abba7e3c2f1ba29c01d.json` no mesmo cache.
Ambos conservam `authorizesRelease:false`. Logs privados não são publicados
como documentação nem substituídos por conteúdo resumido.

## Correções e limpeza

O primeiro uso do lançador recusou antes de criar fixture porque o nome escolhido
para o inventário não correspondia ao contrato do verificador. O lançador passou
a usar o prefixo exigido; o verificador não foi enfraquecido. Após a correção,
inicialização e parada reais passaram. Timers de observação não mantêm o Node
aberto depois do encerramento, e o supervisor aguarda fechamento dos streams.

As três fixtures desta rodada foram removidas pelos verificadores existentes;
nenhum alvo operacional foi utilizado. Credenciais sintéticas ficaram em arquivos
privados, sem incorporação a este relatório. Não há sessão manual deixada aberta.
O manifesto continua `ready:false`, com treze gates exigidos e nenhum concluído.
