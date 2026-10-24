# Console completo após sincronização — 2026-10-20

Suíte Chromium completa: 53 testes aprovados em 5,3 minutos, sem filtro ou retry.
A rodada anterior de 52 aprovações/uma falha permanece registrada; não foi
reclassificada. O teste corrigido aguarda o editor carregado sob demanda antes
de pedir navegação, preservando o bloqueio real durante requisições.

PostgreSQL 17 em contêiner aleatório próprio, hub/autenticação sintéticos,
backend e persistência reais de fixture. A limpeza foi confirmada. Não foram
usados bancos, credenciais ou fontes operacionais.

Cobertura inclui personas, fontes, proteção de edição, tokens, integrações,
OAuth no console, biblioteca, perfis, erros dos editores, casos/publicações,
consultas, cruzamentos e acompanhamento de operações conforme a suíte existente.
Não certifica leitor de tela, cliente ChatGPT, infraestrutura pública, avaliação
da IA ou a cadeia dos três motores.

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, alterações locais.
Inventário capturado durante a execução: 1084 arquivos,
`2511a4c520d128225104d61b4f23dbf44bd0a6b0c4afa98962ae08e5bd6e4bed`,
`authorizesRelease: false`. Alterações documentais posteriores mudam o inventário;
esse hash não é o ID Docker e não autoriza release.

Deploy bloqueado e nenhum gate formalmente aceito.
