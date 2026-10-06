# Conectar clientes

O cliente MCP usa `Authorization: Bearer <token_mcp>`. Com CHATGPT_OAUTH_ENABLED, /mcp/chatgpt publica discovery e aceita apenas OAuth; /mcp continua manual.

Nos clientes legados, no `initialize`, o servidor envia `instructions` com o pre-treino de sessão (SQL no **escopo da skill publicada**, depois a persona). Sem Bearer: só o SQL comum. Com Bearer: SQL inalterado + persona **deste** acesso depois — o Bearer autentica exatamente um acesso. **Várias personas = vários acessos = vários Bearers** (`adicionar_acesso` / `registrar_acesso`); um Bearer = um chapéu; não concatena chapéus. O protocolo só reenvia isso no `initialize`. `adicionar_acesso` **não** troca o chapéu desta sessão (devolve `setupUrl` da persona nova — conecte outro servidor MCP no host). Este Bearer nunca ganhou um segundo chapéu; o host pode manter `instructions` do chapéu 1 até reconectar. Chat novo na mesma conexão MCP pode não receber de novo — use o prompt `pre_treino` (sem argumentos; **releitura viva** da persona no banco) se o host não reinsere `instructions`. Após deploy, reconecte o cliente: o catálogo `tools/list` pode estar cacheado. O servidor envia `notifications/tools/list_changed` no `initialize` autenticado se SHA/versão do processo mudou. Resources: `guia://paginacao` e `guia://dialeto/{mssql|sybase|postgres|firebird}` já no bootstrap (sem Bearer) e após Bearer — leia o guia do dialeto do acesso, não assuma mssql. Identificar o GDBR e emitir SQL compatível é treino + IA; o `plug_server` não reescreve dialeto ([objective.md](../product/objective.md)). `skill://{acessoId}/{slug}` é o pacote da skill publicada (URI com `acessoId`; leitura só se for desta sessão) e exige Bearer. `persona://{acessoId}` (Bearer) é a persona do acesso (tom/uso; **não** recorta skills **dentro** do acesso). Tools omitem `acessoId`. Dois `client_token` no mesmo e-mail/`agentId` são catálogos distintos, cada um com o próprio Bearer. Hub SQL continua `agentId` + `client_token` daquele acesso.

Em clientes legados, o host (Cursor e similares) copia `initialize.instructions` no system prompt **na conexão**. Cada persona precisa de **uma entrada de servidor MCP** (um Bearer). Após rebuild/deploy, **reconecte** o MCP; senão a IA continua com `instructions` antigas (chapéu fixo, dialeto assumido) mesmo com o código novo no disco.

## Fluxo

1. Apontar o cliente para `https://<host>/mcp` **sem** token (Bearer inválido retorna 401).
2. Chamar `registrar_acesso({})` e preencher e-mail/senha/agentId/dialeto/client_token somente no formulário.
3. Abrir setupUrl no navegador, confirmar o POST com CSRF, copiar o Bearer mostrado uma vez, configurar o cliente e reconectar. GET não emite nem consome Bearer.

## Cursor

```json
{
  "mcpServers": {
    "se7e-vendedor": {
      "url": "http://127.0.0.1:3333/mcp",
      "headers": {
        "Authorization": "Bearer <token-da-pagina-setup-desta-persona>"
      }
    },
    "se7e-gestor": {
      "url": "http://127.0.0.1:3333/mcp",
      "headers": {
        "Authorization": "Bearer <token-da-outra-persona>"
      }
    }
  }
}
```

Uma entrada Cursor **por persona** (por Bearer). Não compartilhe o mesmo token MCP entre catálogos.

ChatGPT utiliza o Authorization Server integrado opcional descrito em [chatgpt-oauth.md](../auth/chatgpt-oauth.md). TTL do token, Origin e `/.well-known/oauth-protected-resource`: [vault-and-mcp-token.md](../auth/vault-and-mcp-token.md).

O host MCP pode registrar argumentos em transcript; por isso as tools de credenciais recusam esses argumentos. Nunca cole senha/client_token/Bearer na conversa.

Exemplo: [cursor-mcp.example.json](cursor-mcp.example.json).

## Protocolos no mesmo endpoint

| Cliente    | Comportamento                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Legado     | initialize, notifications/initialized, mcp-session-id, SSE GET, DELETE e notificações; sessão fixa por usuário/acesso |
| 2026-07-28 | descoberta MCP e contexto autenticado por requisição, MCP-Method/MCP-Name conforme SDK v2                             |

Ambos usam /mcp. Troca de Bearer em sessão legada retorna 403: abra nova sessão. Bearer inválido retorna 401 em ambos, sem fallback público. No protocolo moderno, resources/read usa MCP-Name com a URI do resource; guias permanecem públicos. Sessões/assinaturas são limitadas e expiram por inatividade. Origin null/desconhecido e Host não configurado são recusados; Origin ausente é permitido para clientes nativos.

## Clientes de treinamento

Leia `obter_treinamento_base`/guias públicos antes do pacote do acesso. Para confirmar exemplo por `salvar_consulta`, armazene candidata ID e hash do preview, mostre ao humano e envie confirmação em segunda chamada. Booleano isolado não aprova. Criação de caso precisa reenviar ID e versão 0 do preview. Migre clientes de uma chamada para esse fluxo; estado da publicação e rascunho continuam separados. [Guia de treinamento](../product/training.md).

## Conexão ChatGPT

[OAuth opcional](../auth/chatgpt-oauth.md) delega um acesso existente; não altera a autoridade das publicações, a policy ou confirmações. /mcp permanece manual. Perfil/contexto/revogação são tools exclusivas de /mcp/chatgpt. Falha de autenticação OAuth tem stage=oauth e desafio MCP; erros de hub/SQL não provocam reconexão OAuth.
