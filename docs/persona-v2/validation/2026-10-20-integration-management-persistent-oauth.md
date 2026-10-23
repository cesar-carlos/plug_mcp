# Gestão OAuth com autoridade persistente — 2026-10-20

Runner da cadeia em modo prisma, filtro `delegação externa com hub persistente`:
um caso aprovado em 24,97 segundos, início 11:23:10 (America/Cuiaba).
Outros 78 casos excluídos pelo filtro, sem reivindicação de rodada integral.
Fixture própria e recursos isolados removidos ao terminar.

O caso percorre authorize, autenticação do originador, consentimento HTTP,
PKCE, troca do código e API administrativa autenticada por access token.
Autoridade/delegação do responsável são verificadas pelo hub persistente.
Apenas metadados do cliente OAuth utilizam validador de fixture.

Verificado:

- IDs não oferecidos no consentimento não ampliam a lista concedida.
- Sem seleção de IDs, a lista administrativa fica vazia.
- Selecionar ID sem gerenciar_integracoes recusa administração.
- Revogar uma conexão bloqueia somente ela, conservando outra conexão.
- A outra conexão lê impacto; após revogação remota da delegação, mesmo com
  registro local ativo, listagem e recuperação são recusadas com
  AUTHORIZATION_DENIED.
- Cenários Bearer, CAS e reconstrução do MCP do mesmo teste continuam passando.
- Não há envio adicional ao provedor externo.

As primeiras rodadas falharam por erro da fixture: GET administrativo sem
Origin e expectativa 401 onde o contrato HTTP prevê 403/AUTHORIZATION_DENIED.
Corrigidos os cabeçalhos e as asserções, sem relaxar controles do servidor.
A leitura negativa Bearer preexistente também passou a informar Origin válido.

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais;
hub fixado em `0dc94d6990167f65e093b1fb68a8150630e2057c`, training:check aprovado.
SHA-256 de `tests/helpers/persona-chain-integration-management-oauth.ts`:
`156FE634B9F2F492303C2291E2DB7B0DAACF8F400D21F7A24FBD9C58D7E525C2`.
Tipos, lint e formatação dos helpers passaram.

Não certifica SQL nos motores, provedor externo, imagem final, HTTPS público
ou cliente ChatGPT. Rascunhos/publicação externos delegados continuam pendentes.
ready:false preservado, nenhum gate encerrado.
