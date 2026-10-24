# Histórico misto e comparação por OAuth — 2026-10-20

## Resultado

Três cenários aprovados pela cadeia persistente, em 62,93 segundos; início
09:57:28 (America/Cuiaba). Filtro explícito: casos nativos com rollback.
Os outros 76 testes não foram selecionados; não é uma rodada integral.
O removedor confirmou remoção somente da fixture indicada.

Tipos, lint dirigido e formatação passaram. Não foi necessária alteração do
runtime: foi completada a matriz de homologação do comportamento existente.

## Alcance

PostgreSQL, SQL Server e SQL Anywhere dedicados, hub Prisma, MCP do checkout e
agente real de fixture. Publicações SQL são aprovadas por runner e adotam
conhecimento inspecionado pela cadeia. Vinte consultas e duas operações formam
o histórico, com ordem exata e paginação 20+2, sem duplicação.

OAuth percorre authorize/authenticate/consent/token com PKCE e concessões
persistidas. Metadados do cliente são fixture. Asserções adicionais verificam:

- Comparação entre operação e consulta, direção inversa e grantsExecution:false.
- Ausência de fonte ou consentimento insuficiente recusam comparação/continuação.
- Outra conexão com o mesmo alcance pode ler a mesma página autorizada.
- Revogar uma conexão bloqueia seu cursor e comparação; outra conexão e Bearer
  continuam permitidos.
- Revogar o originador bloqueia conexões derivadas e o Bearer.
- Leitura e comparação não aumentam sql.operation.execute.

## Identificação

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f, com alterações locais.
training:check confirmou hub 0dc94d6990167f65e093b1fb68a8150630e2057c e contrato
a8e8bc82a9b6d995c8637bf47bc35e17d44c5b21aba60889be25654ac60f4e60.
Node 24 do wrapper; provisionador PostgreSQL 17, SQL Server 2022 e SQL Anywhere
16, driver PostgreSQL copiado do cache do projeto. Builds detalhados dos motores
e drivers não foram recapturados nesta rodada.

SHA-256 dos testes:

- tests/helpers/persona-chain-knowledge-history-oauth.ts:
  DF46F57CDB284F262003165158289A939D8F17ED45B596AC339B72F6C6BDBC50.
- tests/homologation/persona-chain.test.ts:
  F83D747BC471AC7A583AFD1EC85707B5D13C3B9FC87F66267D69D1EC1CD40540.

## Limites

Não certifica imagem final, cliente ChatGPT, HTTPS público, avaliação da IA ou
toda a matriz concorrente. A paginação não reserva snapshot distribuído.
Nenhum banco operacional foi utilizado; nenhuma imagem publicada ou deploy
executado. Gates continuam abertos e ready:false permanece.
