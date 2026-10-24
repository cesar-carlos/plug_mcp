# Isolamento OAuth de propostas físicas próprias — 2026-10-19

## Escopo e resultado

**6 testes aprovados em 138,73 segundos**, com hub Prisma persistente, agente
e fixtures PostgreSQL, SQL Server e SQL Anywhere. Filtro explícito:
`inspeciona metadados pela conexão|publica adoção explícita`. Os outros 73 casos
foram excluídos pelo filtro; não representam aceite ou ausência de infraestrutura.

Para cada motor, o percurso inspeciona e adota conhecimento publicado antes de
testar a lista física. Duas conexões OAuth partem do mesmo token originador.
Autorização, autenticação, consentimento, troca do código com PKCE e revogação
usam as rotas HTTP v2; listagem e envio usam `/mcp/chatgpt`.

- Conexão A envia 21 propostas; duas páginas devolvem exatamente seus IDs.
- Conexão B envia uma proposta e recebe somente sua referência.
- Cursores entre A/B e entre OAuth/Bearer são recusados.
- Consentimento sem treinar não permite página inicial ou continuação.
- Releitura com conteúdo exige a conexão autora.
- Revogar A bloqueia página inicial e continuação; B e Bearer permanecem
  utilizáveis, com as mesmas propostas anteriores.
- As páginas expõem somente os metadados previstos, sem conteúdo editorial.

Não foi necessário alterar o filtro de produção: o escopo por concessão já
existente satisfez os casos. A entrega acrescenta regressão persistente.

## Limites

Apenas a validação dos metadados do cliente OAuth é substituída por fixture.
Delegação administrativa, Client, persistência das concessões e acesso remoto
às bases são reais. SQL/inspeção passam por MCP → hub → agente. Supertest não
certifica TLS público, navegador ou instalação ChatGPT; essas validações continuam
manuais. A rodada não certifica toda a matriz OAuth, carga, imagens ou IA.

Tipos, lint dirigido, build e training:check passaram. A validação documental
e formatação acompanham o relatório. Não houve migrations nem alteração de
contratos de produção, permissões, hub ou agente.

## Candidato e limpeza

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Hub fixado `0dc94d6990167f65e093b1fb68a8150630e2057c`, verificado pelo runner.
Node 24 do wrapper e TypeScript 7 do projeto. Provisionamento PostgreSQL 17,
SQL Server 2022 Developer e SQL Anywhere 16. Versões exatas dos drivers não
foram transcritas; a rodada não fecha o aceite final de distribuição.

Fixture `se7e_persona_3c9d7d1cdd99_test`: teardown e remoção confirmados,
somente recursos próprios. Nenhum ensaio em fonte operacional. Sem commit,
push, publicação de imagens ou deploy; `ready: false` e gates permanecem abertos.

| Arquivo                                       | SHA-256                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| tests/helpers/persona-chain-physical-oauth.ts | 894997db41d2ed2b8197dcca4ff1c048df4e749013f60400b93cc33d11fefa9e |
| tests/homologation/persona-chain.test.ts      | 201284201715d45c2b58920c217f1aad22c4bb32d06c1767d774711875947ff0 |
