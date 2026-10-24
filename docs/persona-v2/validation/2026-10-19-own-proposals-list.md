# Lista editorial delegada de propostas próprias — 2026-10-19

## Entrega

listar_minhas_propostas_conhecimento recebe skillId e before opcional. Usa a
versão-base atualmente concedida e filtra no PostgreSQL por catálogo, publicação,
persona, fonte, skill, token e concessão OAuth (ou Bearer). Exige treinar,
delegação, consentimento e papel editorial vigentes a cada página.

Retorna até vinte referências com estado/hash/datas e nextCursor, sem resumo,
mudança, justificativa do curador ou acesso à fila geral. Cursor pertence ao mesmo
escopo; ordenação por ID é estável, não cronológica. Não há total ou snapshot
entre páginas. Nova adoção não abre histórico de outra versão automaticamente.

## Validação

76 testes da suíte setup-delegation.postgres.test.ts aprovados em 32,56 segundos.
Caso ampliado cria 21 propostas, percorre duas páginas sem duplicação, verifica
campos editoriais ausentes, cursor desconhecido recusado, listagem OAuth isolada,
cursores cruzados Bearer/OAuth recusados e bloqueio MCP após revogação da delegação.

Tipos, lint dos arquivos afetados, formatação e build passaram. Lint inicialmente
pediu tipo explícito de retorno; corrigido sem alterar comportamento.
PostgreSQL 17 de fixture real; autoridade do hub simulada. Não homologa nova tool
com hub persistente, ChatGPT ou catálogo grande. Sem migration: utiliza tabela
existente e paginação limitada com filtros aplicados antes da entrega.

## Limpeza e revisão

Após teardown restaram somente postgres e persona_editorial_test. Label
editorial-list-20261019 conferida; contêiner e volume próprios removidos.
Nenhum dado ou credencial operacional foi usado.

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais. Node 24
pelo wrapper. Sem alterações do hub/agente, commit, push ou deploy. HTTPS/ChatGPT
manuais; ready:false e gates abertos. Gestão editorial mais ampla permanece pendente.

| Arquivo                                                         | SHA-256                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| src/application/persona-v2/knowledge-training.ts                | 5814b9846c87f5e2074163a1081473d30c688039424ccaa87f61ce45b5c480d9 |
| src/domain/persona-v2/knowledge-curation.ts                     | b9173608086afd5790a6bde390b8f0f42f58224fd01d0731cc058405150e53fc |
| src/infrastructure/persistence/persona-v2/knowledge-curation.ts | dbf738d247b8d845a8ca49ac3bbf54c2f7eacc3a799cf5c9125134f3c19c183d |
| src/infrastructure/mcp/persona-v2-administration-tools.ts       | a424ef1330e41fabca99b58eca719877cf6f5704cce7d913ec5ad89f2af3a329 |
| tests/persona-v2/setup-delegation.postgres.test.ts              | 5f5fc587f3d58ed825332779a040f37aedf7ff128d05ebd536cacf099e841d2a |
