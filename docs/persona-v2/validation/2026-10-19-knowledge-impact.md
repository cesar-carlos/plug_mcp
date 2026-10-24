# Impacto de padrões publicados — 2026-10-19

## Implementação

Endpoint administrativo e painel no histórico de versões: dependências diretas
de consultas/operações e transitivas das publicações, com persona, fontes,
nome/revisão do snapshot e estados locais. Paginação de cinquenta itens com cursor.
Filtro de responsável ocorre antes da paginação; participar do catálogo não
revela personas alheias ou totais globais. Revogação de catálogo e responsável
inativo bloqueiam nova leitura. Não executa SQL de negócio, adota, suspende ou
concede permissões. Não altera contratos públicos do hub nem migrations.

## Verificação

- Vinte testes PostgreSQL de conhecimento compartilhado aprovados em 9,82 s.
  Caso novo inclui 53 publicações de Alice e duas de Bob, dependência indireta,
  paginação, nome publicado distinto do rascunho, isolamento, revogação,
  cursor inválido, publicação ausente e responsável inativo.
- Um percurso Chromium de catálogo/importação/publicação aprovado em 1,8 min,
  incluindo leitura explícita de impacto vazio na visibilidade do responsável.
- Tipos backend/frontend, lint, 73 testes web e build aprovados. Build final
  inclui fontes vinculadas e descarte do resultado ao atualizar a leitura.
- `docs:check` sem problemas. Nenhum gate encerrado.

Uma tentativa do teste novo esperava 403 para responsável inativo; o runtime
invalida a sessão com 401. Corrigida a asserção e restaurado login independente
para os testes seguintes; rodada final passou. Não foi reduzida a autorização.
Após término do worker Chromium, a limpeza do servidor auxiliar ficou retida;
encerrados somente os processos identificados dessa fixture. Não comprova parada
operacional instalada. PostgreSQL 17 próprio, hub sintético e dados declarados de
teste; não certifica adoção executável, cadeia dos três motores, HTTPS ou ChatGPT.

## Candidato e limites

Checkout local com alterações, sem commit, imagem publicada ou deploy.
SHA-256:

- Serviço `shared-knowledge.ts`: `f1d1b680c56d21bde4f3b5d929e3173277987239e3f4da3d3a80a3ad5db55217`.
- Persistência `shared-knowledge.ts`: `11b334e89cc09010326caa9ee4906857eb6b54e2c7ae14ab4f48ef705a2ab0bd`.
- `KnowledgeImpact.vue`: `01c8392edeb89d40057ec25b4a98c8f399da7e3fbf7f986b0ee11c5675c78ee4`.

Detalhamento por perfil físico/recurso e matriz ampliada permanecem pendentes.
Nomes das fontes são metadados atuais; nomes/revisões de skills vêm dos snapshots.
Estado local ativo não certifica disponibilidade remota. `ready: false` preservado.
