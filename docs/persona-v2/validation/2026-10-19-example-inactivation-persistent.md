# Inativação delegada com hub persistente — 2026-10-19

## Resultado

**6 testes aprovados em 139,26 segundos**, modo Prisma, com PostgreSQL,
SQL Server e SQL Anywhere isolados. Filtro explícito:
`inspeciona metadados pela conexão|publica adoção explícita`.
Os demais 73 casos foram excluídos pelo filtro, não homologados nesta rodada.

Cada motor inspeciona estrutura e publica adoção antes do percurso editorial.
O responsável autentica no hub real, cria delegação treinar e emite token
limitado. O teste registra explicitamente dois exemplos pelo MCP, sem executá-los.

- Duas chamadas concorrentes de inativação: somente uma altera a revisão.
- SQL, explicação, modelo, parâmetros e demais exemplos permanecem preservados.
- A publicação ativa permanece idêntica; inativar não suspende nem republica.
- ID ausente, revisão antiga e exemplo já inativo são recusados.
- Revogação diretamente no hub, ainda com registro local ativo no MCP, impede
  inativar o segundo exemplo. Leitura independente confirma rascunho intacto.

Autenticação Client, delegação e persistência do hub são reais. SQL e inspeção
de negócio passam por MCP → hub → agente. As leituras diretas do repositório
servem somente para conferir a persistência do controle MCP, sem acessar ERP.

## Candidato e verificações

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` com alterações locais.
Referência do hub validada pelo runner:
`0dc94d6990167f65e093b1fb68a8150630e2057c`.
Node 24 pelo wrapper, TypeScript 7. Provisionador: PostgreSQL 17, SQL Server
2022 Developer e SQL Anywhere 16; versões exatas dos drivers não foram
transcritas, portanto esta rodada não encerra aceite final de distribuição.

Tipos, lint dirigido, build, formatação e training:check passaram.
Docs/rules e plano restante acompanham esta evidência. Não foi necessária
correção de produção. Sem migrations, alteração de hub/agente, commit ou push.
Teardown confirmou remoção somente dos recursos da fixture. Nenhuma fonte
operacional foi usada.

| Arquivo                                             | SHA-256                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| tests/helpers/persona-chain-example-inactivation.ts | 7b74caee958a1722f6e7f9e39fd7499e23336697c1e2c09ddde81c8e1291a5da |
| tests/homologation/persona-chain.test.ts            | 83df8b3f4e55adc685b7c3b753ac4e0c89e11c23dae62395b1bf2cd2aea98797 |
| src/application/persona-v2/catalog.ts               | fa15d52370956bd58d03438b902aa5ffad65512d62dcb1f25f997735ed4f7f1f |

## Limites

A inativação nesta rodada usa Bearer delegado. Não certifica todas as mutações
editoriais, OAuth desta ação, console completo, imagem final ou IA consumidora.
HTTPS público e ChatGPT continuam manuais. Deploy e imagens de produção seguem
bloqueados; ready:false e nenhum gate encerrado.
