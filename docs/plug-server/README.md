# Integração com o plug-server

O MCP **não** fala com o banco ERP. Ele é um `Client` do [plug-server](https://plug-server.se7esistemassinop.com.br/docs): autentica-se, pede acesso a um `Agent` e encaminha JSON-RPC (`sql.execute`). O MCP valida o contrato e as permissões do consumidor; hub e `plug_agente` aplicam suas próprias guardas e executam o comando. O hub **não** implementa linguagem SQL nem rewrite de dialeto — identificar o GDBR e emitir SQL compatível é treino + IA ([objective.md](../product/objective.md)).

Fonte canónica no repositório irmão `plug_server/docs` (índice `docs/README.md` daquele repo). OpenAPI vivo: `GET /docs` / `GET /docs.json`. Prefixo HTTP: `/api/v1`.

| Documento                                  | Abrir quando…                                                       |
| ------------------------------------------ | ------------------------------------------------------------------- |
| [auth.md](auth.md)                         | Login JWT, `principal_type`, aprovação Client→Agent, `client_token` |
| [communication.md](communication.md)       | Canal REST do MCP (Socket `/agents` é do agente), envelope JSON-RPC |
| [rest-integration.md](rest-integration.md) | Adapter deste MCP: timeout/bridge, dois Agents, keepAlive = probe   |

O MCP autentica **como o Client do usuário** (e-mail/senha do cofre), não como um Client de serviço no `.env`.

## Escolher a geração e investigar falhas

A entrada padrão é persona-v2: o MCP também valida concessões, publicações,
escopo SQL e finalidade antes do envio e revalida autoridade na entrega. As
guardas do hub/agente permanecem obrigatórias. Consulte
[consultas v2](../persona-v2/source-queries.md), [OAuth v2](../persona-v2/oauth.md)
e [integração REST](rest-integration.md). O canal do MCP para o hub é REST;
o Socket entre hub e agente não é um canal de consulta do consumidor MCP.

Investigue pelo `supportId` entregue pelo MCP e pelo diagnóstico seguro de
código/etapa. HTTP 200 pode conter falha JSON-RPC. Falha do hub não comprova
expiração OAuth nem justifica reconexão; replay ou execução incerta não autorizam
reenvio. Não registrar SQL, parâmetros, credenciais ou `technical_message` remoto.
O contrato detalhado de precedência e diagnóstico está na integração REST acima.

[Mapeamento de erros](../mcp/error-mapping.md) e
[cofre por acesso](../auth/vault-and-mcp-token.md) documentam também a entrada
legada: não transferir seu modelo de tokens, caches ou credenciais para a v2.
