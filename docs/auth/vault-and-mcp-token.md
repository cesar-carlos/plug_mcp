# Cofre e token MCP

O usuário já é Client no plug-server. O MCP mantém Bearer manual, com OAuth opcional para delegação ChatGPT, sem novas contas no hub ou sessão persistente de login. Um client_token identifica um acesso, uma persona, um catálogo e um Bearer. A senha autentica; não particiona o catálogo.

## Cadastro e manutenção no navegador

A SPA `/app` (documentada em [console.md](../clients/console.md)) usa o mesmo cofre: `POST /app/api/setup/registrar` devolve setupUrl; `GET /app/api/setup/:code` devolve purpose, csrf e campos sem consumir o código; o POST de `/setup/:code` aceita HTML ou JSON (`Accept: application/json` devolve `{ token, acessoId }` ou `{ code, message, hint }`).

registrar_acesso (bootstrap), adicionar_acesso, atualizar_credencial_plug e rotacionar_token_mcp recebem um objeto vazio estrito. Argumentos com senha ou tokens são recusados. A resposta contém success, setupUrl e expiresAt. Nunca envie credenciais no chat.

1. Abra setupUrl. GET /setup/:code mostra o formulário e cria proteção CSRF; não consome a operação nem emite Bearer.
2. Preencha as credenciais no formulário e confirme. POST verifica finalidade, expiração, CSRF, Origin, identidade no hub e vínculo com o acesso. Operações autenticadas reautenticam o mesmo Client.
3. O Bearer aparece uma única vez na conclusão do POST. Copie-o para Authorization: Bearer e reconecte. O banco guarda apenas seu hash.

Código aleatório de 256 bits, hash SHA-256 em setup_operation e validade de 15 minutos. Claim atômico impede replay; código vencido/CSRF incorreto é recusado. POST autorizado que falha exige nova URL. Respostas usam no-store e CSP frame-ancestors 'none'. Formulários usam Referrer-Policy same-origin para preservar Origin do POST; demais respostas usam no-referrer, sem referência externa. Logs suprimem códigos, corpos e segredos.

Rotação mantém o Bearer anterior enquanto o formulário não concluir. Na conclusão, sessões, handles e caches do acesso são invalidados. Adicionar acesso cria catálogo vazio sem trocar a sessão atual. Recuperação: registrar_acesso → formulário → opção recuperar → autenticação do mesmo Client e identificação do trio existente. O formulário de credenciais também reautentica no hub.

MCP_TOKEN_TTL_DAYS configura a validade do Bearer (0 = sem expiração). Bearer inválido/expirado retorna 401; nunca vira bootstrap público. Guias públicos dispensam Bearer; skill:// e persona:// exigem Bearer do acesso indicado.

## Autorização e transporte

Toda entrega, incluindo cache hit e exportação, revalida JWT Client, ClientAgentAccess e policy do client_token. Autoridade indisponível bloqueia entrega. Revogação local, troca de recorte/publicação e restrição de sensibilidade durante a consulta também bloqueiam. Policy antiga não autoriza cache.

MCP_ALLOWED_ORIGINS usa PUBLIC_BASE_URL como padrão. Origin ausente é aceito para clientes nativos; null/desconhecido é recusado. MCP_ALLOWED_HOSTS configura hosts e portas (vazio usa host público). TRUST_PROXY aceita somente proxies explícitos. JWTs do hub ficam na memória; senha rejeitada retorna CREDENTIAL_STALE. Retry de autenticação é limitado, sem retry cego de SQL.

Legado mantém sessões/SSE em memória, imutáveis por usuário/acesso; trocar Bearer exige nova sessão. Use uma instância e afinidade de sessão. Protocolo 2026-07-28 reconstrói contexto autenticado por requisição. [Clientes](../clients/connecting-clients.md).

## Migração e rotação de chaves

0023 é histórico: distribuiu Bearers por acesso. 0029 apaga setups legados pendentes em mcp_setup e preserva Bearers existentes. Não exponha códigos por SELECT; regenere pelo formulário autenticado no hub.

Novas cifras usam AES-256-GCM v2 com identificador de chave e AAD. MCP_ENCRYPTION_KEY/KEY_ID definem a chave atual; MCP_ENCRYPTION_PREVIOUS_KEYS é JSON identificador → chave; MCP_ENCRYPTION_LEGACY_KEY permite ler v1 de uma chave anterior. Nunca registre os valores.

Faça backup e ensaie restauração; configure a nova chave/ID mantendo as anteriores; rode npm run vault:rotate (verificação e rollback), depois npm run vault:rotate -- --apply. O script bloqueia linhas, verifica decrypt/encrypt/decrypt e faz compare-and-swap em uma transação. Falha reverte tudo sem imprimir conteúdo. Ensaie primeiro num banco CI efêmero. Mantenha chaves antigas até testar restauração dos backups; só então retire as desnecessárias.

Auditoria guarda IDs, contagens, estágio, origem e duração, nunca SQL, pergunta, parâmetros, resultados ou segredos.

## Conexão ChatGPT

[OAuth opcional](../auth/chatgpt-oauth.md) delega um acesso existente; não altera a autoridade das publicações, a policy ou confirmações. /mcp permanece manual. Perfil/contexto/revogação são tools exclusivas de /mcp/chatgpt. Falha de autenticação OAuth tem stage=oauth e desafio MCP; erros de hub/SQL não provocam reconexão OAuth.
