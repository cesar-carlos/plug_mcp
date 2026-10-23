# Erros locais nos editores SQL e cruzamento — 2026-10-20

Editores agora associam `name`/`slug` ao campo com aria-invalid e descrição
do resumo. Referência `training` foca aviso da seção, sem inferir campo interno.
Referências não reconhecidas mantêm foco no resumo. A edição não é descartada.

Chromium dirigido: três cenários aprovados em 27,4 segundos, cobrindo operação
somente por parâmetros, SQL adaptável e cruzamento. Em cada fluxo publicado,
recusas HTTP controladas alternam nome/treinamento; verificam foco, descrição,
remoção da marca anterior e preservação do valor. Depois a resposta real volta
e o rascunho é salvo sem modificar o snapshot ativo.

PostgreSQL 17 próprio, bancos de fixture, autoridade/hub sintéticos. O contêiner
foi removido no finally por identificação exata. Não certifica leitor de tela,
todos os formulários, a cadeia dos três motores ou treinamento com IA.

Typecheck raiz/web, lint web/teste e build web passaram. Build conserva avisos
de comentários Zod e bundle maior que 500 kB. A imagem candidata anterior não
contém esta mudança visual; deverá ser reconstruída na próxima consolidação.

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` com alterações locais.
SHA-256 de `web/src/persona-v2/useEditorErrors.ts`:
`7786348F5B2074BC1D09C171A40C85D7B565168093A1B5E6A82990D0F1DA9D26`.
Deploy bloqueado; nenhum gate encerrado.
