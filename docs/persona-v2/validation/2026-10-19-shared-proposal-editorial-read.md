# Releitura editorial de propostas compartilhadas — 2026-10-19

## Entrega e limites

obter_proposta_conhecimento aceita includeContent:true para devolver resumo,
mudança enviada, publicação/hash-base e data da proposta original. Sem a opção,
conserva a resposta anterior de estado. Não devolve justificativa do curador,
rascunho atual ou navegação pelo catálogo. Treinamento, delegação/consentimento,
skill, catálogo e papel continuam revalidados na unidade autorizada.

Conteúdo exige o token autor e a mesma concessão OAuth de origem, ou Bearer se
foi enviado por Bearer. A identidade da publicação-base é proveniência, não prova
de aprovação ou compatibilidade atual. Não altera proposta, incorpora, publica,
executa SQL ou amplia concessões. Gestão editorial geral permanece pendente.

## Verificações

76 testes da suíte setup-delegation.postgres.test.ts aprovados em 36,53 segundos.
O caso de conhecimento compartilhado agora verifica leitura de estado sem conteúdo,
leitura explícita do envio original, ausência de justificativa do curador, outro
token recusado e isolamento Bearer/OAuth nos dois sentidos. Conexão autora OAuth
lê sua proposta; delegação revogada impede a leitura MCP.

Tipos, lint dos arquivos afetados, formatação e build passaram. PostgreSQL 17 é
real e isolado; autoridade do hub é simulada nessa suíte. Não certifica o hub
persistente, motores de negócio, publicação por curador, UI ou OAuth ponta a ponta.
A evidência persistente de casos externos não certifica automaticamente este fluxo.

## Limpeza e candidato

Após teardown restaram somente postgres e persona_editorial_test. Label
shared-editorial-20261019 conferida; contêiner próprio e volume removidos.
Nenhuma fonte, credencial ou dado operacional foi utilizado.

Base MCP 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais, Node 24
pelo wrapper. Sem migrations, alterações do hub/agente, commit, push ou deploy.
HTTPS/ChatGPT manuais; ready:false e gates abertos.

| Arquivo                                                   | SHA-256                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| src/application/persona-v2/knowledge-training.ts          | 1c0be2d1438ea97807ea752236339aabd176180d327971377c57b2db4ea5192d |
| src/infrastructure/mcp/persona-v2-administration-tools.ts | 02e3b81fe35160c507ee5e96ba923e0e7e3dfabdf12dbdc23d68703039e81146 |
| src/application/persona-v2/runtime-instructions.ts        | 4b9b6344d9c93134a7f135faf0f9aff40886a093a2cb1037bb57a6d2da071c39 |
| tests/persona-v2/setup-delegation.postgres.test.ts        | d818739c04c70639423317ce553946508be8e142947828e65fa2dac73cd50de0 |
