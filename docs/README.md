# Se7e MCP Server — Documentação

O MCP **não** cadastra User/Client/Agent e **não** tem Authorization Server próprio. O usuário já é Client no plug-server. O MCP guarda as quatro credenciais (e-mail, senha cifrada, `agentId`, `client_token`), emite **um** token MCP opaco e dá à IA uma **base de conhecimento**.

Norte: [product/objective.md](product/objective.md). Tools: [mcp/tools.md](mcp/tools.md). Erros: [mcp/error-mapping.md](mcp/error-mapping.md). Hub: [plug-server/communication.md](plug-server/communication.md). Histórico: [`../CHANGELOG.md`](../CHANGELOG.md).

## Documentos

| Área                            | Documento                                                                                                                                                                       | Conteúdo                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`product/`](product)           | [objective.md](product/objective.md)                                                                                                                                            | Norte vivo: SQL+resources+dialeto+skills; papel = persona do acesso + pacote; várias personas = vários acessos |
| [`product/`](product)           | [implementation-plan.md](product/implementation-plan.md)                                                                                                                        | Escopo entregue (não é backlog)                                                                                |
| —                               | [proposta-arquitetura-mcp-se7e.md](proposta-arquitetura-mcp-se7e.md)                                                                                                            | **Histórico** (três camadas). Contrato atual: `objective.md` + `tools.md`                                      |
| [`architecture/`](architecture) | [hexagonal-architecture.md](architecture/hexagonal-architecture.md)                                                                                                             | Hexágono, ports, composição                                                                                    |
| [`auth/`](auth)                 | [vault-and-mcp-token.md](auth/vault-and-mcp-token.md)                                                                                                                           | Cofre, token MCP, bootstrap, setupCode                                                                         |
| [`data/`](data)                 | [data-model.md](data/data-model.md)                                                                                                                                             | Cofre, grafo composto, FTS (`0016`–`0019`, **não** RAG), skill v2, aprendizado (`0020` ciclo de lacuna)        |
| [`mcp/`](mcp)                   | [tools.md](mcp/tools.md)                                                                                                                                                        | Contrato das tools e resources (`guia://`, `skill://`, `persona://`)                                           |
| [`mcp/`](mcp)                   | [error-mapping.md](mcp/error-mapping.md)                                                                                                                                        | Códigos, `source` (`sql` / `sql_engine` / policy / HTTP) e avisos                                              |
| [`plug-server/`](plug-server)   | [README.md](plug-server/README.md) · [communication.md](plug-server/communication.md) · [auth.md](plug-server/auth.md) · [rest-integration.md](plug-server/rest-integration.md) | REST/JSON-RPC como Client; Socket/relay de consumer fora de escopo                                             |
| [`clients/`](clients)           | [connecting-clients.md](clients/connecting-clients.md)                                                                                                                          | Bearer do token MCP; `initialize` / prompt `pre_treino`                                                        |

## Como ler

1. [product/objective.md](product/objective.md) — invariantes: SQL no plug-server, dialeto do `agentId`, resources `guia://` (bootstrap), `skill://` e `persona://` (Bearer); papel = persona (tom) + skills (pacote); várias personas = vários acessos; fail-closed; sem embeddings.
2. [mcp/tools.md](mcp/tools.md) — contrato das tools. Envelope de `buscar_contexto` **sem** `sqlModelo`; `conhecimentos[]` = evidência FTS, não RAG.
3. [mcp/error-mapping.md](mcp/error-mapping.md) — `source`: `sql` (validador) / `sql_engine` (motor) / policy / HTTP; `invalid_payload` **não** reescreve SQL; HTTP 5xx `denied` sem RPC ≠ policy.
4. [plug-server/communication.md](plug-server/communication.md) — canal REST (Socket `/agents` é do `plug_agente`; consumer `/consumers` fora de escopo). Adapter: [rest-integration.md](plug-server/rest-integration.md) (timeout alinhado ao bridge; dois `http(s).Agent` — auth 4 / SQL 16; keepAlive = probe TCP; Nginx 180s na borda; `enriquecer` concorrência 4). Papéis Client: [auth.md](plug-server/auth.md).
5. [data/data-model.md](data/data-model.md) — tabelas, FTS, pacote v2.
6. [auth/vault-and-mcp-token.md](auth/vault-and-mcp-token.md) e [clients/connecting-clients.md](clients/connecting-clients.md) — bootstrap, Bearer, reconectar após deploy.
7. [proposta-arquitetura-mcp-se7e.md](proposta-arquitetura-mcp-se7e.md) — _porquê_ das três camadas (histórico); “Fase 1” ali é jargão da data, não backlog de Socket.

## Princípios

- O usuário **informa** e-mail/senha/`agentId`/`client_token` (+ dialeto). Um token MCP por usuário. Acessos extras não pedem senha de novo.
- Consulta ao ERP **só com skill publicada**. Sem skill capaz: não inventar especialidade nem schema. Norte: [objective.md](product/objective.md).
- Busca de contexto é **FTS léxica** no Postgres — **não** RAG. Modelo: [data-model.md](data/data-model.md).
- Com o hub: **só REST** (`POST /api/v1/agents/commands`). Socket/relay de consumer está fora de escopo.
- Sem seed `Fonte`. Sem Client de serviço no `.env`. Sem JWT de conta MCP. Autorização SQL = policy do `client_token`.
