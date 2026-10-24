# Releitura de propostas com hub persistente — 2026-10-19

## Rodada

**6 casos aprovados em 78,71 segundos**, modo Prisma, filtro explícito
inspeciona metadados pela conexão|publica adoção explícita. Os demais 73 casos
não foram executados nessa rodada; não conta como matriz integral.

Cada motor (PostgreSQL, SQL Server e SQL Anywhere) passou por inspeção de
metadados e adoção publicada, com fonte/identidade/estrutura verificadas pela
cadeia MCP → hub → agente. O fluxo editorial utiliza Client e delegação reais
do hub com PostgreSQL/Prisma e controle MCP separado. Sem overrides de autoridade.

## Verificações adicionadas

- Envio explícito de proposta compartilhada pela skill concedida.
- Consulta de estado sem conteúdo por padrão.
- includeContent devolve resumo e mudança originais, publicação e hash-base.
- Justificativa do curador não é entregue.
- Outro token com fontes, skill e treinar equivalentes não lê a proposta do autor.
- Revogação diretamente na API do hub bloqueia releitura enquanto o registro
  local permanece não revogado; revogação local posterior conclui a manutenção.

Publicar, incorporar proposta e conceder novas permissões continuam ações separadas.
O conteúdo é sintético, não treinamento Data7 real. OAuth entre conexões permanece
coberto pela suíte local anterior, não por esta rodada persistente Bearer.

## Ambiente, candidato e limpeza

Runner preparou fixtures próprias, iniciou processos MCP/hub/agente e aplicou
migrations somente nos bancos de controle isolados. Nenhum SQL de negócio foi
enviado diretamente pelo MCP aos motores; nenhuma fonte operacional foi usada.
Teardown encerrou os processos; remove-persona-chain-fixture confirmou a remoção
somente dos recursos próprios, incluindo contêineres, SQL Anywhere e DSN privado.

- MCP base: 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
- Hub: 0dc94d6990167f65e093b1fb68a8150630e2057c.
- Agente: 3b4f099e64a319a100cd93e00667ffca4afef732.
- Node 24 pelo wrapper; PostgreSQL 17, SQL Server 2022 Developer e SQL Anywhere 16
  pelo provisionador. Builds nativos/versões exatas dos drivers não foram
  transcritos antes da limpeza; esta evidência não fecha aceite de distribuição.

training:check passou antes do startup com pin/snapshot históricos vigentes.
Tipos, lint do teste, build e formatação passaram. A mudança desta rodada é de
homologação/documentação, sem alteração de runtime, migrations ou contratos do hub.
Não inclui reinício composto, toda a matriz adversarial, imagem final, avaliação
da IA, HTTPS público ou ChatGPT. HTTPS/ChatGPT manuais; ready:false e gates abertos.

## Hashes SHA-256

| Arquivo                                                   | SHA-256                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| tests/homologation/persona-chain.test.ts                  | ef39df3f451790aec17133f8739ec2fcbbcbe0574ba0c5c72e7723f114abab82 |
| src/application/persona-v2/knowledge-training.ts          | 1c0be2d1438ea97807ea752236339aabd176180d327971377c57b2db4ea5192d |
| src/infrastructure/mcp/persona-v2-administration-tools.ts | 02e3b81fe35160c507ee5e96ba923e0e7e3dfabdf12dbdc23d68703039e81146 |
