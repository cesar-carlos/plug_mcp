# Adapters de consulta externa — 2026-10-15

Rodada local de desenvolvimento, sem aceite de produção. `ready: false`.

## Entrega e alcance

REST GET e MCP remoto com contrato publicado, casos obrigatórios, preview,
calendário humano e concessões por operação/skill. OAuth intersecta concessões.
Credencial própria cifrada; rotação bloqueia contratos anteriores. DNS público
fixado no socket TLS, sem redirect/retry, limite de bytes/prazo e revalidação
antes do envio e da entrega. Regras e limites em
[integrações externas](../external-integrations.md).

TLS local usa certificado próprio de fixture e injeção restrita ao teste para
mapear o nome público ao servidor isolado. Produção não tem configuração de
resolver/CA/porta alternativos. REST/MCP remoto de fixture não certificam um
provedor externo real. A suíte PostgreSQL usa autoridade e transporte de consulta
sintéticos; não constitui homologação SQL pela cadeia hub/agente.

## Evidência

- Unitários persona-v2 e pacote: **530/530**, 48 arquivos, 31,19 s. Incluem DNS
  misto/privado, redirect, tamanho, timeout, alteração de schema, campos extras,
  headers reservados e recusa de ações. REST e protocolo MCP também passaram por
  servidor TLS local real, além das verificações com transporte sintético.
- PostgreSQL: **41/41**, 29,50 s. Publicação exige casos/relatório/prazo atuais,
  confirma hash uma vez e não amplia tokens. Ausência de operação/capability,
  aprovação adicional, limites, consentimento incompleto, revogação durante
  resposta e rotação de credencial são cobertos. Baseline novo e reaplicação.
- Tipos e build aprovados. Lint completo apontou duas correções finais sem mudança
  de comportamento; os arquivos corrigidos passaram na rechecagem. Formatação
  dos arquivos alterados aprovada. Documentação: 118 arquivos e nenhum problema.
- `training:check` **bloqueado**: hub em
  `ac609ef886e07c822f2320b63d41d3d2977a4f33`, referência MCP em
  `46dd40bbae0ca407821ec33de3bfe4108d407faf`. O hash do JSON do contrato continua
  igual ao pin: `a8e8bc82a9b6d995c8637bf47bc35e17d44c5b21aba60889be25654ac60f4e60`.
  Revisão coordenada pendente, sem atualização automática da referência.
- Guard de release recusou publicação conforme esperado. Sandbox impediu leitura
  do hub e arquivos temporários de testes; verificações locais autorizadas foram
  executadas fora dessa restrição. Nenhum skip de aceite.
- Contêiner PostgreSQL dedicado e manifesto com credenciais removidos após conferir
  nome/rótulo. Node 24.21.0, TypeScript 7.0.2 e PostgreSQL 17 de fixture.

Commit-base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais
preservadas. Nenhum commit, push, imagem publicada ou deploy. Sem alteração de
migration aplicada ou contrato do hub. Fixture dedicada com nome/rótulo exclusivos;
nenhuma credencial ou base operacional utilizada.

Inventário parcial SHA-256 do conteúdo final (as duas correções finais de lint
foram rechecadas sem repetir as suítes de comportamento):

| Arquivo                                                    | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| src/domain/persona-v2/external-contract.ts                 | `e89a40e256ebd952998c2dc5e5063cbcbcb0520b65e783e6e083cd8a23a09537` |
| src/application/persona-v2/external-integrations.ts        | `d3de6e3eba25b6417a0718f7a1a877886a0f97cf10a22d4b16f8541d80bff56b` |
| src/application/persona-v2/knowledge-maintenance.ts        | `e751175b45c7dfbffa94cae393d09eb0cba6524ceacd93ff3eb981e48d799174` |
| src/infrastructure/persona-v2/external-http.ts             | `494705bd61eae006dbf15bfc72b4dc06a5b861510e028b79b81b8a5e2494344a` |
| src/infrastructure/persona-v2/external-adapters.ts         | `a961700f12002298f8c5d1a9ede0403474430ae628a060ce99addf41f69d8721` |
| src/infrastructure/persistence/persona-v2/external.ts      | `294bae39be20ffa6676a899b96e914387eefb4a6b6ae4b210105091340c8e982` |
| src/application/persona-v2/administrative-authorization.ts | `fe64e511f6fa52a2edce7069e2a1d6603970799eda519346851735515ed3e3b2` |
| src/domain/persona-v2/integration-credential.ts            | `a55c8a231ea8e9b85cad7ae51c5b6d2f9dc291b1e7491e50c5f4bdcd195193f3` |
| tests/persona-v2/setup-delegation.postgres.test.ts         | `a4b8de71184e01fc88285ff0f33b8b5f988c525b8da2f4a68dd430d2a7dd17e3` |

## Limitações

Ações com efeitos, editor/runner completo no console, CLI do runner externo,
importação OpenAPI, descoberta administrativa e homologação dos provedores ainda
pendem. HTTPS público e conexão ChatGPT permanecem para validação manual.
O runner interno não oferece endpoint para consumidores aprovarem relatórios;
execução técnica não substitui revisão semântica. Não há promessa de completude
do resultado externo ou certificação da IA consumidora.

[Plano restante](../remaining-plan.md) e [aceite](../acceptance.md).
