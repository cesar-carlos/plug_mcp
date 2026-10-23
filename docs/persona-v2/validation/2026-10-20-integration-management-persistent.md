# Gestão delegada com hub persistente — 2026-10-20

Runner da cadeia, modo prisma, filtro `delegação externa com hub persistente`:
um teste aprovado em 21,98 segundos, início 11:16:07 (America/Cuiaba).
Os outros 78 casos foram excluídos pelo filtro; não se trata de rodada integral.

Fixture própria criada pelo provisionador, com bancos isolados, autoridade
Prisma do hub, cofre/agentes da cadeia e contratos conferidos pelo runner.
Limpeza confirmou remoção somente da fixture indicada.

O cenário acrescenta gestão explícita de uma integração ao teste editorial:

- Listagem retorna somente o ID concedido; revisão de outro ID é recusada.
- Suspensão exige impacto, fingerprint e versão atuais.
- Repetição da mesma alteração é recusada por versão obsoleta.
- Reconstrução do MCP conserva a versão da suspensão.
- Revogação diretamente no hub, mantendo registro local ativo, bloqueia
  listagem e recuperação da integração.
- Casos editoriais existentes continuam preservados após reinício.
- Nenhuma chamada adicional ao provedor externo é realizada.

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Hub fixado em `0dc94d6990167f65e093b1fb68a8150630e2057c`; training:check passou.
SHA-256 de `tests/helpers/persona-chain-external-delegation.ts`:
`F87D4F1AEA0EBBF007427C33A98FA0B70188C071CC2CEA447E606DD62FC8FE89`.
Após a rodada, a leitura da lista recebeu anotação TypeScript explícita para
eliminar chamada any apontada pelo lint, sem alteração do comportamento testado.

## Limites

Este cenário verifica administração com autoridade persistente, não execução
SQL nos três motores nem envio a provedor real. OAuth de gestão ainda tem
evidência separada de PostgreSQL; não reivindicar sua homologação com o hub
a partir deste caso Bearer. Não certifica imagem final, HTTPS ou ChatGPT.
ready:false e gates sem aceite permanecem preservados.
