# Cadeia completa com cofre corrigido — 2026-10-20

## Resultado

**79 de 79 cenários aprovados, sem filtro**, em 607,46 segundos, início
13:17:02. Modo `Persistence prisma`, MCP principal pela imagem candidata,
agentes reais e fixtures dedicadas PostgreSQL, SQL Server e SQL Anywhere.
O controlador removeu os recursos da fixture ao final. Nenhuma fonte operacional
ou cofre instalado foi usado. Log local:
`node_modules/.cache/persona-candidate-vault-full.log`.

Esta rodada inclui o percurso Chromium de criar persona, três fontes,
treinamento/publicação e consulta, além das famílias existentes de autorização,
conhecimento compartilhado, consultas, cruzamentos, runners, operações,
reinícios e recuperação. Não é uma avaliação da IA consumidora.

## Código exercitado

Imagem MCP:
`sha256:7a7114587a37ecdb91577ec13d4122a87150931a2e6872a706c1e517bf4f8a21`.
Origem do hub preservada pelo relay privado da fixture; sem overrides no gateway
do MCP empacotado. Helpers locais especializados não se tornam código da imagem.

| Projeto | Commit-base                                | Inventário SHA-256                                                 | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` | 1024     |
| Agente  | `3b4f099e64a319a100cd93e00667ffca4afef732` | `0012016cf476b9eaf798970ee964427551feb8ef4e64cfd98d724fd30d6330a9` | 2667     |

Inventários calculados durante a execução a partir dos arquivos rastreados e
não ignorados presentes nos checkouts, incluindo alterações locais. Hash da
lista ordenada de caminho relativo, SHA-256 e tamanho; symlinks recusados,
exclusões rastreadas refletidas pela ausência. Não são commits novos ou
autorizações de publicação. Registro local:
`node_modules/.cache/persona-vault-chain-revisions.jsonl`.

O agente usa o backend Windows local cuja
[correção e regressão](2026-10-20-agent-vault-concurrency-fix.md) foram registradas
separadamente. Esta rodada substitui a pendência de repetir a cadeia após essa
correção; não herda os resultados do agente anterior.

## Limites e registro dos motores

O arquivo de versões observadas por RPC era escrito apenas dentro da fixture
temporária e foi removido na limpeza. Os números exatos dessa rodada não foram
retidos e não são preenchidos por suposição. Isso limita o uso como evidência
formal de aceite.

Após a rodada, o runner foi ajustado para emitir também no log somente dialeto
e versão observada, preservando `null` quando não houve inspeção. Não exporta
manifesto, credenciais, SQL ou resultados. Também corrigido o nome histórico de
um teste que ainda dizia quatro motores; o escopo executado já era de três.

Validação dirigida desse registro: **três inspeções aprovadas, 76 cenários fora
do filtro**, início 13:29:22, 33,56 segundos, nova fixture removida ao final.
Strings observadas por RPC nessa rodada adicional:

| Dialeto      | Versão observada |
| ------------ | ---------------- |
| PostgreSQL   | `17.0.11`        |
| SQL Server   | `16.00.4236`     |
| SQL Anywhere | `16.00.0000`     |

Não são versões retroativas da fixture anterior nem inventário de drivers.
Log: `node_modules/.cache/persona-candidate-vault-versions.log`.
Typecheck, lint e formatação do teste alterado passaram.

Permanecem instalação/upgrade/desinstalação completos, condições operacionais
restantes, avaliação separada da IA, HTTPS e ChatGPT manuais e aceite formal
de todos os gates. O teste completo da cadeia não comprova essas entregas.
`ready:false` e nenhum gate concluído permanecem inalterados.
