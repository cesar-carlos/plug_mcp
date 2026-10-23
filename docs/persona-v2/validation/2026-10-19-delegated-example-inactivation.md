# Inativação editorial delegada de exemplos — 2026-10-19

## Revisão e entrega

O catálogo já permitia cadastrar/substituir exemplos e editar o treinamento
completo. Faltava uma ação delegada específica para retirar um exemplo do uso
editorial sem reenviar todo o rascunho. `inativar_exemplo_sql` agora recebe
skillId, exampleId e expectedRevision, sob a mesma unidade autorizada de treinar.

Altera somente o estado para inactive, preservando conteúdo, modelo SQL,
parâmetros e outros exemplos. Incrementa revisão, invalida preview anterior e
preserva a publicação ativa. Não remove versões, publica, aprova significado ou
altera catálogo compartilhado. Ausente/inativo/substituído e CAS obsoleto são
conflitos. Não introduz nova permissão nem migration.

Revisão/incorporação e publicação de catálogos continuam humanas. Histórico
entre versões e demais jornadas de gestão editorial não foram encerrados.

## Validação

Suíte `setup-delegation.postgres.test.ts`: **78/78 aprovados em 34,36 segundos**.
Novos casos verificam uma única alteração entre chamadas concorrentes, preservação
do snapshot/conteúdo, preview obsoleto, replay, ID ausente, fonte não concedida,
outra persona, ausência de treinar e revogação remota. Auditoria não recebe SQL.

Primeira execução: 76 passaram e dois novos casos falharam por fixtures inválidas
(explicação obrigatória ausente e comparação sem defaults do schema). Fixtures
corrigidas e suíte inteira repetida; nenhum requisito foi relaxado.

PostgreSQL 17 efêmero em Docker, imagem
`sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3`.
Banco de controle real; autoridade remota simulada nesta suíte. Não é homologação
dos três motores, hub persistente, OAuth completo, console ou IA. Fixtures foram
removidas no finally, sem tocar fontes operacionais. Tipos, lint dirigido e build
passaram; documentação/rules/runtime foram sincronizados.

## Candidato e limites

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` mais alterações locais.
Node 24 pelo wrapper, TypeScript 7. Sem alteração do hub/agente ou de migrations.
HTTPS/ChatGPT seguem manuais. Sem commit, push ou deploy; ready:false e gates
permanecem abertos. Esta evidência não encerra administração delegada inteira.

| Arquivo                                                   | SHA-256                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| src/application/persona-v2/catalog.ts                     | fa15d52370956bd58d03438b902aa5ffad65512d62dcb1f25f997735ed4f7f1f |
| src/infrastructure/mcp/persona-v2-administration-tools.ts | 3e3f996e1da6e00019ea7844b56d97251346868c966ee2642ee4e7c2ac108167 |
| tests/persona-v2/setup-delegation.postgres.test.ts        | 278700c1d22a11479dff0ca8d00ff22f1bfceb08ce236bf0e0b7965411ed03c5 |
