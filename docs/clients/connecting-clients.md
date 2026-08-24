# Conectar clientes

O cliente MCP usa `Authorization: Bearer <token_mcp>`. Este servidor não publica metadados de Authorization Server.

No `initialize`, o servidor envia `instructions` com o pre-treino de sessão (consultor de gestão; SQL só no treino). O protocolo só reenvia isso no `initialize`. Chat novo na mesma conexão MCP pode não receber de novo — use o prompt `pre_treino` (sem argumentos) se o host não reinsere `instructions`.

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

Conectores que **exigem** Authorization Server de terceiros (alguns custom connectors ChatGPT) ficam fora desta fase.

Token MCP pode expirar (`MCP_TOKEN_TTL_DAYS` > 0): o servidor responde 401 com `WWW-Authenticate` RFC 6750 (`error="invalid_token"`) e aponta `GET /setup/{code}`. `Origin` fora de `MCP_ALLOWED_ORIGINS` (quando a lista não é vazia) responde **403**. Existe `GET /.well-known/oauth-protected-resource` descrevendo o recurso **sem** `authorization_servers`.

O **host MCP** (Cursor, Claude Desktop, etc.) pode registrar argumentos de tool em claro — senha e `client_token` inclusive. O servidor não controla esse transcript. Não ecoe esses valores na resposta; `listar_acessos` devolve o token mascarado.

Exemplo: [cursor-mcp.example.json](cursor-mcp.example.json).
