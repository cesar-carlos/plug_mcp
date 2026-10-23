# Setups de fontes e delegação MCP/hub — 2026-10-12

Evidência parcial para `identity-and-authorization`, `oauth-and-console` e
`coordinated-cutover`. Não encerra gates. Manifestos continuam `ready: false`;
nenhuma imagem, publicação, instalação ou deploy foi realizado.

## Revisão e ambiente

MCP HEAD `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`; hub HEAD/base
`0d2c6b488438a77be71b39e514cd06ab11fbb95e`. Ambos têm alterações locais
preexistentes e desta rodada, sem commit. HEAD sozinho não identifica o candidato.
Agente não foi alterado nesta rodada.

Rodada em Windows/PowerShell, 2026-10-12 America/Cuiaba (UTC já 2026-10-13),
Node 24.21.0, TypeScript real 7.0.2, Vitest 5.0.3, Playwright 1.63.0,
Prisma 7.10.0 e PostgreSQL 17.11, imagem `postgres:17-alpine`.
Container exclusivo identificado por label `se7e.fixture=delegation-20261012`,
porta loopback 55440. Bancos MCP/hub separados, nomes de fixture com sufixo `_test`.
Nenhum banco operacional ou fonte cadastrada foi usado.

Migrations MCP 0001–0010 aplicadas em bancos novos e reaplicadas por checksum.
Hub recebeu suas 42 migrations no banco de fixture, incluindo somente a nova
migration aditiva de delegação; nenhuma migration aplicada foi modificada.

## Alcance implementado

- Hub emite credencial opaca de 256 bits por Client/persona/origem/época de
  credenciais, por 30 dias. Persiste hash; verifica Client ativo, prazos e
  revogação; não emite JWT nem permite acesso ao agente ou aprovação humana.
  Emissão/revogação e auditoria de metadados compartilham transação Prisma.
- MCP guarda delegação cifrada, com versão/CAS e administração pelo responsável
  autenticado. Renovação revoga a anterior; revogação local persiste mesmo com
  hub indisponível. Compensação trata falha na gravação da nova delegação.
- Token pode conceder gerenciar_fontes explicitamente. OAuth exige seleção
  adicional no consentimento; não amplia tokens ou conexões antigas. Tools
  condicionais iniciam somente cadastro/rotação de credencial da fonte.
- Setup tem código/CSRF por hash, contexto cifrado, finalidade e versões exatas,
  até 15 minutos limitado pelo access originador. GET não consome; POST exige
  Host/Origin, CSRF, responsável autenticado novamente e concessões vigentes.
- Confirmação da fonte permanece pelo hub/agente; rotação exige mesma identidade
  física. Credenciais, consumo e auditoria fazem commit/rollback juntos. Nova
  fonte não entra nas concessões existentes automaticamente.
- Console permite criar/renovar/revogar delegação e conceder gerenciar_fontes.
  Exibe estado local, sem alegar confirmação remota. Formulário descarta segredos
  após tentativa, saída ou prazo e protege edição contra saída acidental.
- Plugin candidato e instruções v2 orientam enviar link integral ao responsável,
  nunca credenciais por chat/tools. Legado e conexões existentes preservados.

## Resultados

| Verificação                                                        | Resultado                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| PostgreSQL v2 completo, 9 arquivos                                 | 136 testes aprovados                                                              |
| Setup/delegação após ajuste final do formulário, 1 arquivo         | 12 testes aprovados, incluindo conclusão OAuth                                    |
| Unidades v2, contrato fixado e pacotes, 27 arquivos                | 287 testes aprovados                                                              |
| Chromium HTTPS/OAuth e console móvel                               | 4 cenários aprovados                                                              |
| Hub, regressão completa em memória                                 | 2162 aprovados; 20 skips em 3 arquivos opcionais, sem aceite de transportes reais |
| Hub PostgreSQL/Prisma, delegação, unidade e contratos, 12 arquivos | 58 testes aprovados                                                               |
| MCP tipos/build/lint e formatação integral                         | Aprovados                                                                         |
| Hub tipos/build/lint/formatação e contract:check                   | Aprovados                                                                         |
| web:check                                                          | Lint, tipos, 28 testes e build aprovados                                          |
| node:check, compiler:check e training:check                        | Aprovados; contrato por base + snapshot, sem inventar commit upstream             |
| persona:release-check                                              | Recusa esperada, exit 1; nenhum gate liberado                                     |

Regressão ampla MCP: **1164 aprovados, 91 skips em 6 arquivos**; suites opcionais
não executadas não encerram aceite. Repetição integral passou após EPERM transitório
de staging. `docs:check`: **77 arquivos, 451 links, 19 rules, 14 gates, zero problemas**.
Contagens sobrepostas não devem ser somadas.

Casos negativos incluem Client/User distintos, outra persona/origem, credencial
opaca rejeitada como JWT, Client bloqueado, mudança de época e expiração, CSRF
incorreto, responsável diferente, concessão ausente, revogação durante verificação,
renovação invalidando setup, conclusão concorrente e rollback por falha da auditoria.
Auditoria Prisma foi conferida sem credencial/hash e com Client distinto de User;
revogar duas vezes produz somente o evento da primeira mudança.

O Chromium encontrou recusa do POST com `Referrer-Policy: no-referrer`, que gera
Origin nulo. Corrigido para same-origin somente no formulário, preservando Origin
exato e no-referrer no retorno/erro. Também foi corrigida a abertura do menu móvel
no teste e a reabertura HTTP de link consumido (fragmento isolado não faz novo GET).
Uma execução ampla encontrou EPERM transitório do Windows ao renomear staging;
a validação dirigida e a repetição integral passaram. Não foi afrouxada a recusa
de sobrescrita nem adicionado retry ao empacotador.

## Hashes dos arquivos verificados

Contrato hub 1.7.0: `4c29e33ff77407fdcd311226d447beefdce07eec0f428dfdd0f959ce5b3482a4`.
Snapshot reproduzível: `bb05c65d417343826b01e4efa91ea1e31babe31231b52315171331f747b4760d`.

| Arquivo                                                 | SHA-256                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| MCP application/persona-v2/setup.ts                     | d52ee8fb198f36786872afd54a06c1df8d797c573d9725621d4df78db1629e1e |
| MCP application/persona-v2/owner-delegation.ts          | c76fdbc278222e77517a0391e74391cf21c3b76e638a08fcc2427305206330d3 |
| MCP application/persona-v2/oauth.ts                     | ebd91dffd88b8caacf9d54b9afeba872548b3b3221becf05d4484f16817c2525 |
| MCP http/persona-v2-setup.ts                            | a7c707eec83a484418550f589f57ac31cb974994cdccdb0b1362dc3269db0501 |
| MCP plug-server/persona-owner-delegation.ts             | 6df522b9d45c0ff6d115e86ff509c8bfac32d78db2b1a7580e3f3313a025eddb |
| MCP persistence/persona-v2/security.ts                  | 7a97da0694ce85c44106f6ab251b6ce859531a12da861dd4211d643ed71493b9 |
| MCP migrations/persona-v2/0010_delegation_and_setup.sql | a0d5121b953795b38e89e1d9ec68dc310111341599e77492ac866a31f808add2 |
| Skill candidata se7e-treinamento-administracao/SKILL.md | 347031a56cf559392dc266cd22fd87e7cc21fdcb96d015670dfe12d6fcbf6229 |
| MCP tests/persona-v2/setup-delegation.postgres.test.ts  | f2787f6e17793b07ef93fa8cd0307b474e78b9705961dfe60687a3c9f29a2c64 |
| MCP tests/browser/persona-v2-oauth.spec.ts              | ad2a4fdbfd07b6b70f7c9106aa7873650c0b71ede53bc3a822b84d4fb841d3c8 |
| Hub application/services/client_delegation.service.ts   | 059fd5e28192e11ac276600a4cdbb552a69479a0abeafdfa6344c72711db9165 |
| Hub repositories/prisma_client_delegation.repository.ts | 9d830adc1e79f8d36a17c856aaafa79538a4cd4a296dafc72236d7f5d226dd67 |
| Hub migration 20261012120000_client_persona_delegations | 0cb14f8c728b7cdd6e73392476bd6cf4b1e84460526a024644a8e1f2a72a76a5 |

## Limites e limpeza

Hub/Prisma foi validado com autenticação e aprovação reais de fixture, e adapters
MCP têm testes de contrato. Na suíte MCP/Chromium, autoridade Client, delegação
e verificador de fonte são sintéticos; não são a cadeia persistente integrada
MCP/hub/agente. TLS nativo usa certificado de fixture fixado; DNS público CIMD
é simulado. Não houve instalação privada ChatGPT, conversa real, avaliação da IA
ou nova homologação dos quatro bancos nesta rodada.

Demais permissões administrativas, setup de rotação do token e credenciais de
integrações, gestão completa de conexões, worker/limpeza/rotação de cofre e aceite
integral continuam pendentes. Prova remota precede a transação MCP; não existe
garantia de commit distribuído com revogação posterior no hub. Reautenticação
humana e fail-closed permanecem. [Contrato](../oauth.md).

As suítes encerraram servidores, pools e bancos aleatórios próprios. Container
`se7e-delegation-fixture-20261012` e seu volume anônimo exclusivo foram removidos
após conferir label, imagem e ausência de compartilhamento. Nenhum outro recurso
Docker, banco ou checkout foi removido. Arquivos temporários de montagem/teste
ficam somente no cache ignorado; nenhum artefato foi distribuído.
