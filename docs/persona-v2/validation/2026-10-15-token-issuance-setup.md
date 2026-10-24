# Emissão limitada por setup — 2026-10-15

Evidência local de desenvolvimento. `ready: false`; nenhum gate encerrado.

## Entrega e autoridade

`iniciar_emissao_token_persona` propõe nome, validade, concessões e teto para
delegar. Proposta fica cifrada/imutável no setup; somente o responsável autenticado
confirma no navegador. O servidor valida os limites na criação do link e antes
de emitir, incluindo consentimento OAuth e prazo do access originador. POST não
aceita substituição da proposta. Setup, token e auditoria fazem commit juntos.

Bearer aparece somente na resposta POST, com mascaramento, cópia, revelação
temporária e descarte. MCP devolve apenas link. Emissão preserva originador e
conexões; o novo token manual é gerenciável separadamente. Não se promete
revogação em cascata entre tokens manuais. Não houve migration: finalidade
textual, envelope cifrado e constraints existentes já comportam o contrato.

## Evidências

- PostgreSQL dedicado: **35/35**, 45,84 s. Quatro novos cenários de emissão e
  extensão do cenário OAuth: concessões/prazo excessivos, consentimento ausente,
  proposta adulterada, CSRF/responsável, revogação, concorrência, rollback de
  token/consumo por falha na auditoria e ausência de Bearer pela tool.
- Chromium/TLS de fixture: **6/6**, 7,3 s. Revisão da proposta, confirmação,
  entrega única, segredo mascarado, replay sem recuperação e preservação do
  originador; regressões dos setups anteriores.
- Testes unitários: **521/521** (496 persona-v2 e 25 de plugin), em 27,18 s.
- Tipos, lint, build, formatação e validação documental aprovados. O guard de
  liberação permanece bloqueado, como esperado; nenhum gate foi encerrado.
- Contêiner PostgreSQL dedicado removido após confirmação de nome e rótulo;
  manifesto temporário com credenciais de fixture removido.

Node 24.21.0, TypeScript 7.0.2 e PostgreSQL 17 de fixture. Autoridade remota
sintética; nenhum SQL enviado a bases de negócio. HTTPS público/DNS e conexão
ChatGPT ficam para validação manual. Esta rodada não certifica cadeia real
hub/agente, avaliação da IA ou produção.

Commit-base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais
preservadas. Inventário parcial SHA-256:

| Arquivo                                            | Hash                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| src/domain/persona-v2/token-issuance.ts            | `2b2a7d10937134bca5873039393df2c0be62e1662b54f2daf6de6f3876b2f224` |
| src/application/persona-v2/setup.ts                | `5e0d160613e5606b83db8e880b4a2d00dcb969a265f233d63fa09e0f48800f0e` |
| src/infrastructure/http/persona-v2-setup.ts        | `abaadcf7d606d4dc261572483a0cf8affe00f87f91c8c5c49fe39f4b68daa117` |
| tests/persona-v2/setup-delegation.postgres.test.ts | `6bf4ba843d54a83cd8fbd9dce74b212fa95c168966a7d40e82dd4b7baad4f2af` |
| tests/browser/persona-v2-oauth.spec.ts             | `9f20b0bb51cffa2a3a9876a4d2136dfe786d0bce0ccc8df0092f5424b02c98a6` |

[Contrato](../oauth.md#setup-de-emissão-com-concessões-limitadas),
[pendências](../remaining-plan.md) e [aceite](../acceptance.md).
