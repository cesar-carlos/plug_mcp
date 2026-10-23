# Erros acessíveis de contratos externos — 2026-10-20

Editor externo reutiliza foco e descrição para referências públicas de nome,
slug e contract. API administrativa permite retornar somente o nome contract
na lista de campos recusados; conteúdo e caminhos internos continuam omitidos.

Chromium dirigido passou em cinco cenários, 28,3 segundos: editores REST e MCP
remoto, dois modos de operação SQL e cruzamento. Verifica resposta real 400 ao
omitir contrato externo, foco e descrição de recusas HTTP controladas, preservação
da edição e comportamento posterior de salvamento/conflito/publicação.

Banco PostgreSQL 17 exclusivo de fixture, hub/autoridade sintéticos. Contêiner
removido no finally por identificação exata. Não certifica leitor de tela,
infraestrutura instalada, serviços externos reais nem matriz dos três motores.

Tipos raiz/web, lint web/arquivos backend e teste, formatação e build web passaram.
Build conserva avisos de dependência e tamanho de bundle. A imagem candidata
anterior não incorpora as mudanças visuais desta rodada e da rodada SQL/cruzamento.

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
SHA-256:

- ExternalSkillEditor.vue:
  `28B08A48FFA01B3DE7C296072D08E6C552750ED0F18B540A3FBC83C46E5BD557`.
- persona-v2-admin.ts:
  `FFED4C8FC8A1C43D6792407CDC470E5F094890A5BCB8B1E75717F4D08A498B23`.

Deploy bloqueado; nenhum gate encerrado.
