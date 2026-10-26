# Primeiro deploy em servidor de teste

O fluxo está implementado em 2026-10-25 para um servidor sem clientes, conforme
[DV2-017](decisions.md#dv2-017--primeiro-servidor-de-teste--2026-10-25).
Teste manual prévio e aceite funcional humano estão dispensados, não aprovados.
O primeiro deploy remoto foi executado em 2026-10-25; veja a
[evidência do servidor](validation/2026-10-25-first-remote-test-deployment.md).
As instruções abaixo também servem para preparar um novo destino.

## Atualização de aparência do console

`npm run build --prefix web` fixa `NODE_ENV=production` somente no processo de
build do frontend. As fixtures mantêm `NODE_ENV=test` no backend; a interface
testada deve ser a mesma variante distribuída pelo Docker, sem herdar o modo
de teste do processo chamador. `npm run dev --prefix web` permanece separado.

As alterações locais de ícone, navegação e mascotes têm
[evidência própria](validation/2026-10-26-console-appearance.md); não estão
certificadas pelo primeiro deploy de 25/10. Sua publicação deve incluir frontend
e backend da mesma revisão e a migração aditiva `0045_persona_icon_revision.sql`,
executada explicitamente pelo fluxo abaixo antes da subida dos serviços.
Ela permite conservar a revisão de ícones removidos; não altera a migration 0044.
O build inclui retratos, atlas, ZIPs e licença. Não é necessário baixar assets de
terceiros no servidor em execução. Após publicar, conferir leitura do ícone,
remoção/recriação, recusa de revisão antiga e downloads da galeria no destino.
Esta nota não registra commit, push, aplicação da migration ou deploy dessas
alterações; essas etapas exigem evidência da revisão efetivamente publicada.

## Implementado

| Frente             | Entrega                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liberação de teste | `contracts/persona-v2-test-deploy.json` e `scripts/check-persona-test-deploy.mjs`: rodada CI exata, todos os jobs obrigatórios, artefato único e não expirado, SHA/ID/hash vinculados. Aceite integral permanece separado. |
| Runtime            | `PERSONA_V2_DEPLOYMENT=test-server` exige `NODE_ENV=production`, origens HTTPS, banco v2 dedicado e chave própria. Servidor, worker e CLI de migração usam a mesma guarda. Sem essa escolha, produção continua recusada.   |
| Comandos padrão    | `src/main.ts`, dev/start, db:migrate, worker e Docker/Compose usam v2. Legado é explícito e restrito às regressões; nenhum dado ou token é transferido.                                                                    |
| Distribuição       | CI constrói/testa o alvo padrão e preserva `persona-v2-test-server-amd64`. Deploy transfere o arquivo original por SSH, sem reconstrução/tag mutável ou publicar em registro.                                              |
| Sequência no host  | Hash antes de carregar; ID/revisão/runtime conferidos; configuração validada antes de parar; parada limpa; migração explícita; servidor e worker com healthchecks. Sem retry/rollback automático.                          |

A matriz dos treze gates continua em [acceptance.md](acceptance.md), com o
manifesto integral `ready: false`. A liberação de teste não encerra esses gates.
O campo HTTP `complete: false` também permanece correto.

## Preparar o servidor

1. Disponibilizar Node 24.21+ da linha 24, Git, Docker e Compose com suporte a
   `include`. O receptor usa `/root/plug_mcp` somente para buscar/exportar o commit
   autorizado de `origin/main`; não altera esse checkout nem aplica stash.
2. Criar um PostgreSQL vazio/dedicado, usuário e senha exclusivos. Nome
   `se7e_persona_v2` ou prefixo `persona_v2_`. Não converter/resetar banco antigo.
   Definir backup do banco e custódia do keyring separadamente, antes de guardar
   material que precise ser preservado.
3. Criar `/etc/se7e/persona-v2-test.env`, pertencente ao usuário executor, modo
   `0600`, arquivo regular sem symlink. Usar o [exemplo sem segredos](../../.env.persona-v2-test.example).
   O arquivo não é executado como shell. Não copiar o `.env` legado.
4. Instalar a versão revisada de `scripts/deploy-production.sh` em
   `/usr/local/sbin/plug-mcp-deploy`, protegida contra escrita pela aplicação,
   como comando forçado da chave SSH. O protocolo agora é `deploy-test`, rejeitando
   `deploy SHA`. Commit/push não atualiza essa cópia instalada automaticamente.
5. Configurar os secrets GitHub `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER` e
   `DEPLOY_HOST_KEY`. Preservar validação da chave do host. O destino precisa
   conseguir buscar o repositório; não enviar chave GitHub no fluxo da aplicação.
6. Escolher porta loopback livre e apontar o proxy HTTPS para ela, com
   `TRUST_PROXY` limitado ao proxy efetivo. Se houver processo MCP legado, pará-lo
   explicitamente antes de reutilizar sua porta. O deploy não para serviços do hub,
   agente, PostgreSQL, Redis ou outras aplicações.

## Configuração privada

Obrigatórios: `PERSONA_V2_TEST_DATABASE_URL`, `PERSONA_V2_TEST_ENCRYPTION_KEY`
(64 hex aleatórios), `PERSONA_V2_TEST_ENCRYPTION_KEY_ID`,
`PERSONA_V2_TEST_PUBLIC_URL`, `PERSONA_V2_TEST_HUB_URL` e
`PERSONA_V2_TEST_LOCAL_PORT`. O deploy fornece `PERSONA_V2_TEST_IMAGE` como ID
imutável verificado; não configurar uma tag no arquivo privado.

Opcionais: `PERSONA_V2_TEST_PREVIOUS_KEYS`, `PERSONA_V2_TEST_TRUST_PROXY`,
`PERSONA_V2_TEST_REDIS_URL`, `PERSONA_V2_TEST_CACHE_TTL_MS`,
`PERSONA_V2_TEST_OAUTH_ENABLED` e `PERSONA_V2_TEST_OAUTH_CLIENTS`.
OAuth/cache ficam desligados sem opção explícita. Habilitar exige configuração
própria; não amplia concessões existentes. Não publicar banco/Redis na internet.

## Envio e verificação no destino

Após commit/push explicitamente solicitados, o CI executa os jobs exigidos.
O workflow de deploy verifica origem do mesmo repositório, push/main, revisão,
rodada concluída com sucesso e cada job obrigatório; artefato ausente, duplicado,
expirado ou inconsistente recusa o envio. O arquivo original é transmitido pela
chave autorizada com revisão, ID da imagem e hash. O receptor confere o hash e
identidade do runtime antes de qualquer parada/migração.

Cada tentativa tem diretório privado em `/var/tmp/se7e-persona-test.*`, preservado
para diagnóstico, e lock exclusivo por host. A imagem carregada não herda
configuração legada. Servidor/worker precisam parar com código zero, sem OOM;
parada incompleta impede migração. Migração falha interrompe a sequência. Arranque
parcial não é rollback nem autorização para repetir operações.

O compose usa projeto `se7e-persona-v2-test`, porta do servidor em loopback,
filesystem somente leitura, usuário sem privilégios e migrations fora do startup.
`restart: no` é deliberado neste primeiro ambiente: após reboot/falha, conferir
estado e iniciar os serviços explicitamente pela configuração/revisão preservadas.
Não executar novo deploy só para repetir uma operação de negócio.

Após arranque: conferir `/health`, `/ready` e saúde local do worker, HTTPS/proxy,
login, cadastro de fonte de teste, treinamento, publicação, token e consulta.
Exercitar OAuth/ChatGPT quando configurados. Falhas podem ser corrigidas no próprio
servidor; aprovação Client dos efeitos permanece obrigatória quando aplicável.

Limpar diretórios antigos somente por decisão do operador após guardar evidências
e confirmar ausência de uso. Nunca apagar volumes/bancos ou restaurar snapshots
como tratamento automático de erro. Restauração não desfaz efeitos remotos.

## Limites e evolução

A [rodada local](validation/2026-10-25-test-deployment.md) registra testes e limites.
Ela não comprova infraestrutura remota. A [rodada no servidor](validation/2026-10-25-first-remote-test-deployment.md)
registra separadamente CI, receptor, configuração, migrations, HTTPS e verificações
automatizadas do primeiro deploy, sem declarar aceite funcional humano.

A avaliação consumidora real, ampliação da integração editorial de datasets
(operações têm sementes por consulta e importação direta; cruzamentos, por consulta publicada)
e homologações ampliadas continuam no [plano](remaining-plan.md).
Não são funções novas implementadas pelo deploy nem motivo para declarar testes
manuais aprovados. Rotas e componentes legados compartilhados com regressões
permanecem; o fluxo ativo não os seleciona.
