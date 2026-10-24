# Inativação de exemplos por OAuth — 2026-10-19

## Resultado e escopo

**6 testes aprovados em 140,20 segundos**, com hub Prisma persistente, agente e
fixtures PostgreSQL, SQL Server e SQL Anywhere. Filtro explícito:
`inspeciona metadados pela conexão|publica adoção explícita`. Outros 73 casos
foram excluídos pelo filtro; esta rodada não encerra a matriz integral.

Cada motor inspeciona e adota conhecimento antes do percurso editorial. As
conexões usam as rotas HTTP v2 de autorização, autenticação, consentimento,
código PKCE e revogação; a ferramenta é chamada em `/mcp/chatgpt`.

- Consentimento com treinar e fonte permite cadastrar exemplos explicitamente e
  inativar um deles; chamadas concorrentes aplicam apenas uma revisão.
- Consentimento sem treinar ou sem fonte recusa a mesma alteração. Leitura
  independente do controle MCP comprova que a recusa não muda o rascunho.
- Revogar a conexão impede inativar outro exemplo com revisão ainda vigente;
  estado persistido permanece intacto.
- Conteúdo dos exemplos, modelo, parâmetros e publicação ativa são preservados.
- Outra conexão OAuth e o Bearer originador permanecem utilizáveis na listagem
  editorial. Não se presume revogação global do token.

A mutação desta rodada usa OAuth real com concessões persistentes e delegação
revalidada no hub. Somente os metadados do cliente OAuth são fixture. Supertest
não certifica HTTPS público, navegador ou instalação ChatGPT; esses itens seguem
manuais. Exemplos não são executados. SQL/inspeção do percurso seguem MCP → hub
→ agente; leituras diretas conferem apenas o banco de controle MCP.

## Verificações e candidato

Tipos, lint dirigido, build, formatação e training:check passaram. Nenhuma
correção de produção foi necessária. Regressão, rules, plano e documentação
foram atualizados, sem migrations ou alteração de hub/agente.

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` mais alterações locais.
Hub fixado e verificado pelo runner:
`0dc94d6990167f65e093b1fb68a8150630e2057c`. Node 24 pelo wrapper e TypeScript 7.
Provisionador PostgreSQL 17, SQL Server 2022 Developer e SQL Anywhere 16;
versões exatas dos drivers não foram transcritas. Não fecha distribuição final.

| Arquivo                                             | SHA-256                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| tests/helpers/persona-chain-example-inactivation.ts | 178ad49d9872d9680e8668dc2b73cc39139e56a6d9b129e9803e60888a2bdf2a |
| tests/helpers/persona-chain-physical-oauth.ts       | 63d2c326c65d2f2008a29f10a64e092f2e101130c8f8a1c6b7c4a500ad2079b3 |
| tests/homologation/persona-chain.test.ts            | 51ed5b07f1a06cdeb5f53ff4671be3878404e3f841d60a87dcf8d81e6db3d1d7 |

Teardown confirmou remoção somente dos recursos próprios. Sem fontes
operacionais, commit, push, imagens de produção ou deploy. `ready:false` e
gates abertos; demais jornadas editoriais, console e IA exigem evidências próprias.
