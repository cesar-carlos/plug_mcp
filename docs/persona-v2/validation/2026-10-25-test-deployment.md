# Primeiro deploy de teste v2 — 2026-10-25

Revisão local com alterações ainda não commitadas. Não houve push, publicação
ou conexão ao servidor remoto. Contrato integral permanece `ready: false`.
O [procedimento](../first-test-deploy.md) descreve o escopo test-only.

## Entrega

Comandos principais e Docker padrão usam persona-v2. Runtime test-server exige
modo production, HTTPS, chave própria e banco v2. CI preserva artefato próprio;
envio verifica rodada/jobs/identidade e receptor separa configuração, parada,
migração e arranque. Legado permanece explícito para regressões.

## Verificações

- Node 24.21.0 oficial, arquivo baixado e SHA-256 conferido; instalação do host
  não alterada. TypeScript real 7.0.2. Node padrão 24.18 foi recusado inicialmente.
- Tipos, lint e build passaram após implementação.
- Regressão geral com PostgreSQL/Redis novos: 190 arquivos, 1.781 testes aprovados,
  sem skips, em 216,29 segundos. Fixtures legadas e v2 permanecem separadas.
- Regressões dirigidas de origem/imagem/liberação/sequência: 47 testes aprovados
  na primeira rodada; checagem de runtime distingue local, teste e produção.
- Imagem amd64 em Docker Linux: ensaio test-server passou com 43 migrations,
  recusa de banco legado/checksum/configuração indevida, ausência de DDL no startup,
  assets do console, quatro jobs do worker, backup/restauração, reinício e parada
  limpa. Recursos da fixture removidos com conferência de propriedade.
- Contrato do hub passou em cópia isolada do commit
  `da457e05e3fd4ee407d7aefb2c58d82c7e6d92f5`. Checkout compartilhado não foi alterado.

- Persistência v2: 21 arquivos, 329 testes aprovados em 433,47 segundos.
- Cache Redis v2: 8 testes aprovados; console: 22 arquivos, 86 testes aprovados,
  com lint, tipos e build. Bancos/containers de ambas as rodadas foram removidos.
- Repetição dirigida final: 50 testes aprovados, incluindo provas legada/candidata
  recusadas pelo verificador test-server. Não somar à regressão geral como cobertura distinta.
- Formatação global e docs:check passaram; sintaxe Bash dos três scripts passou.
- Compose padrão e comando check executados em rede descartável, sem conexão ao
  banco. Imagem final repetiu o ensaio das 43 migrations e teve limpeza confirmada.

Imagem local intermediária, anterior ao ajuste do aviso do console: revisão-base MCP `5fee6753f394bbe677511c7d3bbaac252478d9c3`,
com alterações locais desta tarefa (não equivale a imagem produzida por CI).
ID Docker `sha256:0689ae72434daf51d75264668cf90862e9692564a325a3dca961b8a731f95cb7`.
Arquivo exportado: 97236992 bytes, SHA-256
`c37f8dee923a364be8a2ee1c9c4a2986be92c11507eaeddd44a6f2d8193dc5b5`.
Passaram record, verify-loaded e check-persona-test-deploy verify no arquivo real.
A imagem final, já com o aviso corrigido, passou novamente pelo ensaio e pelos
verificadores do arquivo/identidade. Sua [prova preservada](2026-10-25-test-deployment-image.json)
fixa ID `sha256:c9ff125b87c26a6d6999688a11e582dc05eb42daebf7f7cbbf3daba31bc63a80`,
SHA-256 do arquivo `800d6fec974fc41cb4f144dd08c492257ca55f26fd86c036ada36eee83d9ea98`
e 97236992 bytes. O checkout temporário do hub e todos os recursos dos ensaios
concluídos foram removidos; imagens/arquivos exportados foram preservados localmente.

Não foi executado origin contra uma rodada GitHub nova; esse comportamento tem
regressões positivas/negativas e permanece obrigatório no workflow.

A primeira rodada Chromium teve 61 aprovados e uma falha na sincronização do teste de
conflito da fonte: clicava no details antigo antes da resposta de releitura
substituir o formulário. Foi acrescentada espera observável pelo fechamento
do formulário, sem mudar asserts de conteúdo, autoridade ou timeout. O aviso
legado de bloqueio total do console também foi atualizado para test-server.
A repetição completa com build novo e fixture nova passou: 62 testes em 6,4 minutos,
sem filtros ou retries. O container da fixture foi removido ao terminar.

Inventário final do checkout: 1164 arquivos, sourceSha256
`674b1c3f76422daaff6ddba6dcfee16f46c28010016711781726b4bf0fac7ef3`.
Captura somente de leitura com `--candidate`, `authorizesRelease: false`; não
substitui a prova de uma rodada CI. Relatórios desta pasta não entram no hash.

## Falhas preservadas

A checagem inicial do hub recusou o checkout local divergente. A repetição usou
clone temporário no commit exigido, sem atualizar pin ou ignorar hashes.
A primeira execução da fixture de restauração recusou o nome antigo do banco;
foi ajustada para o nome dedicado atual e para seleção explícita test-server.
A repetição passou sem remover verificação de isolamento.
O primeiro teste do seletor de arquivos falhou por indisponibilidade do Bash no
ambiente restrito; a repetição com o Bash instalado passou sem alterar assertions.

## Limites

Testes de sequência simulam comandos Docker; o ensaio da imagem usa Docker e
PostgreSQL reais. Nenhum desses resultados comprova SSH instalado, configuração
privada do host, HTTPS público, execução do workflow no GitHub ou conversa no
ChatGPT. Não foram repetidas nesta tarefa as cadeias SQL Server/SQL Anywhere,
sem mudança de gramática ou execução de negócio. Nenhum gate integral foi aceito.
