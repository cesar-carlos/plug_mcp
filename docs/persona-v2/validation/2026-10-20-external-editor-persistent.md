# Rascunho externo delegado na cadeia persistente — 2026-10-20

Runner prisma com filtro `delegação externa com hub persistente`: um cenário
aprovado em 23,80 segundos, início 11:34:20 (America/Cuiaba). Os outros 78 casos
foram filtrados; não equivale a rodada integral ou execução SQL nos três motores.

Criação e edição de skill externa pelas tools MCP usam integração explicitamente
concedida. Criação em outra integração é recusada. Caso do rascunho é salvo
por editar_caso_skill; repetição com revisão obsoleta é recusada. Contrato é
editado pelo MCP, mantendo identidade. Após reconstrução do MCP, OAuth com
consentimento administrativo lê a revisão 3 persistida, ainda não publicada.

Consentimento sem integração ou sem treinar recusa a leitura. Revogar uma
conexão conserva a outra; revogar a delegação diretamente no hub bloqueia
leitura e gestão, mesmo com registro local ativo. Nenhuma chamada adicional
ao provedor externo.

Fixture própria provisionada e removida pelo runner; hub Prisma e armazenamento
persistentes. Não usa fontes cadastradas pelo usuário. Validador de metadados
do cliente OAuth e respostas editoriais do provedor são controlados.

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` com alterações locais.
Hub `0dc94d6990167f65e093b1fb68a8150630e2057c`; training:check passou.
Hashes SHA-256:

- persona-chain-external-delegation.ts:
  `C0B139901552139052450D88905F58AE21D0D112F24EF7FAA87B3A89EB765047`.
- persona-chain-integration-management-oauth.ts:
  `A9BE1F3B5261A35D8F1CEF6FEE049B8F8B5B24320311C736E313D98A4A52B6E5`.

Tipos e lint dos helpers passaram. Publicação do editor por OAuth com hub
persistente, todas as rotas e imagem final ainda não são certificados.
HTTPS/ChatGPT continuam manuais. ready:false preservado; nenhum gate encerrado.
