# Conhecimento de operações SQL por OAuth — 2026-10-20

## Resultado

**3 testes aprovados em 46,14 segundos**; 76 casos excluídos pelo filtro, sem
representar aceite integral. Tipos, lint dirigido e build passaram. Não foi
necessária correção do runtime. Teardown confirmou remoção somente da fixture
criada nesta rodada.

## Escopo

Histórico e comparação de duas skills de operação SQL com versões distintas do
mesmo padrão. Publicações aprovadas pelo runner real em fixtures isoladas de
PostgreSQL, SQL Server e SQL Anywhere, com hub Prisma e persistência MCP.
Filtro da rodada: `casos nativos com rollback`.

OAuth percorre authorize/authenticate/consent/token com PKCE S256 e acesso por
`/mcp/chatgpt`. Somente a validação de metadados do cliente OAuth é substituída
por fixture. Inspeção, testes e execução usam MCP → hub → agente; histórico e
comparação leem snapshots no MCP e não executam DML.

Asserções reutilizam o helper de conhecimento:

- Concessão das duas skills mostra ambas as versões e permite continuação.
- Consentimento limitado a uma skill não revela a outra nem aceita sua âncora/cursor.
- Ausência de fonte impede leitura e comparação; não é exigido consentimento administrativo.
- Comparação fixa as referências, preserva direção e inverte before/after ao inverter os lados.
- Comparação idêntica não gera diferenças; skill desconhecida é recusada.
- Revogação individual impede leitura/comparação, preservando outra conexão e Bearer.
- Revogar o originador bloqueia os derivados e o Bearer.
- Contagem de sql.operation.execute não aumenta durante leitura/comparação OAuth.

## Candidato

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, mais alterações locais.
Runner verificou training:check e hub `0dc94d6990167f65e093b1fb68a8150630e2057c`.
Node 24 e TypeScript 7 do projeto. Provisionador PostgreSQL 17, SQL Server 2022
Developer e SQL Anywhere 16. Builds exatos dos drivers não foram transcritos.
SHA-256 de `tests/homologation/persona-chain.test.ts`:
`219132a95c2889e0ce4133723251fe43048da7d84cdfa37d40fc35620672f3d3`.

## Limites

Não certifica paginação ampliada com operações, comparação mista consulta/operação,
matriz concorrente integral, imagem final ou IA consumidora. HTTPS público e
ChatGPT seguem para validação manual. Nenhuma fonte operacional, migration,
commit, push ou deploy foi alterado. Manifesto mantém ready:false e gates abertos.
