# Regressão integral do console após correção de navegação — 2026-10-19

## Resultado

As 46 jornadas Chromium passaram em 4,5 minutos, sem filtro, retries ou omissões.
A rodada inclui o teste de descarte que falhou na verificação anterior e os
fluxos de impacto por padrão, perfil e recurso. Não houve alteração de código
durante a execução. A pendência de repetir a suíte completa após a correção
descrita no [ciclo Chromium](2026-10-19-browser-lifecycle.md) está resolvida.

Comando: `npx playwright test --config playwright.persona-v2.config.ts`, pelo
wrapper Node 24 do projeto, com URL explícita de PostgreSQL descartável.
Hub sintético; SQL/persistência PostgreSQL reais de fixture. Nenhuma fonte
cadastrada pelo usuário ou credencial operacional foi utilizada.

## Candidato e integridade

Base MCP: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Inventário antes e depois dos testes: 1.064 arquivos, SHA-256
`c20c30a3c6c9b55d1d4db11bf5698e6a6d8676be2c7e147e850e45b4520719db`.
Esse inventário precede a atualização documental desta rodada.

- Testes do console: `726bd91bc9d13fb8119abe5754a1bb715d1f1469a9666b36d0e6ecebaed27396`.
- Helper: `691b176d7f432a63bbdc74bb4256aec5c369927c3f181f1df55c94bff76a076d`.
- Configuração: `2748a4e681965df1616cf55c250d1f303eb4935ab5c7b3d611141adb93644f6b`.

Após o término, o build frontend foi regenerado com sucesso. Comparação de
caminhos e hashes SHA-256 confirmou os mesmos 52 arquivos que foram servidos
durante os testes. Avisos da dependência Zod sobre annotations permanecem
não fatais; não houve alteração de bundle nesta rodada.

## Limpeza e bloqueio

O teardown terminou automaticamente com código zero. Consulta ao PostgreSQL
confirmou ausência dos bancos temporários do console e das duas fontes; o
arquivo de estado também foi removido. O contêiner dedicado foi removido com
seu volume após conferência do ID e do rótulo exclusivo da rodada.

O verificador de release foi executado e recusou a publicação com código 1,
como esperado: `ready: false`, 13 gates exigidos e nenhum aceite concluído.

Não certifica a cadeia instalada dos três motores, acessibilidade integral,
imagem candidata atualizada, HTTPS público, ChatGPT ou IA consumidora. Essas
validações permanecem pendentes. Nenhum contrato do hub foi alterado, nenhuma
imagem foi publicada e não houve commit, push ou deploy.
