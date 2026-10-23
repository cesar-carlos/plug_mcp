# Referência do hub e console pela cadeia persistente — 2026-10-15

Evidência de desenvolvimento; `ready: false`, treze gates exigidos e nenhum
encerrado. Não autoriza deploy, publicação de imagem ou corte.

## Revisão da referência

O hub publicou o commit `46dd40bbae0ca407821ec33de3bfe4108d407faf` contendo as
alterações antes representadas pelo snapshot sobre
`bfb40becd42c5452b19b0df13698d212a0238ddc`. A checagem reversa do patch passou
sem modificar o checkout. O contrato commitado e o empacotado são idênticos:
SHA-256 `a8e8bc82a9b6d995c8637bf47bc35e17d44c5b21aba60889be25654ac60f4e60`.
O patch histórico permanece intacto, SHA-256
`7f1b746a782b5023aed562cb40edbf72dbe39a15498fcba2e36a949604aa1948`.

`HUB_CONTRACT_REF` e checkout do CI agora fixam o commit publicado. O CI não
reaplica o patch: verifica sua incorporação com `apply --reverse --check`.
`training:check` exige o HEAD exato, ancestralidade da base histórica, hash do
patch e bytes do contrato tanto no commit quanto no filesystem. Nenhum baseline
de compatibilidade foi regenerado e não se aceitam automaticamente commits
futuros só por conservarem o arquivo de contrato.

A comparação dos metadados de compatibilidade entre 1.1.0 e 1.15.0 preservou
as sete operações anteriores, campos de resposta e tipos, enumerações,
obrigatoriedade e limites declarados dos campos de requisição examinados.
Quatro operações foram acrescentadas: perfil Client e criação/listagem,
verificação e identificação da delegação administrativa. Isso é conferência
estática desses metadados, sem certificação de todas as variantes de schema ou
compatibilidade comportamental integral. `contract:check` também passou no hub.

A referência atual altera o hash derivado da base comum para
`ca729cec49a70e6348f81221a697035d5080c7c12588eeeb06089986a5a47583`.
Não reescreve snapshots, casos, publicações ou migrations existentes, nem
transfere contratos de identidade/autoridade do legado para a v2.

## Percurso real no navegador

O novo teste usa Chromium contra a composição HTTP v2 da própria cadeia, com
hub PostgreSQL/Prisma, ClientAgentAccess aprovado, agente/cofre persistentes e
drivers nativos. Não utiliza o servidor de UI com hub sintético.

O companion MCP publica o endereço loopback realmente reservado como
`PUBLIC_BASE_URL`; navegador e testes HTTP enviam Host/Origin correspondentes,
preservando CSRF. Não há reescrita de headers, interceptação de requests ou
override de gateway. O console é servido pelo build empacotado em `web/dist`.

Percurso: login Client, persona nova, três vínculos PostgreSQL/SQL Server/SQL
Anywhere pelos cinco campos técnicos, estrutura e exemplos privados, prazo
explícito, preview/confirmar publicação, token restrito, descoberta, validação
SQL e consulta. Confere o valor sintético esperado e a página, depois resultado
vazio e recusa de DELETE na interface de leitura. Segredos entram pelos
formulários, não ficam em armazenamento do navegador e não são incluídos em
traces, screenshots ou mensagens de falha.

Consultas sem casos obrigatórios seguem o aviso existente; este cenário não
aprova semanticamente treinamento comercial nem substitui os runners de
publicação. Os runners e demais regressões seguem na mesma suíte persistente.

## Verificações

- 497 testes de contrato/persona-v2 e 16 da base de treinamento passaram.
- Tipos, lint, builds servidor/console e `training:check` passaram.
- Cadeia persistente: **74/74**, em 516,88 segundos, incluindo o percurso
  Chromium descrito acima e as regressões nos três motores.
- Integrações PostgreSQL: **195/195**, em 65,76 segundos.
- `docs:check` e formatação dos arquivos alterados passaram. O guard de release
  continua recusando liberação: treze gates obrigatórios, nenhum encerrado.

O [inventário do candidato](2026-10-15-hub-pin-real-console-files.json) registra
commits-base, hashes de fontes/contratos/assets, motores e drivers. O checkout MCP
contém alterações locais preservadas; o inventário é parcial e não representa
um commit integral. Node 24.21.0 e TypeScript 7.0.2 foram usados. Os hashes dos
três drivers foram reconferidos antes da captura.

A fixture `se7e_persona_a118bc3ab5a1_test` foi removida pelo procedimento com
verificação de propriedade após a captura. Nenhum recurso operacional foi
removido. A rodada não encerra nenhum gate nem substitui o aceite do candidato
final da plataforma.

## Limites

Ambiente loopback com fixtures isoladas. Não certifica DNS/TLS público, proxy,
Redis distribuído, instalação desktop do agente, ChatGPT privado, avaliação da
IA, acessibilidade integral ou operação em produção. Material Data7 comercial
continua dependendo de fornecimento e revisão. Nenhuma fonte cadastrada pelo
usuário recebe escrita. Contrato e continuidade: [cadeia](../homologation-chain.md),
[console](../console.md), [plano restante](../remaining-plan.md) e [aceite](../acceptance.md).
