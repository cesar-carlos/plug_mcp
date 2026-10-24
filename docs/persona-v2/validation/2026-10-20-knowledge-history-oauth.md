# Histórico autorizado por OAuth — 2026-10-20

## Resultado

**6 testes aprovados em 232,50 segundos**, com hub Prisma e fixtures isoladas de
PostgreSQL, SQL Server e SQL Anywhere. Filtro:
`inspeciona metadados pela conexão|publica adoção explícita`.
Os outros 73 testes foram excluídos pelo filtro; não constituem aceite integral.

A inspeção, adoção e consulta usam MCP → hub → agente. Uma composição OAuth
adicional usa o mesmo controle persistente e a autoridade real do hub. O fluxo
HTTP passa por autorização, autenticação do originador, consentimento, código
com PKCE S256 e emissão de access token; chamadas usam `/mcp/chatgpt`.
Somente a validação dos metadados do cliente OAuth é substituída por fixture.

- Consentimento das duas skills permite ler as duas versões e continuar pelo cursor.
- Consentimento de uma skill mostra só sua versão e recusa âncora/cursor da outra.
- Ausência de consentimento da fonte impede leitura; skill desconhecida é recusada.
- Nenhum consentimento administrativo é necessário para essa leitura.
- Conexões equivalentes podem ler os mesmos metadados autorizados. Histórico
  não é uma proposta editorial privada da conexão e não abre conteúdo do catálogo.
- Revogar uma conexão bloqueia primeira página e continuação, preservando outra
  conexão e o Bearer originador.
- Revogar o originador bloqueia a conexão sobrevivente, continuação, conexão
  limitada e Bearer manual.

## Verificações e candidato

Tipos, lint dirigido e build passaram. Não foi necessária correção do runtime.
A alteração acrescenta cenário ao teste persistente e helper OAuth próprio,
com atualização do contrato explicativo, rules, plano e índice de evidências.

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, mais alterações locais.
O runner verificou a referência do hub `0dc94d6990167f65e093b1fb68a8150630e2057c`
e seus hashes através de training:check. Node 24 do wrapper e TypeScript 7.
Provisionador PostgreSQL 17, SQL Server 2022 Developer e SQL Anywhere 16;
versões exatas dos drivers não foram transcritas nesta rodada.

SHA-256 dos testes finais:

- `tests/homologation/persona-chain.test.ts`:
  `74171845e200bd14c3a23ede4864b15839d24abd698ed414ce72f69452276e02`.
- `tests/helpers/persona-chain-knowledge-history-oauth.ts`:
  `b649afc0304ded2ba623ff0cfe6f6d2dfd3da5b1cafe0e13f8d71c4a07bc5454`.

O lint inicial identificou três chamadas sobre resposta JSON sem tipo explícito;
a correção usa Array.from com tipo declarado, sem mudar as asserções. O lint
foi repetido com sucesso. Teardown confirmou remoção somente da fixture criada.
Nenhuma fonte operacional, migration, commit, push ou deploy foi alterado.

## Limites

Esta rodada não certifica TLS público, instalação/conversa no ChatGPT, comparação
delegada, histórico de outros tipos de skill, carga ou o candidato final.
HTTPS e ChatGPT continuam para validação manual. Manifesto permanece ready:false,
sem gates concluídos. A rodada cobre continuação com dois vínculos; paginação de
vinte itens tem evidência própria anterior, sem nova certificação por este filtro.
