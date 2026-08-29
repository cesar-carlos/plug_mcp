# Se7e MCP Server — Documentação

O MCP **não** cadastra User/Client/Agent e **não** tem Authorization Server próprio. O usuário já é Client no plug-server. O MCP guarda as quatro credenciais (e-mail, senha cifrada, `agentId`, `client_token`), emite **um** token MCP opaco e dá à IA uma **base de conhecimento** (skill publicada = escopo + metadado). A IA escreve SQL no dialeto do acesso, sempre dentro desse escopo.

Norte de produto: [product/objective.md](product/objective.md). Comunicação com o hub: [plug-server/README.md](plug-server/README.md). Histórico de mudanças: [`../CHANGELOG.md`](../CHANGELOG.md).

## Documentos

| Área                            | Documento                                                                                                              | Conteúdo                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`product/`](product)           | [objective.md](product/objective.md)                                                                                   | Norte: skill como pacote de conhecimento; SQL da IA no escopo |
| [`product/`](product)           | [implementation-plan.md](product/implementation-plan.md)                                                               | Escopo: cofre, grafo, skill, SQL guiado                       |
| —                               | [proposta-arquitetura-mcp-se7e.md](proposta-arquitetura-mcp-se7e.md)                                                   | Arquitetura alvo: três camadas, tools, aceite                 |
| [`architecture/`](architecture) | [hexagonal-architecture.md](architecture/hexagonal-architecture.md)                                                    | Hexágono, ports, composição                                   |
| [`auth/`](auth)                 | [vault-and-mcp-token.md](auth/vault-and-mcp-token.md)                                                                  | Cofre, token MCP, bootstrap, setupCode                        |
| [`data/`](data)                 | [data-model.md](data/data-model.md)                                                                                    | Cofre, grafo composto, sensibilidade, snapshot, skill v2      |
| [`mcp/`](mcp)                   | [tools.md](mcp/tools.md)                                                                                               | Cofre, treino, inspeção, descoberta, consulta, flags          |
| [`mcp/`](mcp)                   | [error-mapping.md](mcp/error-mapping.md)                                                                               | Códigos de erro para a IA                                     |
| [`plug-server/`](plug-server)   | [README.md](plug-server/README.md) · [communication.md](plug-server/communication.md) · [auth.md](plug-server/auth.md) | REST/JSON-RPC como Client; sem Socket na Fase 1               |
| [`clients/`](clients)           | [connecting-clients.md](clients/connecting-clients.md)                                                                 | Bearer do token MCP                                           |

## Princípios

- O usuário **informa** e-mail/senha/`agentId`/`client_token` (+ dialeto). O MCP não cria essa conta.
- Um token MCP por usuário. Acessos extras não pedem senha de novo.
- Consulta ao ERP **só com skill publicada**. A IA escreve SQL **dentro do escopo** (tabela/coluna/JOIN do pacote). Sem skill capaz: não inventar; orientar o cadastro.
- Grafo compartilhado por `agentId` apoia o treino e acumula o que a execução confirma. Leitura filtrada pela policy do `client_token`.
- Sem seed `Fonte`. Sem Client de serviço no `.env`. Sem JWT de conta MCP.
- Autorização SQL permanece 100% no `client_token` / `plug_agente`.
- Com o hub: **só REST** (`POST /api/v1/agents/commands`, `sql.execute`). O MCP não abre Socket `/consumers` nem `/agents`.
