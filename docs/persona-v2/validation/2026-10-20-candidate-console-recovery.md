# Candidato com recuperação do console — 2026-10-20

## Imagem local

Reconstruído o alvo persona-v2-candidate após as correções de confirmação perdida
na emissão/edição de tokens e erros acessíveis do treinamento. Sem publicação.

- MCP base: 136b5bfc8f7104b753bbd3703c9ffda196fdd51f, com alterações locais.
- Configuração da imagem:
  sha256:c0b39679fa069f5cce8ced92c307019799703ddaa5c6770917a8c57753a6816f.
- Manifesto OCI:
  sha256:24fb6b40da44f6f3acd743982477a2860e8e8fb720db29db9101fad107920a43.

Build confirmou TypeScript 7.0.2 e passou. Avisos de anotações Zod e chunk
do console acima de 500 kB permanecem visíveis.

## Empacotamento

test-persona-candidate.ps1 passou com quarenta migrations, assets, quatro jobs,
recusas de produção/segredos/comandos/legado/checksum, ausência de DDL no startup,
reinício, parada e backup/restauração. Limpeza dos recursos próprios confirmada.
Essa fixture tem hub inválido e não comprova treinamento.

## Treinamento na imagem

Fixture nova com Persistence prisma e CandidateImage, sem reconstrução durante
a rodada. Filtro Chromium cria persona: um cenário passou em 38,04 segundos,
início 10:09:58; 78 casos não selecionados. Cadastro de persona e três bases,
treinamento, publicação e consulta foram exercitados pelo navegador com MCP na
imagem, hub persistente e agente real de fixture para PostgreSQL, SQL Server
e SQL Anywhere. Limpeza da fixture confirmada.

training:check confirmou hub 0dc94d6990167f65e093b1fb68a8150630e2057c.
Metadados do cliente não certificam HTTPS público. Não é uma repetição integral
da cadeia ou teste manual do usuário.

Suíte unitária web: 86 testes aprovados em 22 arquivos, 1,08 segundos.

## Regressão completa do console

52 testes Chromium passaram em 5,1 minutos, sem filtro ou omissão, sobre
bundle novo. PostgreSQL 17 isolado com hub/provedores sintéticos; inclui
as três regressões novas de confirmação perdida e foco no treinamento,
além das jornadas existentes. A fixture foi removida no finally e a variável
de conexão foi descartada. Não utiliza fontes operacionais.

O aviso de duração do arquivo não levou à paralelização da fixture nem à
redução do throttle. Avisos do SDK sobre notificações em resposta JSON não
foram ocultados. Nenhum teste foi alterado para obter aprovação nesta rodada.
docs:check passou sem problemas.

## Arquivos conferidos

- PersonaConsole.vue:
  D152809AF52266433015F6551929A7AB11E804F22C9D20EA83903C9DE3688D17.
- TokenManager.vue:
  FB73628E6F8FBE1B385F0A3677A54CB444DF5A85F534BCC2EB82F61F1D86E094.
- tests/persona-v2-browser/persona.spec.ts:
  44CD8FB9FDD786C6AD764CFE51D6899612825DB77509FB650B959843630B1B40.

## Limites

Não certifica instalação desktop, infraestrutura pública, leitor de tela completo,
HTTPS/ChatGPT ou avaliação da IA. Não altera gates ou ready:false. Não houve
commit, push, publicação de imagem ou deploy.
