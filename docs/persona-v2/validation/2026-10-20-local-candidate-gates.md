# Gates locais do candidato — 2026-10-20

## Identificação

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Inventário produzido por `check-persona-release.mjs --candidate`:
`sourceSha256=1069682b296fbc09fdc5575685ba52c6b6883dc4c218b5c4a9ff3bc3f1a87364`,
1075 arquivos, `authorizesRelease:false`. Identifica a captura anterior à
inclusão deste relatório; não é hash de imagem nem registro de aceite.

## Execução e resultado

Comandos pelo wrapper Node do projeto. `release:check` inicialmente parou por
restrição do sandbox na leitura do checkout vizinho do hub. Fora do sandbox:

- Node 24.21.0 e TypeScript 7.0.2: passaram.
- `docs:check`: passou sem problemas.
- `training:check`: passou, referência hub
  `0dc94d6990167f65e093b1fb68a8150630e2057c`, sem alterar referência ou snapshot.
- Lint geral: passou.
- Formatação geral: identificou somente
  `2026-10-19-example-inactivation-persistent.md`. Prettier corrigiu a
  apresentação sem mudar o conteúdo; nova rodada geral passou.
- Typecheck e build do servidor: passaram.
- `npm test`: 168 arquivos passaram, seis foram omitidos;
  1555 testes passaram e 91 foram omitidos. Duração 106,64 segundos.
- `web:check`: lint, tipos, 86 testes em 22 arquivos e build passaram.
  Avisos Zod/Rollup e chunk acima de 500 kB permanecem visíveis.

Após a interrupção por formatação, os comandos seguintes foram executados
individualmente; não afirmar que uma única invocação de release:check terminou
com sucesso. A suíte geral foi executada fora do sandbox devido às restrições
conhecidas de arquivos temporários e leitura do hub.

## Omissões e continuidade

A suíte geral condiciona casos PostgreSQL/Redis a DATABASE_URL/REDIS_URL.
Essas fixtures não estavam definidas nesta rodada. Foram localizadas condições
em recriptografia, FTS, autoridade publicada, curadoria, resultados de consulta,
cenários de referência e singleflight. Não interpretar os 91 omitidos como
aceite; precisam de fixtures próprias, inclusive schema legado isolado quando
o teste cobre a entrada legada.

A configuração geral exclui tests/persona-v2, tests/homologation e tests/live.
Portanto este resultado não certifica integração PostgreSQL v2, cadeia
persistente dos três motores, Chromium, imagem candidata, efeitos reais ou IA.
Não houve reset, provisionamento, publicação ou deploy. HTTPS/ChatGPT seguem
manuais. Manifesto continua ready:false e sem gates aceitos.
