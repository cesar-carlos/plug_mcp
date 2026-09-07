# Cofre e token MCP

O MCP não tem tela de login nem OAuth 2.1 próprio. Identidade:

1. **Client no plug-server** — e-mail + senha já existentes. O MCP cifra e guarda.
2. **Acesso** — `agentId` + dialeto + `client_token` (N por usuário; unique `(usuarioId, agentId, clientTokenHash)`). **1 `client_token` = 1 persona = 1 catálogo** (skills/grafo/aprendizado em `acesso_id`). Senha autentica o `usuario_mcp`; não é chave de partição. Mesmo e-mail/`agentId` + outro token = outro acesso vazio **com outro Bearer**. Persona opcional (`nomePersona` / `instrucoesPersona`) neste trio; `atualizar_persona` exige confirmação e recusa texto que pareça segredo.
3. **Token MCP** — opaco, hash SHA-256 em `acesso.token_hash`, comparação `timingSafeEqual`. **Um Bearer por acesso.** Autenticação: hash do Bearer → lookup no acesso → sessão `(usuarioId, acessoId)` fixa. Não há auth em `usuario_mcp.token_hash`.

## O que nunca vai a log, tool ou modelo

`access_token` / `refresh_token` do hub, `client_token`, senha, token MCP em claro, `Authorization`, cookie.

## Bootstrap

`POST /mcp` **sem** Bearer só aceita `initialize`, `notifications/initialized`, `tools/list` (catálogo mínimo), `prompts/list`, `prompts/get`, `resources/list`, `resources/templates/list`, `resources/read` e `tools/call` de `registrar_acesso`. Rate limit de bootstrap é mais apertado. Guias `guia://paginacao` e `guia://dialeto/{mssql|sybase|postgres|firebird}` e prompts `pre_treino` / `consultar_com_skill` / `cadastrar_skill` já no bootstrap. `skill://{acessoId}/{slug}`, `persona://` e tools de skill exigem Bearer (URI só se o `acessoId` for desta sessão). `initialize` sem Bearer: só o bloco SQL comum (sem chapéu de persona). Com Bearer: persona **deste** acesso depois do SQL; tools omitem `acessoId`. Hub SQL continua `agentId` + `client_token` daquele acesso.

`registrar_acesso` **não** devolve o token MCP (vaza no transcript). Devolve `setupCode` + `setupUrl`. O usuário abre `GET /setup/{code}` (HTML, one-shot) e copia o token. E-mail existente + senha correta + **novo** `CLIENT_TOKEN` cria outro acesso e **outro** Bearer (não reusa o antigo). Duplicata do trio → `CONFLICT`, sem mint.

`adicionar_acesso` (já autenticado) cria outro acesso vazio, emite outro Bearer via `setupCode`/`setupUrl` e **não** troca a sessão atual.

Rotação: `rotacionar_token_mcp` invalida **só** o hash desta persona e emite outro `setupCode`. Abra `setupUrl` **antes** de reiniciar o processo — o Bearer anterior já não autentica. O código one-shot vale **7 dias** (memória e `mcp_setup`).

TTL do **Bearer**: `MCP_TOKEN_TTL_DAYS` (0 = não expira). `registrar_acesso` / `adicionar_acesso` / `rotacionar_token_mcp` gravam `acesso.token_expires_at`. Bearer expirado → 401 + `WWW-Authenticate` RFC 6750 (`error="invalid_token"`, description apontando `GET /setup/{code}`). `GET /.well-known/oauth-protected-resource` descreve o recurso **sem** `authorization_servers` (token só no setup; não há AS).

TTL do **código de setup** (`GET /setup/{code}`): **7 dias** (`MCP_SETUP_TTL_MS` / `MCP_SETUP_TTL_DAYS`), alinhado na memória e em `mcp_setup`. Não é o TTL de 10 minutos antigo. Cada mint faz dual-write (memória + `McpSetupRepositoryPort.issue`). `GET /setup/{code}` tenta a memória e, se vazia (restart), consome a linha persistida — **one-shot** nos dois. Linhas vencidas são apagadas no `issue`. Duplicata do trio e-mail+`agentId`+`client_token` → `CONFLICT`, sem mint.

Origin: se `MCP_ALLOWED_ORIGINS` não for vazio e o header `Origin` vier com valor fora da lista → **403**. CORS sozinho não basta (spec Streamable HTTP).

Sessões Streamable HTTP são um `Map` in-memory. Rode **1 instância** (PM2 `fork`). Não há Redis de transport.

JWT do hub (`accessToken` / `refreshToken`) **não** vai ao banco — só o `UsuarioTokenManager` em memória. Restart = login de novo com e-mail/senha cifrados. HTTP 401 numa tool: `withHubAuth` invalida o cache e tenta **uma** vez (login/refresh); senha do cofre recusada → `CREDENTIAL_STALE`.

## Um Bearer por acesso

Um par e-mail/senha autentica o usuário. Cada `client_token` (acesso) tem o **próprio** token MCP. Outro Client = outro `registrar_acesso`. `adicionar_acesso` só pede `agentId` / dialeto / `client_token`, **começa catálogo vazio** e devolve o setup da persona nova. **Várias personas = vários acessos = vários Bearers**; um Bearer = um chapéu = um catálogo isolado. `listar_acessos` neste token vê **só** esta persona.

### Cutover `0023_token_por_acesso.sql`

Usuários com **1** acesso herdam o Bearer antigo (`usuario_mcp.token_hash` → `acesso.token_hash`). Com **N>1**, o acesso **mais antigo** herda o Bearer; os demais recebem hash novo e uma linha one-shot em `mcp_setup` (TTL 7 dias). Depois do migrate: `SELECT code, acesso_id, expires_at FROM mcp_setup WHERE expires_at > now();` e `GET /setup/{code}`. Após o TTL, personas extras ficam inalcançáveis até `registrar_acesso` / `adicionar_acesso` / rotação. A coluna `usuario_mcp.token_hash` é **apagada** nesta migration — um só caminho de auth.

Senha do hub mudou: refresh falha → login com senha cifrada falha → `CREDENTIAL_STALE` → `atualizar_credencial_plug`.
