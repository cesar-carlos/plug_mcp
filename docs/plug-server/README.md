# Integração com o plug-server

O MCP **não** fala com o banco ERP. Ele é um `Client` do [plug-server](https://plug-server.se7esistemassinop.com.br/docs): autentica-se, pede acesso a um `Agent` e encaminha JSON-RPC (`sql.execute`). Autorização SQL, limites e execução ficam no hub + `plug_agente`.

Fonte canónica no repositório irmão `plug_server/docs` (índice `docs/README.md` daquele repo). OpenAPI vivo: `GET /docs` / `GET /docs.json`. Prefixo HTTP: `/api/v1`.

| Documento                                  | Abrir quando…                                                       |
| ------------------------------------------ | ------------------------------------------------------------------- |
| [auth.md](auth.md)                         | Login JWT, `principal_type`, aprovação Client→Agent, `client_token` |
| [communication.md](communication.md)       | Canal REST do MCP (Socket `/agents` é do agente), envelope JSON-RPC |
| [rest-integration.md](rest-integration.md) | Adapter deste MCP: timeout/bridge, dois Agents, keepAlive = probe   |

O MCP autentica **como o Client do usuário** (e-mail/senha do cofre), não como um Client de serviço no `.env`.

Contrato de erro: [`../mcp/error-mapping.md`](../mcp/error-mapping.md). Cofre e token MCP: [`../auth/vault-and-mcp-token.md`](../auth/vault-and-mcp-token.md).
