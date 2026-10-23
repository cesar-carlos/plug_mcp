# Consolidação dos editores do console — 2026-10-20

Rodada após referências locais de erro nos contratos SQL, cruzamento e externo.
MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.

## Suíte unitária web

Primeira execução no sandbox: seis arquivos falharam ao ler módulos temporários
SSR (ENOENT), 16 passaram, 64 testes executados passaram. A repetição fora do
sandbox passou em 22 arquivos e 86 testes, 955 ms, início 12:11:32. Não houve
alteração de código entre as rodadas; a primeira falha continua registrada.

## Imagem candidata

Reconstruída localmente, sem publicação. ID observado:
`sha256:7a7114587a37ecdb91577ec13d4122a87150931a2e6872a706c1e517bf4f8a21`.
Manifesto da plataforma:
`sha256:107af153273452ad71558f5252c588cc817fdd435d71feb86fdb0029c3f49b5a`.
Config:
`sha256:801d7e52461bdc73316525bef551b8dc141443a775e6719492dffb9aa443a64e`.

Ensaio de empacotamento aprovado: produção/segredos/comandos inválidos recusados,
legado/checksum recusados, ausência de DDL no startup, 42 migrations, assets,
quatro jobs, backup/restauração e reinício. Limpeza de recursos próprios confirmada.
Esse ensaio não autentica no hub nem executa SQL de negócio.

## Regressão Chromium

Rodada completa sem filtro: 52 testes passaram e um falhou em 5,7 minutos.
O cenário de descarte de cadastro pediu navegação após mudança da URL, antes
de aguardar o editor externo carregado sob demanda. A leitura inicial ativou
o bloqueio de navegação; o clique foi recusado e o teste aguardou um formulário
oculto. Snapshot capturou a área de treinamento ainda ativa, sem diálogo.

Corrigida a sincronização do teste: aguarda o controle montado e habilitado do
editor antes de navegar. Não altera guard, limite, permissão ou tempo de espera
do produto. PostgreSQL 17 de fixture; recursos próprios removidos.
Não apresentar a rodada original como integralmente aprovada.
Repetição dirigida após a correção: cinco execuções aprovadas em 16,1 segundos,
com fixture nova e limpeza confirmada. Lint e formatação passaram. A mudança
é somente no teste; não requer reconstruir o runtime. Rodada integral final
do candidato permanece pendente.

## Limites

Nenhuma publicação de imagem, alteração de produção ou encerramento de gate.
HTTPS público, ChatGPT, leitor de tela, avaliação da IA e cadeia instalada
continuam exigindo evidências próprias. O ID identifica o artefato local;
o commit-base não substitui inventário completo das alterações locais.
