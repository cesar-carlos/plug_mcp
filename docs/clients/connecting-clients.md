# Conectar clientes MCP

O servidor precisa ser alcançável por HTTPS em produção. Em desenvolvimento local, use um túnel (ngrok, Cloudflare Tunnel) se o host não aceitar `localhost`.

Endpoint MCP: `https://<host>/mcp`

## Cursor

Em MCP settings / `mcp.json`:

```json
{
  "mcpServers": {
    "se7e": {
      "url": "http://127.0.0.1:3333/mcp"
    }
  }
}
```

Se o cliente suportar OAuth, ele abre `/oauth/authorize` e a tela de login. Sem OAuth no cliente, defina `MCP_DEV_BEARER_TOKEN` (somente desenvolvimento) e envie `Authorization: Bearer <token>`.

## Claude / ChatGPT Developer Mode

1. Subir o servidor com `PUBLIC_BASE_URL` público (HTTPS).
2. Criar conector / app apontando para `https://<host>/mcp`.
3. Auth: OAuth. O host registra-se via DCR em `/oauth/register`.
4. Completar login na tela `/oauth/login`.
5. Verificar tools: `listar_ambientes`, `conectar_ambiente`, `listar_fontes`, `obter_fonte`, `buscar_contexto`, `consultar_dados`, `explorar_tabelas`, `testar_sql`, `registrar_fonte`, `anotar_fonte`, `adicionar_relacionamento`, `salvar_consulta` (lista completa em [`../mcp/tools.md`](../mcp/tools.md)).

## Validação desta fase

O protocolo MCP é exercitado de ponta a ponta em `tests/e2e/mcp-protocol.test.ts`: OAuth (DCR + PKCE) → `initialize` Streamable HTTP → `tools/list` → `conectar_ambiente` → `verificar_status_ambiente` → `configurar_client_token` → `obter_fonte` → `consultar_dados`.

Para plugar no Cursor/ChatGPT/Claude, suba `npm run dev` e use a URL `/mcp` (OAuth na primeira conexão). Exemplo Cursor: [cursor-mcp.example.json](cursor-mcp.example.json).

1. Login OAuth (conta MCP).
2. `conectar_ambiente` com `agentId` + dialeto.
3. Aguardar aprovação (`verificar_status_ambiente`).
4. `configurar_client_token`.
5. Perguntar “qual o total de vendas deste mês?” → `buscar_contexto` → `listar_fontes`/`obter_fonte` → `consultar_dados`. Se a resposta estava certa, a IA chama `salvar_consulta`; se corrigir algo, `anotar_fonte` — a base deste `agentId` evolui a cada turno (ver [`../mcp/tools.md`](../mcp/tools.md)).
6. Prompt curto para fonte nova: “quero consultar contas a receber” (ou o próprio SQL) → `testar_sql` lê tipos e códigos da amostra → a IA pergunta o significado (ex. Status `A`) → `registrar_fonte` com `confirmado=true`.
