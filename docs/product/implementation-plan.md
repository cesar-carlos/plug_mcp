# Plano de implementação — Fase 1

## Objetivo

Entregar o `se7e-mcp-server`: servidor MCP remoto (Streamable HTTP) com OAuth 2.1 próprio, catálogo multi-dialeto, onboarding conversacional e execução SQL via REST no `plug-server`.

## Dentro do escopo

- Servidor MCP Streamable HTTP (`POST /mcp`).
- Authorization Server OAuth 2.1 + PKCE + DCR e uma tela de login/registro.
- Cliente REST do `plug-server` (login de serviço, refresh, agents, `sql.execute`).
- Catálogo semântico com variantes SQL para `mssql`, `sybase`, `postgres` e `firebird`.
- Tools de onboarding, catálogo e consulta.
- Erros estruturados (`code`, `message`, `hint`, `retryable`).
- Auditoria de consultas. Sem painel administrativo.

## Fora do escopo (Fase 2)

- Apps SDK / widgets de UI no ChatGPT.
- Adapter Socket/relay do `plug-server`.
- Publicação no diretório de apps da OpenAI.

## Decisões

| Tema                            | Escolha                                              |
| ------------------------------- | ---------------------------------------------------- |
| Acesso ao banco ERP             | Somente via `plug-server`                            |
| Canal MCP ↔ plug-server         | REST (`POST /api/v1/agents/commands`)                |
| Identidade no plug-server       | MCP é um `Client` de serviço (não `Agent`)           |
| Identidade no MCP               | Conta própria + JWT OAuth (`sub` = `mcp_account.id`) |
| Dialeto                         | Informado pelo usuário ao conectar o ambiente        |
| Restrição extra a SELECT no MCP | Não. Autorização fica no `client_token`              |
| Painel admin                    | Não. Tudo via tools / seed                           |
| Transporte MCP                  | Streamable HTTP                                      |
| HTTP                            | Express                                              |
| Persistência                    | PostgreSQL + Drizzle                                 |

## Ordem de entrega

1. Documentação em `docs/`.
2. Scaffold TypeScript / Express / hexagonal.
3. OAuth 2.1.
4. Adapter REST do plug-server + TokenManager.
5. Mapeamento de erros.
6. Persistência e repositórios.
7. Tools de onboarding.
8. Tools de catálogo + seed.
9. Tool `consultar_dados`.
10. Testes unitários e de integração.
11. Validação ponta a ponta do protocolo MCP (HTTP in-process) e guia de conexão em clientes reais.

## Critérios de sucesso

- Usuário conecta ambiente (`agentId` + dialeto + `client_token`) pelo chat.
- IA descobre fontes, obtém SQL base no dialeto certo, consulta e recebe erro acionável quando falhar.
- Nenhuma senha de terceiros do `plug-server` passa pelo chat.
- Trocar REST por Socket no futuro altera só o adapter (`PlugServerGatewayPort`).
