# Importação OpenAPI OAuth com hub persistente — 2026-10-20

Rodada dirigida da cadeia com `Persistence prisma` e filtro
`delegação externa com hub persistente`: um caso aprovado, 78 não executados pelo
filtro, duração de 30,21 segundos, início 11:55:23. Fixture exclusiva criada e
removida pelos scripts da cadeia; nenhuma fonte operacional utilizada.

A autoridade utiliza o hub persistente. O consumidor passa por autorização,
consentimento e troca OAuth na composição v2, com metadados do cliente de fixture.

Verificado:

- OpenAPI local produz uma proposta GET para a integração explicitamente concedida.
- Ausência de escopo ou permissão administrativa recusa a importação.
- Outra integração não concedida é recusada.
- Revogar uma conexão impede importação nela, preservando a segunda conexão.
- Revogar a delegação no hub impede nova importação, mesmo com registro local ativo.
- O cenário anterior de edição, publicação, CAS e recuperação continua passando.

Não há chamada ao provedor para interpretar OpenAPI. Esta rodada não certifica
discovery remoto, efeitos externos, HTTPS público, ChatGPT, a matriz integral dos
motores ou a imagem candidata. As 78 exclusões são filtro dirigido, não aceite.

Revisão MCP base: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Hub fixado: `0dc94d6990167f65e093b1fb68a8150630e2057c`.
SHA-256 de `tests/helpers/persona-chain-integration-management-oauth.ts`:
`F9DCAEB90D29714BCB0CC3C182A0EEE5EF8098C0C90BC9BEB92ACC396476DC0A`.

Typecheck e lint do helper passaram. A imagem anterior ainda precisa incorporar
a importação delegada. Deploy permanece bloqueado; nenhum gate encerrado.
