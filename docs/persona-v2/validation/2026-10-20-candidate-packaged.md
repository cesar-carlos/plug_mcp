# Imagem candidata local — 2026-10-20

## Resultado e identidade

Build local do alvo persona-v2-candidate concluído. A rodada de
scripts/homologation/test-persona-candidate.ps1 terminou com código zero e
confirmou a limpeza dos containers, volumes e diretório próprios.

- Referência local: se7e-persona-v2-candidate:local.
- Configuração imutável produzida pelo build:
  sha256:053932006852ea3d4e69888e7e5330d202709604e061c6b9cb4754013979ce82.
- Manifesto OCI:
  sha256:355cd5679001dfbb81bd50c841b5167d0aa236eb98217dd7487d3368877f3bc4.
- MCP base: 136b5bfc8f7104b753bbd3703c9ffda196fdd51f, com alterações locais.
  O argumento GIT_SHA identifica a base; não representa um checkout limpo.

## Escopo comprovado

Recusa de produção, segredos inválidos e comandos indevidos; recusa de geração
legada e checksum alterado; ausência de DDL automático no startup; quarenta
migrations explícitas; assets do console; quatro jobs do worker; saúde, parada,
reinício e backup/restauração com conferência dos dados protegidos da fixture.

O script resolve a imagem local antes da rodada, sem fallback de build/pull,
e utiliza recursos aleatórios exclusivos. O hub desta verificação é propositalmente
inválido: esta rodada não comprova autenticação ou treinamento pela cadeia.

O build passou com avisos de anotação PURE do Zod e tamanho do chunk do console.
Esses avisos não foram ocultados nem tratados como aceite de desempenho.

## Treinamento pela imagem e cadeia persistente

Rodada adicional com fixture nova, Persistence prisma e CandidateImage
se7e-persona-v2-candidate:local, sem reconstrução da imagem. O wrapper resolveu
a referência local para sua identidade imutável. training:check passou para
o hub 0dc94d6990167f65e093b1fb68a8150630e2057c.

Filtro explícito: Chromium cria persona. Resultado: um cenário aprovado,
78 não selecionados, duração 39,39 segundos, início 09:48:12.
Não apresentar esta seleção como repetição integral dos 79 cenários.

O cenário percorreu criação, cadastro de três fontes, treinamento, publicação
e consulta. Conferiu runtime container sem substituição dos gateways e aumento
das chamadas SQL nos agentes de PostgreSQL, SQL Server e SQL Anywhere.
O removedor confirmou a limpeza somente da fixture indicada.
Esse resultado comprova o percurso automatizado pelo navegador no candidato
local; não substitui o teste manual do usuário nem a avaliação da IA.

## Limites de aceite

Não certifica instalação desktop, infraestrutura pública, HTTPS/ChatGPT,
avaliação da IA ou todas as janelas de falha distribuída. Não houve publicação
de imagem, alteração da entrada legada ou deploy. ready:false permanece.
