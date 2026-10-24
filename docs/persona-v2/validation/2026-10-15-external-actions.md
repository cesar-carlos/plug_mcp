# Referência do hub e ações externas — 2026-10-15

Evidência local de desenvolvimento. `ready: false`; nenhum gate encerrado.

## Referência revisada

Pin MCP/CI atualizado de `46dd40bbae0ca407821ec33de3bfe4108d407faf` para
`693da92a334c98ae911c329d52006456ce768b09`, após revisão de ancestralidade,
diff, contrato commitado e incorporação reversa do snapshot histórico. As mudanças
intermediárias abrangem dependências, CI, testes e metodologia de benchmarks;
não alteram fontes `src` ou schemas/contrato do hub. A última revisão acrescenta
cobertura explícita do agente instalado v1.8.6.

Contrato JSON conserva SHA-256
`a8e8bc82a9b6d995c8637bf47bc35e17d44c5b21aba60889be25654ac60f4e60`.
Snapshot histórico conserva
`7f1b746a782b5023aed562cb40edbf72dbe39a15498fcba2e36a949604aa1948`.
`training:check` passou com HEAD exato, sem relaxar verificações, reaplicar patch
ou gerar baseline novo. Isso não certifica CI ou comportamento integral do hub.
A rodada de benchmark/CI do hub é conduzida separadamente e exige aceite próprio.

## Entrega

Ações REST e MCP remotas com conteúdo preparado cifrado, aprovação humana
aplicável pelo Client responsável, fingerprint imutável, claim CAS durável antes
do efeito e registro de resposta/resultado desconhecido. Credencial e contrato
permanecem fixados. Revogação bloqueia envio ou entrega; evidência recebida depois
do efeito ainda é registrada. Novo consentimento/access OAuth não prolonga a
preparação original. Desconhecido não volta a executável após reinício.

Migration aditiva 0025 separa journal/aprovação externos das operações SQL,
com FKs por persona, imutabilidade e auditoria de metadados. Payload e saída são
cifrados e ligados ao ID/fingerprint. Sem alteração de migrations aplicadas.
O console oferece listagem, revisão e aprovação na área Integrações; o pacote
privado tem instruções e catálogo offline correspondentes, sem alterar conexões
instaladas. [Contrato e limites](../external-integrations.md).

## Validações

- PostgreSQL **47/47**, 24,46 s, com baseline novo/reaplicação. Novos casos cobrem
  preparação MCP, aprovação HTTP/CSRF/hash, claim concorrente, resposta perdida,
  reinício do serviço, revogação antes/depois do efeito, cancelamento, expiração,
  rotação, aprovação adicional, imutabilidade SQL e consentimento/refresh OAuth.
  Autoridade e efeito do provedor são sintéticos, com journal PostgreSQL real.
- Unitários v2, contrato e pacote: rodada de **538 testes**, com 537 aprovados e
  uma falha de correspondência entre tools declaradas/citadas no pacote. Corrigida
  a skill sem relaxar o validador; rechecagem do arquivo afetado passou **24/24**.
  As demais suítes passaram, incluindo REST/MCP com ação por TLS local real,
  schema alterado, headers reservados, DNS/redirect/limites e claim antes do envio.
- Chromium **1/1**, 9,2 s: aprovação em 390 px, teclado/checkbox, parâmetros
  visíveis, confirmação do estado no banco e desconhecido sem botão de aprovação.
  Backend real v2 e PostgreSQL de fixture; autoridade/provedor sintéticos.
- Frontend: lint, tipos, **32/32 testes** e build passaram. Tipos/build do servidor,
  lint, Node **24.21.0**, TypeScript real **7.0.2**, formatação e documentação
  verificados. O sandbox Windows impediu temporários do frontend; a repetição
  local autorizada passou, sem skips de aceite. O reforço final da gramática plana de ações MCP passou em 8/8 testes dos adapters/TLS, com nova checagem de tipos, lint e build; constraints não suportadas são recusadas antes do efeito.
- PostgreSQL **17.11**, contêiner dedicado com nome/rótulo próprios. Nenhuma fonte
  operacional, credencial do usuário ou provedor externo real foi utilizado.
- Fixture dedicada e manifesto de credenciais removidos ao final, conferindo nome
  e rótulo. Guard de release recusou publicação conforme esperado.

Não houve teste SQL de negócio pela cadeia dos motores nesta rodada. A rodada
74 de outro chat usa snapshot próprio e não certifica automaticamente estes
arquivos posteriores. HTTPS público e instalação/conversa ChatGPT continuam
para validação manual. Conciliação automática por provedor, runner CLI, editores
completos e jobs de retenção/rotação permanecem pendentes.

## Candidato local

Commit-base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais
preservadas. Inventário parcial SHA-256 do conteúdo final:

| Arquivo                                                                | SHA-256                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| src/application/persona-v2/external-actions.ts                         | `a68c1a68ba9abf041c0767c35390e02c05601edc1ffb11c37162f95bb83aab94` |
| src/domain/persona-v2/external-contract.ts                             | `e63a202e87cede42a6768093ab04f09be5c395cf76feb249f6dc61c18403d098` |
| src/infrastructure/persistence/persona-v2/external-actions.ts          | `547d47e43b38bf62092c1d0c20774d05ff13ad60f6f7612da545f05d660259ef` |
| src/infrastructure/persona-v2/external-adapters.ts                     | `5efbd823a49abae29fd5bfff6120d0b328c3a74e617a84f1bce53228b1d13b55` |
| migrations/persona-v2/0025_external_actions.sql                        | `d17ba66eb632707009f95c4652f75afd88274ef7d4d112689c39a4a76e748086` |
| src/application/use-cases/shared/treinamento-base.ts                   | `3449fdcaf1046d04d0bfaa8516b1b1f4da8789c0ae86b1def78d93f693b3ea7e` |
| web/src/persona-v2/ExternalActionsPanel.vue                            | `40ce7d1b6dd8a6987f500ce68e1fcf872bbaba9623b44fc6545d73201e6e247b` |
| src/infrastructure/plugins/tool-catalog.ts                             | `338fc6f22c84d5898b6a8d2ece349ed07a89fa3f2c78c66fca3999e621171e36` |
| plugins/se7e-persona-v2/skills/se7e-treinamento-administracao/SKILL.md | `d774515bd0aee912535481e82f541428a17bec5e0650419de53bc9a996213cf8` |

Nenhum commit/push, publicação de imagem, instalação de plugin ou deploy.
[Plano restante](../remaining-plan.md) e [matriz de aceite](../acceptance.md).
