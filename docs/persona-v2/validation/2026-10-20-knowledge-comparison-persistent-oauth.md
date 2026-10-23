# Comparação por OAuth na cadeia persistente — 2026-10-20

## Resultado

**6 testes aprovados em 148,32 segundos**; 73 casos excluídos pelo filtro, sem
representar aceite integral. Tipos, lint dirigido, build e formatação passaram.
Teardown confirmou remoção somente da fixture criada. Nenhuma correção do
runtime foi necessária.

## Escopo

Rodada dirigida com hub Prisma, controle MCP persistente e fixtures isoladas de
PostgreSQL, SQL Server e SQL Anywhere. Filtro:
`inspeciona metadados pela conexão|publica adoção explícita`.

A inspeção, adoção de duas versões e consulta real usam MCP → hub → agente.
A comparação lê os snapshots autorizados no MCP; não executa SQL de negócio.
OAuth utiliza autorização, autenticação, consentimento, código com PKCE S256,
access token e `/mcp/chatgpt`. Somente a validação dos metadados do cliente OAuth
é substituída por fixture. Não representa TLS público ou instalação no ChatGPT.

## Asserções

- Referências de ambas as versões correspondem ao histórico autorizado.
- Direção reversa troca os conteúdos anterior/posterior; mesma skill não tem diferenças.
- Consentimento sem uma das skills ou sem fonte recusa a comparação.
- Skill desconhecida é recusada, sem revelar existência de outro recurso.
- Conexões equivalentes e Bearer manual recebem a mesma comparação autorizada.
- Revogar uma conexão impede comparações, preservando outra e o originador.
- Revogar o originador bloqueia seus derivados e o Bearer manual.
- Suspender o perfil bloqueia a comparação dependente; comparação do vínculo
  independente continua disponível.
- A comparação não concede execução nem navegação no catálogo inteiro.

## Candidato e limites

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, mais alterações locais.
Referência do hub verificada pelo runner/training:check:
`0dc94d6990167f65e093b1fb68a8150630e2057c`.
Node 24 e TypeScript 7 do projeto. Provisionador PostgreSQL 17, SQL Server 2022
Developer e SQL Anywhere 16. Drivers: psqlODBC da fixture, ODBC Driver 18 para
SQL Server e SQL Anywhere 16; builds exatos não foram transcritos nesta rodada.

SHA-256 dos arquivos de teste:

- `tests/homologation/persona-chain.test.ts`:
  `279bca65a7d78e4c9efa463bb67df1faa4d4ee3fa942e9be455d0d2c60565c7c`.
- `tests/helpers/persona-chain-knowledge-history-oauth.ts`:
  `f611873a37ac93e4ebbc25589dd472a58de376129b85f3588d472af9c999dbf3`.

A rodada não certifica a matriz concorrente integral, outros tipos de skill,
carga, imagem final ou avaliação da IA. HTTPS/ChatGPT permanecem manuais.
Deploy segue bloqueado, ready:false e nenhum gate concluído. Não houve alteração
de runtime, migration, commit, push ou publicação de imagens.
