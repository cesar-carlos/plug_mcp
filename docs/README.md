# Se7e MCP Server — Documentação

O MCP **não** cadastra User/Client/Agent e **não** tem Authorization Server próprio. O usuário já é Client no plug-server. O MCP guarda as quatro credenciais (e-mail, senha cifrada, `agentId`, `client_token`), emite **um** token MCP opaco e dá à IA uma **base de conhecimento** (skill publicada = escopo + metadado). A IA escreve SQL no dialeto do acesso, sempre dentro desse escopo.

Norte de produto: [product/objective.md](product/objective.md). Contrato das tools: [mcp/tools.md](mcp/tools.md). Comunicação com o hub: [plug-server/README.md](plug-server/README.md). Histórico de mudanças: [`../CHANGELOG.md`](../CHANGELOG.md).

## Documentos

| Área                            | Documento                                                                                                                                                                       | Conteúdo                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`product/`](product)           | [objective.md](product/objective.md)                                                                                                                                            | Norte vivo: pacote publicado, envelope slim de `buscar_contexto`, aprendizado |
| [`product/`](product)           | [implementation-plan.md](product/implementation-plan.md)                                                                                                                        | Escopo entregue: cofre, grafo, skill, FTS, SQL no pacote                      |
| —                               | [proposta-arquitetura-mcp-se7e.md](proposta-arquitetura-mcp-se7e.md)                                                                                                            | **Histórico** (três camadas). Contrato atual: `objective.md` + `tools.md`     |
| [`architecture/`](architecture) | [hexagonal-architecture.md](architecture/hexagonal-architecture.md)                                                                                                             | Hexágono, ports, composição                                                   |
| [`auth/`](auth)                 | [vault-and-mcp-token.md](auth/vault-and-mcp-token.md)                                                                                                                           | Cofre, token MCP, bootstrap, setupCode                                        |
| [`data/`](data)                 | [data-model.md](data/data-model.md)                                                                                                                                             | Cofre, grafo composto, FTS (`0016`–`0019`, **não** RAG), skill v2, aprendizado |
| [`mcp/`](mcp)                   | [tools.md](mcp/tools.md)                                                                                                                                                        | Cofre, treino, inspeção, descoberta, consulta, flags                          |
| [`mcp/`](mcp)                   | [error-mapping.md](mcp/error-mapping.md)                                                                                                                                        | Códigos de erro e avisos para a IA                                            |
| [`plug-server/`](plug-server)   | [README.md](plug-server/README.md) · [communication.md](plug-server/communication.md) · [auth.md](plug-server/auth.md) · [rest-integration.md](plug-server/rest-integration.md) | REST/JSON-RPC como Client; sem Socket na Fase 1                               |
| [`clients/`](clients)           | [connecting-clients.md](clients/connecting-clients.md)                                                                                                                          | Bearer do token MCP; `initialize` / prompt `pre_treino`                       |

## Como ler

1. [product/objective.md](product/objective.md) — invariantes (pacote = autoridade; envelope de busca sem SQL).
2. [mcp/tools.md](mcp/tools.md) e [mcp/error-mapping.md](mcp/error-mapping.md) — contrato das tools e códigos.
3. [data/data-model.md](data/data-model.md) — tabelas, FTS, pacote v2.
4. [plug-server/](plug-server) — canal REST com o hub.
5. [proposta-arquitetura-mcp-se7e.md](proposta-arquitetura-mcp-se7e.md) — _porquê_ das três camadas; apêndices A–C são diagnóstico/aceite da data da proposta.

## Princípios

- O usuário **informa** e-mail/senha/`agentId`/`client_token` (+ dialeto). O MCP não cria essa conta.
- Um token MCP por usuário. Acessos extras não pedem senha de novo.
- Consulta ao ERP **só com skill publicada**. A IA escreve SQL **dentro do escopo** (tabela/coluna/JOIN do pacote). `buscar_contexto` não devolve SQL — reuse `consultasAprendidas[].id` em `obter_skill`. Sem skill capaz: não inventar; orientar o cadastro.
- Busca de contexto é **FTS léxica** no Postgres (`tsvector` `portuguese` + `unaccent` + `ts_rank` + `ILIKE`/`pg_trgm`). **Não** é RAG: sem embeddings, sem pgvector, sem índice do SQL aprendido. `conhecimentos[]` é evidência (teto 8) e **não** autoriza `consultar_dados`. Cobertura certificada (nome/slug/descrição/params/`metricasSaida`) é o que libera `consultaPermitida`.
- Grafo compartilhado por `agentId` apoia o treino e acumula o que a execução confirma. Leitura filtrada pela policy do `client_token`.
- Sem seed `Fonte`. Sem Client de serviço no `.env`. Sem JWT de conta MCP.
- Autorização SQL permanece 100% no `client_token` / `plug_agente`.
- Com o hub: **só REST** (`POST /api/v1/agents/commands`, `sql.execute`). O MCP não abre Socket `/consumers` nem `/agents`.
