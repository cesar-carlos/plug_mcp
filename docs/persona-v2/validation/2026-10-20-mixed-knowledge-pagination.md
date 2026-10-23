# Comparação mista e histórico paginado — 2026-10-20

## Resultado

Rodada final: **3 testes aprovados em 62,17 segundos**, um por motor. Tipos, lint
dirigido e build passaram. Teardown confirmou remoção somente das fixtures
criadas. Não foi necessária correção do runtime.

## Escopo

Cadeia persistente com hub Prisma e fixtures PostgreSQL, SQL Server e SQL Anywhere.
Filtro `casos nativos com rollback`, com 76 outros testes excluídos pelo filtro.
Por motor, duas operações publicadas pelo runner real e vinte consultas adotam
versões explícitas do mesmo padrão. A comparação e o histórico leem snapshots
no MCP; não executam SQL de negócio. Inspeção e testes de operações passam pelo
hub/agente nas fixtures dedicadas.

## Asserções

- Histórico misto com 22 vínculos produz páginas de vinte e dois itens.
- Ordem por revisão decrescente e ID estável, sem lacunas ou duplicações.
- Cursor terminal nulo; âncora e cursor fora da concessão recusados.
- Comparação operação→consulta e consulta→operação inverte before/after.
- Diferença entre labels v1/v2 preservada; leitura não concede execução.
- Tokens com apenas consultas ou apenas operação não comparam os dois lados.
- Suspensão da versão antiga bloqueia a comparação e o cursor dependentes.
- Revogar token impede continuar a paginação, com HTTP 401.
- Cenários OAuth individuais já presentes e operações com journal continuam
  executados pela mesma rodada; não equivalem a OAuth da comparação mista.

## Correção da fixture

Primeira rodada falhou nos três motores ao publicar consulta sem schema contra
um recorte qualificado. O servidor recusou corretamente com TABELA_FORA_DO_ESCOPO.
O SQL do teste passou a usar o nome qualificado do padrão publicado. Nenhuma
validação de produção foi relaxada. As fixtures da rodada falha foram removidas
antes da repetição. A segunda rodada também recusou a fixture, por não preservar as regras do padrão (INVALID_PLAN); corrigido para usar content.rules. Ambas as rodadas tiveram três falhas e limpeza confirmada; somente o teste foi ajustado.

## Candidato e limites

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` mais alterações locais.
Hub verificado pelo runner/training:check:
`0dc94d6990167f65e093b1fb68a8150630e2057c`.
Node 24 e TypeScript 7 do projeto. Provisionador PostgreSQL 17, SQL Server 2022
Developer e SQL Anywhere 16. Builds exatos dos drivers não foram transcritos.
SHA-256 de `tests/homologation/persona-chain.test.ts`:
`c86cd10f696e5fb337d4398d0d72a302bbc8b389c4f8248af67f93935478816c`.

A matriz mista é Bearer: OAuth misto, concorrência simultânea ampliada, paginação
sob alterações entre páginas e carga permanecem pendentes. Não há promessa de
snapshot entre páginas. HTTPS/ChatGPT continuam manuais. Sem fonte operacional,
migration, commit, push ou deploy; ready:false e gates permanecem abertos.
