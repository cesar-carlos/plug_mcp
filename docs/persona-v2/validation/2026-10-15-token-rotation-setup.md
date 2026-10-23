# Setup de rotação do token — 2026-10-15

Evidência de desenvolvimento; `ready: false`, nenhum gate encerrado.

## Entrega

Tool condicional `iniciar_rotacao_token_persona` recebe objeto vazio. Exige
gerenciar_tokens no token, consentimento e delegação vigente. O alvo é o token
originador, nunca um identificador escolhido pela IA. Reautenticação do mesmo
responsável e confirmação explícita acontecem no navegador.

Consumo, novo hash, versão, auditoria e revogação dos derivados OAuth são
atômicos. Permissões, limites, delegação, nome e validade são preservados.
O novo Bearer não é persistido em claro nem entregue por MCP: aparece somente
no POST do navegador, mascarado, com cópia/revelação e descarte. Perda da
resposta exige console; link consumido não recupera o segredo.

Não foi necessária migration: a finalidade já é textual e o contexto cifrado;
as constraints existentes mantêm identidade e imutabilidade/consumo. Nenhuma
migration aplicada ou contrato legado foi modificado. Base v2, catálogo de tools
e skill local foram sincronizados; pacote remoto não foi publicado.

## Verificação

- PostgreSQL dedicado: **31/31**, 16,51 s; inclui sete novos cenários de rotação,
  concorrência entre links, CSRF/confirmação/responsável, permissão/consentimento,
  invalidação access/refresh, expiração/delegação e rollback por falha na auditoria.
- Chromium com TLS de fixture: **5/5**, 12,3 s; inclui formulário da rotação,
  segredo mascarado, revelação, ausência de storage e replay sem recuperação.
- Regressão unitária: **490/490 persona-v2**; pacote **25/25**. A primeira rodada
  conjunta teve 514 aprovações e uma falha de permissão ao criar link simbólico
  no sandbox. Os 25 testes do pacote passaram ao repetir fora dessa restrição,
  sem remover o caso nem relaxar o validador.
- Tipos, lint, build, formatação e `docs:check` passaram. O guard de release recusou publicação conforme
  esperado. Node 24.21.0 e TypeScript 7.0.2.

Commit-base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, checkout com alterações
locais preservadas. Inventário parcial SHA-256 do candidato testado:

| Arquivo                                               | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| src/application/persona-v2/setup.ts                   | `5247a48ebb4adedf6c96417e4106e0e60041960fa0dba267f89f07fa533e4c5f` |
| src/infrastructure/http/persona-v2-setup.ts           | `e09961799be89640143a3418d3de3bf55b240a2c6892244a10bec9212837154b` |
| src/infrastructure/mcp/persona-v2-http.ts             | `0ef9613bb4f98594ef620ba820dbe52603efddc03548e42adfe7f6f72b90c9b9` |
| src/infrastructure/persistence/persona-v2/security.ts | `7a5848b29c949f6f5014c3442c0aac949e16b7c388c572064329fdc19f73ae9b` |
| tests/persona-v2/setup-delegation.postgres.test.ts    | `b2120bb0a1203fcdf0f2e235f5a0d5fb4d54cd353101499eeb5004583c9191c6` |
| tests/browser/persona-v2-oauth.spec.ts                | `ffe2d8fcede4d10eddf9e1c831e3e311343ff0edb2de379ba8740c1171cfd219` |

Autoridade remota é sintética nestes testes; PostgreSQL, transações, formulários
e TLS local são reais. Não houve SQL em bases de negócio ou conexão ao hub de
produção. A suíte cria bancos próprios e remove-os ao terminar. O container
temporário exclusivo foi removido após os testes, com conferência de propriedade.

HTTPS público, DNS/proxy e conexão no ChatGPT continuam para validação manual.
Esta rodada não certifica toda a cadeia MCP/hub/agente, instalador ou avaliação
da IA. Não há promessa de atomicidade distribuída entre hub e MCP.

[Contrato e recuperação](../oauth.md#setup-de-rotação-do-próprio-token),
[pendências](../remaining-plan.md) e [aceite](../acceptance.md).
