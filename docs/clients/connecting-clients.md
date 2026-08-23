# Conectar clientes

O cliente MCP usa `Authorization: Bearer <token_mcp>`. Este servidor não publica metadados de Authorization Server.

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

Exemplo: [cursor-mcp.example.json](cursor-mcp.example.json).
