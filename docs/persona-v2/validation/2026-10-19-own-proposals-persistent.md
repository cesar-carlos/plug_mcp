# Lista de propostas próprias com hub persistente — 2026-10-19

## Resultado e alcance

**6 testes aprovados em 83,44 segundos**, modo Prisma. Filtro dirigido de inspeção
e adoção publicada: 73 demais casos não executados nesta rodada. Não encerra matriz.

PostgreSQL, SQL Server e SQL Anywhere usam fixtures dedicadas. Inspeção e adoção
passam por MCP → hub → agente. Autenticação Client, delegação e revogação usam hub
real com Prisma/PostgreSQL; controle MCP separado, sem override de autoridade.
A lista editorial reside no controle MCP; não representa consulta SQL à base ERP.

Para cada skill adotada dos três motores, o teste envia 21 propostas sintéticas,
percorre páginas de vinte e uma referências, compara todos os IDs sem perda ou
duplicação e verifica apenas os campos permitidos. Outro token com concessões
equivalentes recebe lista vazia e não usa cursor do autor. Cursor inexistente
é recusado. Revogação diretamente no hub, com registro local ainda ativo, bloqueia
a primeira página e a continuação pelo cursor obtido antes da revogação.

## Validações e limitações

training:check passou antes do startup; tipos, lint do teste, formatação, build
e docs:check passaram. Esta rodada altera teste/documentação, sem migrations ou
mudança funcional do runtime. Não testa OAuth ponta a ponta, concorrência entre
inserções/páginas, carga de catálogo grande, matriz integral ou imagem final.
Ordenação por ID não promete cronologia nem snapshot entre páginas.

## Candidato e limpeza

- MCP base: 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
- Hub: 0dc94d6990167f65e093b1fb68a8150630e2057c.
- Agente: 3b4f099e64a319a100cd93e00667ffca4afef732.
- Node 24 pelo wrapper. Provisionador usa PostgreSQL 17, SQL Server 2022 Developer
  e SQL Anywhere 16. Builds nativos/versões exatas dos drivers não foram transcritos
  antes da limpeza; não é evidência final de distribuição.

Teardown encerrou processos e a limpeza confirmou remoção somente dos recursos
próprios (contêineres, SQL Anywhere e DSN privado). Nenhuma fonte ou credencial
operacional foi utilizada. HTTPS/ChatGPT continuam manuais; ready:false e gates
abertos. Sem commit, push, publicação de imagem ou deploy.

| Arquivo                                                         | SHA-256                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| tests/homologation/persona-chain.test.ts                        | ecc9556ee4e5fcfa9d15d42464aba4a8c84124126c1197a08db02b3cdc4f24c7 |
| src/application/persona-v2/knowledge-training.ts                | 5814b9846c87f5e2074163a1081473d30c688039424ccaa87f61ce45b5c480d9 |
| src/infrastructure/persistence/persona-v2/knowledge-curation.ts | dbf738d247b8d845a8ca49ac3bbf54c2f7eacc3a799cf5c9125134f3c19c183d |
