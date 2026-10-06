# Configurar allowlists OAuth do plugin Se7e

A flag OAuth está ligada. A allowlist tem o cliente CIMD do ChatGPT e o acesso Financeiro Forteza — atendimento a vendedores.

Servidor: `/root/plug_mcp`, branch `main`, SHA em produção `8888671`. URL: `https://mcp.se7esistemassinop.com.br`. Arquivo: `/root/plug_mcp/.env`. Esse arquivo não vai para o Git.

Contrato: [chatgpt-oauth.md](../auth/chatgpt-oauth.md). Pacote: [plugins/se7e-chatgpt/README.md](../../plugins/se7e-chatgpt/README.md).

## Estado atual

Já verificado no container em execução:

- `CHATGPT_OAUTH_ENABLED=true` e `PUBLIC_BASE_URL` canônica.
- `CHATGPT_OAUTH_CLIENTS` contém o CIMD `https://chatgpt.com/oauth/client.json` e o redirect `https://chatgpt.com/connector_platform_oauth_redirect`.
- `CHATGPT_OAUTH_ACCESS_IDS` contém somente `fdc915a9-a08b-4c8d-ac5a-c43969798fe4`: Frigorífico Forteza — financeiro, persona Financeiro Forteza — atendimento a vendedores, sybase, approved, token sem expiração.
- `GET /health` e `GET /ready` respondem 200. SHA `8888671`.
- Discovery OAuth responde 200. `POST /mcp/chatgpt` sem credencial responde 401.
- `GET /oauth/authorize` com esse cliente chega ao formulário do token. O log da etapa `authorize` registrou `success: true`. A falha anterior era `invalid_client`, com a allowlist de clientes vazia.

O formulário do token aceita somente o token MCP desse acesso. Outro acesso é recusado.

## Restrições

- Mantenha `CHATGPT_OAUTH_ENABLED=true`.
- Não faça build da imagem.
- Não rode `git pull` nem faça commit.
- Não use `docker restart`. O mesmo container preserva o ambiente anterior.
- Não imprima nem grave `.env`, `docker compose config`, token MCP, `client_token`, senha, chave de criptografia ou logs com esses valores.
- O token MCP entra só no formulário do navegador.

## Allowlist de acessos

Mantenha `CHATGPT_OAUTH_CLIENTS` como está. Edite só a linha dos acessos, em uma única linha:

```bash
CHATGPT_OAUTH_ACCESS_IDS=["UUID-DO-ACESSO-EXISTENTE"]
```

- O valor é um array JSON de UUIDs. Use o `id` de um acesso que já existe. Não crie usuário, Client nem acesso novo.
- JSON inválido impede o processo de subir.

Para escolher o acesso, no Postgres do Compose, selecione somente estas colunas:

```bash
docker compose exec postgres psql -U postgres -d se7e_mcp -c "select id, nome_amigavel, nome_persona, dialeto, status_acesso from acesso order by created_at;"
```

Não inclua colunas de token ou hash.

## Recriar o container

O shell ganha do `.env`. Limpe variáveis exportadas antes de recriar:

```bash
unset CHATGPT_OAUTH_ENABLED CHATGPT_OAUTH_ACCESS_IDS CHATGPT_OAUTH_CLIENTS
```

Recrie sem build:

```bash
docker compose --profile container up -d --no-deps mcp
```

Confirme que subiu e que a flag continua ligada, sem imprimir as allowlists:

```bash
curl -fsS http://127.0.0.1:3333/health
curl -fsS http://127.0.0.1:3333/ready
docker compose --profile container exec -T mcp node -e 'console.log(process.env.CHATGPT_OAUTH_ENABLED==="true"?"enabled":"disabled")'
```

O discovery deve continuar em 200 e `POST /mcp/chatgpt` sem credencial em 401. Se `/health` não voltar, o JSON ficou inválido: corrija o `.env` e recrie de novo.
