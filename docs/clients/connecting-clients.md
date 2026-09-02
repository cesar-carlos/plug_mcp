# Conectar clientes

O cliente MCP usa `Authorization: Bearer <token_mcp>`. Este servidor não publica metadados de Authorization Server.

No `initialize`, o servidor envia `instructions` com o pre-treino de sessão (SQL no **escopo da skill publicada**, depois a persona). Sem Bearer: só o SQL comum. Com Bearer e um acesso: SQL inalterado + persona depois. Com vários acessos: SQL comum + “depois de escolher o acesso, adote a persona desse `acessoId`” — **várias personas = vários acessos** (`adicionar_acesso`); um acesso = um chapéu; não concatena chapéus; leia `listar_acessos` / `persona://{acessoId}`. O protocolo só reenvia isso no `initialize`. Sessão que começa com 1 acesso e ganha o 2º (`adicionar_acesso`) **mantém o chapéu 1** em `initialize.instructions` até reconectar. Chat novo na mesma conexão MCP pode não receber de novo — use o prompt `pre_treino` (sem argumentos; **releitura viva** da persona no banco; com N acessos não concatena) se o host não reinsere `instructions`. Após deploy, reconecte o cliente: o catálogo `tools/list` pode estar cacheado. O servidor envia `notifications/tools/list_changed` no `initialize` autenticado se SHA/versão do processo mudou. Resources: `guia://paginacao` e `guia://dialeto/{mssql|sybase|postgres|firebird}` já no bootstrap (sem Bearer) e após Bearer — leia o guia do dialeto do acesso, não assuma mssql. Identificar o GDBR e emitir SQL compatível é treino + IA; o `plug_server` não reescreve dialeto ([objective.md](../product/objective.md)). `skill://{agentId}/{slug}` é o pacote da skill publicada e exige Bearer. `persona://{acessoId}` (Bearer) é a persona do acesso.

O host (Cursor e similares) copia `initialize.instructions` no system prompt **na conexão** e **não** atualiza no meio da sessão. Se a sessão começou com um acesso e o usuário chama `adicionar_acesso`, o host continua com o chapéu 1 até reconectar; `pre_treino` relê o banco. Após rebuild/deploy, **reconecte** o MCP; senão a IA continua com `instructions` antigas (chapéu fixo, dialeto assumido) mesmo com o código novo no disco.

## Fluxo

1. Apontar o cliente para `https://<host>/mcp` **sem** token (ou com token inválido só para descobrir tools de bootstrap, conforme o host).
2. Chamar `registrar_acesso` com e-mail/senha/`agentId`/dialeto/`client_token`.
3. Abrir `setupUrl` no navegador, copiar o token, colar no `mcp.json` (ou equivalente) e reconectar.

## Cursor

```json
{
  "mcpServers": {
    "se7e": {
      "url": "http://127.0.0.1:3333/mcp",
      "headers": {
        "Authorization": "Bearer <cole-o-token-da-pagina-setup>"
      }
    }
  }
}
```

Conectores que **exigem** Authorization Server de terceiros (alguns custom connectors ChatGPT) ficam fora de escopo. TTL do token, Origin e `/.well-known/oauth-protected-resource`: [vault-and-mcp-token.md](../auth/vault-and-mcp-token.md).

O **host MCP** (Cursor, Claude Desktop, etc.) pode registrar argumentos de tool em claro — senha e `client_token` inclusive. O servidor não controla esse transcript. Não ecoe esses valores na resposta; `listar_acessos` devolve o token mascarado.

Exemplo: [cursor-mcp.example.json](cursor-mcp.example.json).
