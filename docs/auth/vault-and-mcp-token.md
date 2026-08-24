# Cofre e token MCP

O MCP não tem tela de login nem OAuth 2.1 próprio. Identidade:

1. **Client no plug-server** — e-mail + senha já existentes. O MCP cifra e guarda.
2. **Acesso** — `agentId` + dialeto + `client_token` (N por usuário; unique `(usuarioId, agentId, clientTokenHash)`).
3. **Token MCP** — opaco, hash SHA-256 no banco, comparação `timingSafeEqual`. Um por usuário.

## O que nunca vai a log, tool ou modelo

`access_token` / `refresh_token` do hub, `client_token`, senha, token MCP em claro, `Authorization`, cookie.

## Bootstrap

`POST /mcp` **sem** Bearer só aceita `initialize`, `notifications/initialized`, `tools/list` (catálogo mínimo) e `tools/call` de `registrar_acesso`. Rate limit de bootstrap é mais apertado.

`registrar_acesso` **não** devolve o token MCP (vaza no transcript). Devolve `setupCode` + `setupUrl`. O usuário abre `GET /setup/{code}` (HTML, one-shot) e copia o token.

Rotação: `rotacionar_token_mcp` invalida o hash e emite outro `setupCode`.

TTL: `MCP_TOKEN_TTL_DAYS` (0 = não expira). `registrar_acesso` / `rotacionar_token_mcp` gravam `token_expires_at`. Bearer expirado → 401 + `WWW-Authenticate` RFC 6750 (`error="invalid_token"`, description apontando `GET /setup/{code}`). `GET /.well-known/oauth-protected-resource` descreve o recurso **sem** `authorization_servers` (token só no setup; não há AS).

Origin: se `MCP_ALLOWED_ORIGINS` não for vazio e o header `Origin` vier com valor fora da lista → **403**. CORS sozinho não basta (spec Streamable HTTP).

Sessões Streamable HTTP são um `Map` in-memory. Rode **1 instância** (PM2 `fork`). Não há Redis de transport.

## Um Client por token MCP

Um par e-mail/senha por usuário MCP. Outro Client = outro `registrar_acesso`. `adicionar_acesso` só pede `agentId` / dialeto / `client_token`.

Senha do hub mudou: refresh falha → login com senha cifrada falha → `CREDENTIAL_STALE` → `atualizar_credencial_plug`.
