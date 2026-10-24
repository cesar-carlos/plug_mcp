# Candidato com correções de cruzamento e autoridade — 2026-10-20

## Identidade local

Alvo persona-v2-candidate reconstruído localmente, sem publicação:

- Configuração: sha256:60cce076965b90e77ba4797690836591aa73090570f483645e38f7582ff0e8fc.
- Manifesto OCI: sha256:1b0ed365fca8ad5c903578f09b7673692a8f7db0b3c9ee3d50aea90c1db91c52.
- MCP base: 136b5bfc8f7104b753bbd3703c9ffda196fdd51f, com alterações locais.

Inclui recusa de inteiros inseguros nos cruzamentos, conferência de prazo antes
do dispatch e recusa atual do hub prevalecendo sobre aprovação histórica.
Hashes SHA-256 dos módulos lidos dentro de contêiner sem rede/volumes:

- dist/application/persona-v2/federation.js: 4e2b4f5ebc7ac8036266be6f20af74b3ee2f30f52396e1e7e671dd8df1980bfc.
- dist/infrastructure/plug-server/plug-server-rest.adapter.js: 5828cd1ea612444e1ddf0fc42a14370229b01352844d1a39a7fa6eaf6d02728f.

## Empacotamento

Build passou com Node 24.21 e TypeScript 7.0.2. Avisos de anotações Zod,
script de instalação esbuild e bundle do console de 505,46 kB permanecem visíveis.

test-persona-candidate.ps1 passou: quarenta migrations, assets, quatro jobs,
reinício, backup/restauração, recusa de produção/segredos/comandos e
legado/checksum, sem DDL automático no startup. Limpeza da fixture confirmada.
Esse ensaio usa hub inválido e não certifica autenticação nem treinamento.

## Treinamento pelo navegador

Fixture nova, Persistence prisma, CandidateImage fixado ao ID local e filtro
Chromium cria persona. Um teste passou em 37,53 segundos, início 10:33:35;
78 não selecionados. Persona, três fontes, treinamento/publicação, token e
consulta exercitados na imagem com hub persistente e agentes reais:
PostgreSQL 17, SQL Server 2022 e SQL Anywhere 16.

training:check confirmou hub 0dc94d6990167f65e093b1fb68a8150630e2057c.
Limpeza dos recursos próprios confirmada. Não é repetição integral dos 79
cenários, avaliação da IA ou ensaio manual do usuário. Os casos específicos
de revogação e precisão têm suas evidências separadas no checkout.

## Limites

Imagem local não equivale a instalação desktop ou ambiente público.
HTTPS/ChatGPT permanecem manuais. Aceite integral e gates continuam abertos;
ready:false preservado. Sem commit, push ou deploy.
