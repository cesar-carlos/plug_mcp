# Allowlists OAuth — runtime legado

Procedimento de manutenção da integração descrita em
[chatgpt-oauth.md](../auth/chatgpt-oauth.md). Não se aplica à persona-v2 e não
autoriza implantação. Estado de um servidor, IDs de acessos e configurações reais
devem ser verificados no ambiente autorizado, sem registrá-los neste guia.

## Configuração

- CHATGPT_OAUTH_ACCESS_IDS: array JSON de UUIDs de acessos existentes autorizados
  para o piloto.
- CHATGPT_OAUTH_CLIENTS: objeto com URLs CIMD e redirects exatos da conexão real.
  Não usar curingas ou deduzir URLs/IDs.
- CHATGPT_OAUTH_ENABLED: decisão explícita do ambiente; o padrão do projeto é false.

Editar somente os campos necessários à operação autorizada. Não criar Client,
usuário ou acesso para contornar a allowlist. JSON inválido impede inicialização.
Segredos, conteúdo de .env e allowlists reais não devem aparecer em logs ou chat.

## Aplicação e verificação

No Compose, mudança de ambiente exige recriar o serviço: reiniciar o mesmo
container não atualiza suas variáveis. Seguir o
[procedimento de implantação](../../README.md#produção-neste-servidor-container)
e o bloqueio de release vigente; este guia não o dispensa.

Verificar health/readiness e discovery. Quando OAuth está habilitado, discovery
responde 200 e /mcp/chatgpt sem credencial responde 401. Allowlists vazias recusam
novas autorizações. Esses checks não certificam instalação ou consentimento no ChatGPT.

Token MCP entra exclusivamente no formulário. Critérios e rollback:
[contrato OAuth](../auth/chatgpt-oauth.md#pacote-e-implantação).
