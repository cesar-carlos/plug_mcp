# ChatGPT: delegação OAuth de um acesso Se7e

Status: implementação local; instalação e homologação real do piloto dependem da URL HTTPS e conexão privada. Testes locais não certificam funcionamento no ChatGPT.

## Configuração e vínculo

`CHATGPT_OAUTH_ENABLED=false` por padrão. Habilitar exige `PUBLIC_BASE_URL` HTTPS canônica sem path/query/user-info e PostgreSQL (memória somente em testes). `CHATGPT_OAUTH_ACCESS_IDS` é um array JSON de UUIDs. `CHATGPT_OAUTH_CLIENTS` é um objeto JSON com URLs CIMD como chaves e arrays de redirects exatos. Arrays vazios publicam discovery e recusam novas autorizações. Copie os valores da conexão real; sem curingas.

Um acesso/persona/catalogo pode ter várias concessões. CIMD identifica cliente OAuth, não workspace. Distribuição privada e allowlist de acessos delimitam o piloto; não há garantia criptográfica de workspace. Sem DCR, OIDC, login social, novas contas ou JWT próprio. mTLS é evolução posterior no proxy, não substitui OAuth.

Na implantação por Compose, o serviço `mcp` repassa explicitamente as três variáveis `CHATGPT_OAUTH_*` do ambiente ou `.env`. O `.env` não é copiado para a imagem nem carregado pelo entrypoint; uma variável usada apenas no arquivo do host não chega automaticamente ao container. Após alterar a configuração, recrie o serviço conforme o [procedimento de produção](../../README.md#produção-neste-servidor-container); reiniciar o mesmo container mantém o ambiente anterior. Os defaults continuam `false`, `[]` e `{}`.

Se `/health` e `/ready` respondem 200, mas `/mcp/chatgpt` e os dois endpoints de discovery OAuth respondem 404, confira a versão implantada e o repasse da flag ao container. Com OAuth habilitado, discovery deve responder 200 e `/mcp/chatgpt` sem credencial deve responder 401. Allowlists vazias permitem essa descoberta, mas recusam novas autorizações; configure somente os acessos e valores CIMD/redirect reais antes de conectar a persona.

## HTTP e navegador

`/mcp` preserva bootstrap e Bearer manual. `/mcp/chatgpt` exige OAuth desde initialize; Bearer manual não é aceito. Discovery: `/.well-known/oauth-protected-resource/mcp/chatgpt` e `/.well-known/oauth-authorization-server`.

`GET /oauth/authorize` exige code, cliente/redirect permitidos, resource igual à URL /mcp/chatgpt, scope `se7e:access` e PKCE S256. POST URL-encoded em `/oauth/authorize/authenticate` recebe token MCP em campo de senha. O consentimento em `/oauth/authorize/consent` mostra persona/capacidades e exige confirmar/cancelar. Nonce em cookie temporário Secure/HttpOnly/SameSite=Lax, CSRF renovado, Origin exato nos POSTs de navegador. Respostas no-store/frame-ancestors none, HTML escapado sem recursos externos. Páginas com formulário usam Referrer-Policy same-origin para preservar Origin nos POSTs reais do Chromium; redirects e demais respostas mantêm no-referrer. O callback externo não recebe Referer. CSP permite somente o próprio servidor e o destino de callback previamente validado, sem liberar scripts. Callback recebe code/state/iss por 303; redirect inválido é erro local.

CIMD usa HTTPS, allowlist exata, nenhum redirect, limite 64 KiB e timeout total 5s. Suporta métodos no campo plural, com fallback singular; escolhe none da interseção. Rejeita DNS privado/reservado/misto e fixa o IP validado na conexão TLS. Cache positivo de até 5min; falha não reutiliza documento vencido.

`POST /oauth/token`: authorization_code requer código, client_id, redirect_uri, resource e code_verifier. Refresh requer refresh_token/client_id; resource/scope opcionais precisam corresponder. Não aceita segredo de cliente ou assertion. Resposta Bearer + expires_in + refresh_token + scope, no-store. `POST /oauth/revoke` aceita token/client_id e revoga toda a concessão; token desconhecido retorna 200.

## Validade e persistência

Transação 15min; código 60s de uso único; access token 15min; concessão/refresh 30 dias absolutos, sempre limitados pelo token MCP de origem. Segredos >=256 bits e hashes somente. `state` é preservado temporariamente para devolução, nunca auditado. Migração 0034 adiciona transação, código, concessão e access/refresh, com FK por acesso/concessão e proveniência de setup. Credenciais manuais/publicações não são substituídas.

Código e refresh são consumidos em transações atômicas. Replay validamente vinculado revoga a família; verifier/cliente incorreto não revoga terceiros. Sem tolerância ao replay: resposta de refresh perdida pode exigir reconexão. Consumidos ficam disponíveis para detecção até expiração da família. Limpeza não é requisito para negar credenciais vencidas.

Rotação, recuperação, expiração, remoção/revogação do acesso e retirada da allowlist bloqueiam concessões derivadas. Um trigger PostgreSQL invalida concessões/códigos/transações ao substituir o hash MCP ou revogar o acesso; restaurar o hash/status não as recupera. Reconciliação no início e periodicamente persiste invalidação para impedir ressuscitação após reativar uma allowlist. Verificação corrente não depende desse job.

## Operações, sessões e dados

Identidade interna discrimina manual/OAuth e guarda somente referências. Verificar antes do hub e da entrega; mutações usam AuthorizedUnitOfWorkPort e repositórios vinculados à mesma transação, bloqueando acesso → concessão → negócio. A classificação explícita dos métodos substitui Proxy do pool e inspeção de SQL. Revalidação temporal ocorre antes do commit, e falhas desfazem todas as gravações. O adapter em memória serializa com OAuthStore e restaura o estado em rollback. Não mantém transação aberta durante hub. Revogar antes da autorização de commit impede escrita; efeitos externos já enviados/concluídos não são desfeitos. Bytes já entregues não são recolhidos.

Sessões legadas e handlers/assinaturas modernos vinculam concessão. Refresh mantém identidade; credencial nova reconecta streams que expiraram. Quotas globais são compartilhadas. Cache/singleflight incluem concessão + hash de origem além de policy/publicações. Handles também vinculam concessão e não atravessam reconexões novas. Erro/anexo não é cacheado.

Setup criado via OAuth guarda grantId mesmo para novo acesso e o revalida ao abrir/concluir. Prazo próprio 15min e concessão, não access token inicial. Reautenticação no hub permanece. Rotação concluída entrega Bearer no navegador uma vez e invalida a conexão antiga.

Tools novas: `get_profile({})` retorna id opaco estável e nome sem email; `obter_contexto_sessao({})` retorna base/persona/dialeto; `revogar_conexao_chatgpt({confirmadoPeloUsuario:true})` entrega somente comprovante e encerra a concessão. Ferramentas existentes são decoradas automaticamente com OAuth e annotations conforme efeitos. OAuth inválido tem stage=oauth e `_meta["mcp/www_authenticate"]`; hub/policy/SQL/503 não inicia login OAuth.

## Pacote e implantação

Fonte em `plugins/se7e-chatgpt`. `npm run plugin:package -- --portable` gera pacote HTTP; `npm run plugin:package -- --connection-id=ID_REAL` gera variante ChatGPT com `.app.json`, sem segundo servidor mcp.json. O script exige PUBLIC_BASE_URL HTTPS e recusa placeholders. Artefatos em build/ são ignorados e cada geração exige diretório novo, evitando mistura. Cadastre o servidor privado no ChatGPT e use o ID real plugin_asdk_app antes de gerar o pacote ChatGPT. Instale em marketplace local para teste e depois distribua privadamente pelo workspace.

Aplicar migração com flag desligada, implantar/verificar clientes existentes, habilitar discovery, cadastrar conexão e liberar apenas os acessos do piloto. Uma instância inicialmente. Não alterar o contrato REST do hub.

Rollback: desligar flag/reiniciar para bloquear rotas e encerrar sessões; executar `npm run oauth:revoke -- --all --confirm` para invalidar concessões, códigos/transações. Reativar não restaura tokens. A migração é aditiva e permanece.

Auditoria/logs: somente etapas/IDs/contagens/duração/resultados; nunca token/código/verifier/state/cookie/CSRF, corpo ou Location sensível. Configure também o proxy para não registrar query, Authorization, Set-Cookie, Location ou corpos nessas rotas. Banco indisponível bloqueia autenticação e retorna 503; Redis é otimização.

## Aceite e referências

Resultados locais e checklist de homologação: [registro de validação](../operations/chatgpt-validation.md).

Implementação: release:check, migração nova/upgrades e concorrência PostgreSQL. Integração: fluxo HTTPS real. Piloto: instalação, persona, consulta/paginação, anexo, treino/preview/confirmação/publicação, negativa fora do pacote, renovação/reconexão/revogação e duas personas. Registrar versão/resultado sem dados sensíveis. Sem credenciais operacionais, estes dois últimos marcos permanecem pendentes.

- [Autenticação OpenAI](https://developers.openai.com/plugins/build/auth)
- [Pacote OpenAI](https://developers.openai.com/plugins/build/plugins)
- [Segurança MCP](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)
- [OAuth Security BCP](https://www.rfc-editor.org/rfc/rfc9700.html)

## Verificação de prontidão

`npm run chatgpt:check -- --stage=prepare [--json]` verifica Node, configuração HTTPS, PostgreSQL e todas as migrações exigidas. Permite flag desligada e allowlists vazias.

`npm run chatgpt:check -- --stage=pilot --package=<diretorio> --connection-id=<ID_REAL> [--json]` acrescenta allowlists/acessos vigentes, CIMD, discovery público, desafio 401 e pacote com referência exclusiva da conexão. IDs apenas sintaticamente válidos não comprovam cadastro, URL da conexão ou instalação no ChatGPT.

O comando só executa SELECT em transação read-only e GETs limitados; não migra, autentica usuários, emite tokens nem cria transações de autorização. Saídas: 0 para checks automáticos aprovados, 1 para falha, 2 para argumentos/entradas ausentes. Relatório inclui versão/horário/etapa/check/ação e homologação not_verified, sem erros brutos, respostas ou credenciais. Confirme separadamente cadastro, configuração do proxy e homologação no workspace.

`npm run test:chatgpt:https` exercita sockets e TLS reais. `npm run test:chatgpt:browser` exige NODE_ENV=test e DATABASE_URL de CI: cria/remove seu próprio banco efêmero e executa Chromium com confiança limitada ao certificado sintético. Nunca use credenciais operacionais para testes.

O pacote inclui `se7e-package.json` com variante, versão, URL/recurso e ID da conexão. A prontidão exige correspondência com o ambiente atual; não verifica automaticamente a configuração interna da conexão no ChatGPT. Acessos adicionais envolvidos numa gravação são declarados antes da transação e bloqueados em ordem de ID, antes da concessão.
