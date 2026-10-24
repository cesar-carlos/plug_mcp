# Identidade da imagem nas evidências de aceite — 2026-10-19

## Implementação

Contrato de evidência v2 exige ID Docker, revisão de build, plataforma e runtime
em cada relatório, além dos identificadores de fonte/MCP/hub/agente. Provas v1
não são convertidas automaticamente. Manifesto atual permanece ready:false.

CI e deploy, após verificar arquivo, carregar imagem e conferir identidade real,
reexecutam o verificador com --image-proof antes de publicar ou enviar. Recusam
imagem divergente ou legada. ID Docker é o digest do config, não o digest do
manifesto do registro nem o hash do arquivo exportado; cada verificação conserva
sua finalidade. Não houve build, publicação, push ou implantação nesta rodada.

## Verificação

31 testes dirigidos passaram (release, evidências e artefato). Casos novos
conferem igualdade em todos os gates, divergência de imagem/revisão/plataforma/
runtime/schema, prova antiga e ordem dos comandos no CI/deploy. Fixtures Git
são temporárias e sintéticas, sem commit no repositório do produto.

Tipos backend, lint dos testes, sintaxe Node dos scripts e docs:check passaram.
Actionlint 1.7.9 passou em contêiner sem rede, checkout somente leitura. Tentativa
de lint direto dos scripts .mjs foi recusada pelo project service existente:
esses scripts não integram o projeto tipado do ESLint. Não foi ampliada exceção;
foram conferidos por Node --check e testes funcionais. Não apresentar essa
limitação como aprovação do lint dos scripts.

Verificador contra o manifesto real recusou a liberação, como esperado.
Node 24.21.0; TypeScript 7.0.2. MCP base
136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais;
[hashes funcionais](2026-10-19-release-image-binding-files.json).

## Limites

Não autentica o revisor nem prova a suficiência dos relatórios por si só.
Não cria evidências aceitas. Promoção da imagem entre rodadas/commits de provas,
execução efetiva do CI, homologação instalada e corte continuam pendentes.
Não certifica imagem real com aceite integral, HTTPS, ChatGPT ou os três motores.
Treze gates abertos; produção bloqueada. Contratos públicos do hub inalterados.
