# Se7e MCP Server — Documentação

Servidor MCP remoto que conecta clientes de IA (ChatGPT, Claude, Cursor e outros) aos dados do ERP Se7e através do `plug-server`. A IA descobre fontes, lê o significado das colunas, monta SQL no dialeto do ambiente e envia a consulta ao `plug-server`. Autorização, limites e execução SQL permanecem no `plug-server`.

## Documentos por área

Organizado em subpastas por tema, para abrir só o que for relevante à implementação em questão.

| Área                            | Documento                                                           | Conteúdo                                                          |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`product/`](product)           | [implementation-plan.md](product/implementation-plan.md)            | Plano da Fase 1, escopo, decisões e critérios de sucesso          |
| [`architecture/`](architecture) | [hexagonal-architecture.md](architecture/hexagonal-architecture.md) | Arquitetura hexagonal, camadas, SOLID e composição                |
| [`auth/`](auth)                 | [identity-and-oauth.md](auth/identity-and-oauth.md)                 | Identidade em 3 camadas, OAuth 2.1 do MCP e tokens do plug-server |
| [`data/`](data)                 | [data-model.md](data/data-model.md)                                 | Modelo Postgres, entidades e seed do catálogo                     |
| [`mcp/`](mcp)                   | [tools.md](mcp/tools.md)                                            | Contratos das tools MCP (onboarding, catálogo, consulta)          |
| [`mcp/`](mcp)                   | [error-mapping.md](mcp/error-mapping.md)                            | Códigos de erro estruturados para a IA decidir                    |
| [`plug-server/`](plug-server)   | [README.md](plug-server/README.md)                                  | Índice: auth do hub, canais REST/Socket, adapter deste MCP        |
| [`plug-server/`](plug-server)   | [auth.md](plug-server/auth.md)                                      | JWT de Client, aprovação Agent, `client_token`                    |
| [`plug-server/`](plug-server)   | [communication.md](plug-server/communication.md)                    | Envelope JSON-RPC, REST vs Socket, classificação SQL              |
| [`plug-server/`](plug-server)   | [rest-integration.md](plug-server/rest-integration.md)              | Endpoints e TokenManager que este MCP implementa hoje             |
| [`clients/`](clients)           | [connecting-clients.md](clients/connecting-clients.md)              | Como plugar o MCP em Cursor, Claude e ChatGPT                     |

## Princípios

- O MCP **não** acessa SQL Server, Sybase, PostgreSQL ou Firebird do cliente.
- O MCP **não** duplica autorização SQL. O `client_token` do ambiente é a autoridade no agente.
- O usuário final **nunca** informa senha do `plug-server`. Informa `agentId`, dialeto e `client_token`.
- Não existe painel administrativo. Onboarding é conversacional (tools + elicitation).
- Novas tools entram como caso de uso + registro MCP, sem alterar o domínio.
- O catálogo evolui por `agentId`: anotações, relacionamentos e consultas aprovadas (`anotar_fonte`, `salvar_consulta`) nunca cruzam agentes, mesmo na mesma conta.
