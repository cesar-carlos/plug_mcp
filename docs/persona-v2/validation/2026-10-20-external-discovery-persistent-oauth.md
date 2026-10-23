# Discovery MCP OAuth com hub persistente — 2026-10-20

Rodada dirigida com `Persistence prisma`, filtro
`delegação externa com hub persistente`: um teste aprovado, 78 excluídos pelo
filtro, duração de 25 segundos, início 11:58:26. A fixture da cadeia foi removida.
O servidor TLS e seu ledger temporário também são fechados/removidos no finally.

A composição usa PersonaExternalDiscovery e PublicExternalHttp reais contra
servidor MCP HTTPS local de fixture. Somente resolução, destino local e CA são
substituídos pelo helper de teste; nenhuma exceção foi adicionada ao runtime.
O hub Prisma autentica e verifica a delegação real da fixture.

Verificações:

- Consentimento explícito da integração MCP permite descobrir duas propostas.
- A conexão consentida somente para a integração REST não descobre a integração MCP.
- Uma conexão sem a permissão administrativa é recusada.
- Revogar uma conexão bloqueia discovery nela, preservando outra conexão concedida.
- Revogação da delegação no hub bloqueia a conexão ainda ativa localmente.
- Zero leituras e escritas de negócio no provedor; nenhuma credencial ou sessão
  de protocolo inválida observada. Discovery não aprova nem publica contratos.
- O cenário anterior de importação OpenAPI, edição, publicação e CAS continua passando.

Typecheck, lint dos dois helpers e formatação passaram.

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Hub fixado `0dc94d6990167f65e093b1fb68a8150630e2057c`.
SHA-256:

- `persona-chain-external-delegation.ts`:
  `4EE0132D65590DF5450792693F3B8F718AA487601480BF5A5FFAD5A4246CFBB7`.
- `persona-chain-integration-management-oauth.ts`:
  `B7BF54218D38D321E8E29F1F790AB0FCD4C5567213AD525BB8FC2B85B16ABDF7`.

Não certifica DNS/HTTPS público, ChatGPT, provedores operacionais ou a matriz
integral dos três motores. A imagem anterior continua sem a importação delegada;
reconstrução e validação do candidato exato permanecem necessárias. Nenhum gate
encerrado; deploy bloqueado.
