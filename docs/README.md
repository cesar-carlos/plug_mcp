# Se7e MCP Server — Documentação

O MCP **não** cadastra User/Client/Agent e **não** tem Authorization Server próprio. O usuário já é Client no plug-server. O MCP guarda as quatro credenciais (e-mail, senha cifrada, `agentId`, `client_token`), emite **um** token MCP opaco e dá **contexto à IA** via skills publicadas (grafo de schema só no treino).

Norte de produto: [product/objective.md](product/objective.md). Comunicação com o hub: [plug-server/README.md](plug-server/README.md). Histórico de mudanças: [`../CHANGELOG.md`](../CHANGELOG.md).

## Documentos

| Área                            | Documento                                                                                                              | Conteúdo                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [`product/`](product)           | [objective.md](product/objective.md)                                                                                   | Norte: skill como bússola; sem inventar         |
| [`product/`](product)           | [implementation-plan.md](product/implementation-plan.md)                                                               | Escopo: cofre, grafo de treino, skills          |
| [`architecture/`](architecture) | [hexagonal-architecture.md](architecture/hexagonal-architecture.md)                                                    | Hexágono, ports, composição                     |
| [`auth/`](auth)                 | [vault-and-mcp-token.md](auth/vault-and-mcp-token.md)                                                                  | Cofre, token MCP, bootstrap, setupCode          |
| [`data/`](data)                 | [data-model.md](data/data-model.md)                                                                                    | `usuario_mcp`, `acesso`, grafo, skill           |
| [`mcp/`](mcp)                   | [tools.md](mcp/tools.md)                                                                                               | Tools de cofre, treino, schema, consulta        |
| [`mcp/`](mcp)                   | [error-mapping.md](mcp/error-mapping.md)                                                                               | Códigos de erro para a IA                       |
| [`plug-server/`](plug-server)   | [README.md](plug-server/README.md) · [communication.md](plug-server/communication.md) · [auth.md](plug-server/auth.md) | REST/JSON-RPC como Client; sem Socket na Fase 1 |
| [`clients/`](clients)           | [connecting-clients.md](clients/connecting-clients.md)                                                                 | Bearer do token MCP                             |

## Princípios

- O usuário **informa** e-mail/senha/`agentId`/`client_token` (+ dialeto). O MCP não cria essa conta.
- Um token MCP por usuário. Acessos extras não pedem senha de novo.
- Consulta ao ERP **só com skill publicada**. Sem skill capaz (dado ou cruzamento): não inventar; orientar o cadastro.
- Grafo compartilhado por `agentId` apoia o **treino**. Leitura filtrada pela policy do `client_token`.
- Sem seed `Fonte`. Sem Client de serviço no `.env`. Sem JWT de conta MCP.
- Autorização SQL permanece 100% no `client_token` / `plug_agente`.
- Com o hub: **só REST** (`POST /api/v1/agents/commands`, `sql.execute`). O MCP não abre Socket `/consumers` nem `/agents`.
