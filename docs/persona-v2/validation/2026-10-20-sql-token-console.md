# Concessões SQL no console — 2026-10-20

## Candidato e escopo

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
O commit-base sozinho não identifica este candidato. SHA-256 dos arquivos:

| Arquivo                                        | SHA-256                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `src/domain/persona-v2/operation-effects.ts`   | `7A59670A57981D4529D6299803726F7318E33F1520B951B4DD69453BBFF7E87F` |
| `web/src/persona-v2/publication-grant.ts`      | `99A41037BDAD969F40A1D70B152D344BAE995ABB642234213B9411DA19C2A696` |
| `web/src/persona-v2/publication-grant.test.ts` | `CA3D4B569308E660418525E125BA3A79A82CD56BC6D0B88B532E0D8E3944D4C6` |
| `web/src/persona-v2/PersonaConsole.vue`        | `5E7AC00A7CE3526DDC1AEE5CEA4E8636737BCB3A3997B60A0C7D5E8A44D66BFD` |
| `web/src/persona-v2/TokenManager.vue`          | `3D2727FB83DC2CE2CD0DC104D1C3E9CA0ACA8625AB452CDE07214B271D2B0A1D` |
| `tests/persona-v2-browser/persona.spec.ts`     | `6BCCB6C55D749903942E0A260E1B6BC529294D49EA2046485EBDAB99CFEDDDB9` |

Emissão e edição de tokens incluem operações SQL publicadas, com efeitos e
capabilities exatos, seleção explícita e aprovação adicional inicial.
A função de efeitos foi extraída da autoridade SQL existente para compartilhar
a regra com a apresentação, sem substituir a autorização do servidor.
Publicações suspensas/incompletas são recusadas.

## Rodada

Comandos executados pelo wrapper Node do projeto:

- `npm run typecheck` e `npm run typecheck --prefix web`: passaram.
- `npm run lint --prefix web`: passou.
- `npm run test --prefix web`: 22 arquivos, 81 testes passaram, incluindo cinco
  casos de concessões, efeitos auxiliares, deduplicação e recusa.
- `npm run build --prefix web`: passou; avisos de anotações de comentários do
  Zod/Rollup não impediram a geração.
- `npx playwright test --config playwright.persona-v2.config.ts --grep "edita operação SQL, casos e publicação"`:
  dois testes passaram em 12,5 segundos, para somente parâmetros e SQL adaptável.

Chromium percorreu edição/casos/publicação e emissão do token pela interface.
Conferiu UPDATE, aprovação adicional e preparação posterior com o Bearer emitido.
Não houve execução de lançamentos pela interface nessa rodada. Os testes usam
PostgreSQL 17 dedicado, runner isolado e autoridade hub sintética, não a cadeia
persistente dos três motores. O container aleatório criado pela rodada foi
removido no finally e a variável de conexão foi descartada.

A tentativa dentro do sandbox falhou no carregamento de módulos temporários
Vitest (ENOENT), antes de executar cinco suítes; a repetição fora do sandbox
passou integralmente. O Docker também exigiu execução fora do sandbox.

## Limites

Não certifica edição visual completa de tokens, concorrência/revogação integral,
serviço operacional, SQL Anywhere real, HTTPS público, ChatGPT ou avaliação da IA.
Concessões de integrações externas no formulário continuam pendentes.
Relaciona-se a `oauth-and-console` e `identity-and-authorization`, sem encerrá-los.
Deploy permanece bloqueado, com `ready:false`.
