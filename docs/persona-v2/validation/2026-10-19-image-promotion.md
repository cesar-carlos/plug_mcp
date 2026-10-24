# Promoção da imagem aceita entre rodadas — 2026-10-19

## Resultado

Origem aceita agora faz parte de cada gate: run ID, artifact ID e digest GitHub.
O seletor confere repositório/head repository, push/main, workflow ci.yml,
commit de build, estado completed/success, ID/nome/digest e vínculo do artefato.
CI/deploy usam artifact-ids em vez de selecionar por nome ou pela rodada atual.
Revisão da imagem é separada da revisão de aceite; arquivo e imagem carregada
continuam conferidos antes da comparação com todos os gates. Não há rebuild ou
fallback para artefato mais recente.

39 testes dirigidos passaram em quatro arquivos (origem, evidências, release e
imagem). Incluem origem correta, fork, repositório divergente, run incompleto,
branch/evento/workflow divergentes, expiração, digest e IDs inconsistentes.
Tipos backend, lint dos testes, Node --check do script e docs:check passaram.
Actionlint 1.7.9 passou em contêiner sem rede e checkout somente leitura.

Base MCP 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais;
[hashes funcionais](2026-10-19-image-promotion-files.json).
Node 24.21.0 e TypeScript 7.0.2. Fixtures locais sintéticas, sem uso da API GitHub,
segredos de deploy, publicação, push, novo commit do produto ou banco operacional.

## Pendências e limites

Testes da origem usam respostas API sintéticas. Consultas reais ao GitHub,
download de artefato aceito e promoção remota ainda precisam de homologação.
A rodada produtora v2 ainda deve ser configurada e aprovada: o CI padrão continua
produzindo a imagem legada, que é recusada pelo gate v2. Uma rodada em execução ou
falha não pode ser aceita como origem para resolver circularidade.

A proteção comprova associação e integridade, não a suficiência dos testes nem
identidade humana do revisor. Nenhum registro de aceite foi criado; ready:false,
treze gates abertos. HTTPS/ChatGPT manuais. Contratos públicos do hub inalterados.
