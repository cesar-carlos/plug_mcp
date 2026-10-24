# Referência do hub e repetição integral da cadeia — 2026-10-19

## Revisão do hub

Referência anterior `76950497dc386130e13b7d6afc0678e50208e985`; nova referência
`0dc94d6990167f65e093b1fb68a8150630e2057c`, com
[CI upstream aprovado](https://github.com/cesar-carlos/plug_server/actions/runs/39296786806).
Diff completo revisado: wrapper Node do postinstall, exclusões do editor e regra
de regressão. Não altera contrato público, transporte ou autorização.
CI e constante MCP fixam o mesmo SHA. Contrato e patch histórico conservam hashes:

- Contrato: `a8e8bc82a9b6d995c8637bf47bc35e17d44c5b21aba60889be25654ac60f4e60`.
- Snapshot: `7f1b746a782b5023aed562cb40edbf72dbe39a15498fcba2e36a949604aa1948`.

`training:check` passou com checkout/SHA exatos, ancestralidade e incorporação
histórica, sem reaplicar patch ou alterar o índice do hub. Nove testes de pinagem
e snapshot passaram; a primeira tentativa restrita recusou criação dos repositórios
Git temporários. A repetição autorizada usou somente fixtures próprias.

## Correção e candidato

A rodada anterior terminou com 62 casos aprovados e 16 falhas: o reinício composto
herdava 60 segundos, abaixo da soma dos limites de parada, partida e reconexão.
A limpeza iniciada pelo timeout interrompia o hub enquanto o agente reconectava.
O teste composto agora reserva 525 segundos; reinício exclusivo do agente, 200.
Limites individuais de processo, SQL, RPC e reconexão permanecem inalterados.
As asserções de preservação e recuperação não foram removidas.

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Agente observado `3b4f099e64a319a100cd93e00667ffca4afef732`.
[Resumo do inventário do candidato](2026-10-19-hub-chain-rerun-files.json).
Esse resumo identifica arquivos atuais; não representa aceite de imagem publicada.

Rodada sem filtro, `Persistence prisma`, fixture nova e descartável nos três motores.
MCP usa composição do checkout, hub persistente e agente com cofre real de fixture;
não é ensaio do instalador desktop ou da imagem candidata. Nenhuma fonte operacional.

## Resultado

**78 testes aprovados, sem filtro ou omissões, em 566,45 segundos.** Rodada
iniciada às 13:57:24 (America/Cuiaba). O reinício completo e a recuperação de
journals passaram, incluindo os cenários posteriores que falharam em cascata na
rodada anterior. As revisões do hub e agente foram reconferidas após os testes.

Fixture `se7e_persona_d726d22151d5_test`, sessão
`chain-faea5da9ca494cc59fc5340eeab74a01`. O removedor conferiu propriedade/raiz
e concluiu a limpeza dos recursos próprios. Não reutilizou a fixture anterior.
Versões exatas dos motores desta rodada não foram transcritas antes da limpeza;
não reutilizar números de relatórios anteriores para preencher essa lacuna.
Isso limita a evidência para aceite final, sem alterar o resultado dos 78 testes.

Tipos, lint dos arquivos alterados, build, formatação e `docs:check` passaram.
Esta rodada valida o checkout com autoridade Prisma e agente de fixture; não
certifica imagem final, instalador desktop, infraestrutura pública ou avaliação da IA.

HTTPS e ChatGPT permanecem manuais. Manifesto `ready: false`, sem gates encerrados,
sem publicação, commit, push ou deploy.
