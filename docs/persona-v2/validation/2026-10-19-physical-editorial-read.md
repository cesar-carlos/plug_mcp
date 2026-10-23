# Releitura editorial de particularidades físicas — 2026-10-19

## Entrega

obter_proposta_particularidade aceita includeContent:true. Retorna resumo,
mudança original, overrideCommon, referências/hash do perfil e padrão-base e
data de envio. Resposta padrão conserva somente estado. Exige token autor,
mesma conexão Bearer/OAuth e revalidação de catálogo, skill e acesso remoto à
mesma base. Não entrega identidade física interna, justificativa do curador ou
rascunho atual. Não altera, incorpora, publica ou concede autoridade.

## Rodada persistente

**6 casos aprovados em 76,50 segundos** em PostgreSQL, SQL Server e SQL Anywhere,
com hub Prisma e agentes reais. Filtro explícito de inspeção e adoção publicada;
73 casos fora desse filtro não foram executados e não são aceite da matriz.

Verificações adicionais: estado sem conteúdo por padrão, leitura explícita do
envio original com referências do perfil/base, campos internos ausentes, outro
token com concessões equivalentes recusado, revogação diretamente no hub bloqueando
leitura enquanto o registro local permanece ativo. SQL e inspeção passam somente
pela cadeia MCP → hub → agente. Propostas e material são sintéticos.

training:check passou antes do startup; tipos, lint dos arquivos alterados, build,
formatação e documentação verificados. Nenhuma alteração de migrations/hub/agente.
OAuth entre conexões não foi exercitado neste recorte Bearer; não encerra seu aceite.

## Candidato, limpeza e limitações

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
Hub 0dc94d6990167f65e093b1fb68a8150630e2057c;
agente 3b4f099e64a319a100cd93e00667ffca4afef732. Node 24 pelo wrapper.
Provisionador usa PostgreSQL 17, SQL Server 2022 Developer e SQL Anywhere 16;
versões exatas dos drivers não foram transcritas antes da limpeza.

Teardown encerrou processos; limpeza confirmou remoção somente dos recursos
próprios da fixture, incluindo contêineres, SQL Anywhere e DSN. Nenhuma fonte
operacional usada. Não certifica imagem final, matriz integral, IA, instalação
desktop, HTTPS público ou ChatGPT. HTTPS/ChatGPT manuais; ready:false e gates abertos.

| Arquivo                                                   | SHA-256                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| src/application/persona-v2/physical-curation.ts           | 62fcb58a605d9442df21d9a3bf32b7249b30f3f49cae4a7007ff7519e77c546f |
| src/infrastructure/mcp/persona-v2-administration-tools.ts | f12462c62069c8de262ace067b0ffa9d6e23d86cffa7f8cddf438583e1c5853f |
| src/application/persona-v2/runtime-instructions.ts        | 1614b17ce9ec2cabd225f3ce9793634dc1d48e850e73d17dbb62f7f1312e4e74 |
| tests/homologation/persona-chain.test.ts                  | ffc912f246b12e0841b9058ff64b8cc9048c5b4db88d66a201144bb810c7fb7e |
