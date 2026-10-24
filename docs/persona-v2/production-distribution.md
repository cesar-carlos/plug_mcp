# Preparação da distribuição de produção v2

`docker-compose.persona-v2.production.yml` é uma composição separada para preparar
o corte no servidor existente. Não substitui o compose legado nem libera deploy.
O entrypoint, servidor e worker v2 continuam recusando produção. A configuração
só poderá ser utilizada após concluir os gates e preparar o runtime aprovado.

## Valores obrigatórios

Fornecer em ambiente privado do operador, nunca no repositório ou argumentos:

| Variável                                  | Conteúdo                                                      |
| ----------------------------------------- | ------------------------------------------------------------- |
| `PERSONA_V2_PRODUCTION_IMAGE`             | Imagem GHCR aprovada por `@sha256`, sem tag mutável           |
| `PERSONA_V2_PRODUCTION_DATABASE_URL`      | PostgreSQL de controle dedicado, com usuário e senha externos |
| `PERSONA_V2_PRODUCTION_ENCRYPTION_KEY`    | Chave aleatória externa de 64 caracteres hexadecimais         |
| `PERSONA_V2_PRODUCTION_ENCRYPTION_KEY_ID` | Identificador da chave ativa                                  |
| `PERSONA_V2_PRODUCTION_PUBLIC_URL`        | Origem HTTPS pública canônica do MCP                          |
| `PERSONA_V2_PRODUCTION_HUB_URL`           | Origem HTTPS canônica do hub                                  |
| `PERSONA_V2_PRODUCTION_LOCAL_PORT`        | Porta loopback explícita para o proxy                         |

O banco deve se chamar `se7e_persona_v2` ou usar prefixo `persona_v2_`; nome não
comprova isolamento. Provisionar banco vazio/dedicado, grants, backup e restauração
separadamente. Esta composição não cria bancos, usuários ou volumes nem publica
portas de PostgreSQL/Redis. Não copiar credenciais/URLs dos bancos do hub ou ERP.

Valores opcionais próprios: `PERSONA_V2_PRODUCTION_PREVIOUS_KEYS`,
`PERSONA_V2_PRODUCTION_TRUST_PROXY`, `PERSONA_V2_PRODUCTION_REDIS_URL`,
`PERSONA_V2_PRODUCTION_CACHE_TTL_MS`, `PERSONA_V2_PRODUCTION_OAUTH_ENABLED` e
`PERSONA_V2_PRODUCTION_OAUTH_CLIENTS`. O mapa de chaves anteriores segue o
[contrato do cofre](vault-rotation.md). Cache/OAuth ficam desligados sem opção
explícita; habilitação exige configuração e homologação próprias. Nenhuma variável
legada é usada como fallback. Configurar somente o proxy confiável efetivo.

O endereço PostgreSQL exige host, usuário e senha na autoridade da URL. Parâmetros
`host`, `port`, `user`, `password` e `database` na query são recusados, inclusive
nomes codificados, para impedir destinos ou identidades ambíguos no driver.
Opções de TLS e identificação da aplicação continuam permitidas; o preflight
não abre conexão nem comprova isolamento do banco.

## Verificações sem implantação

Com as variáveis carregadas no processo privado:

```sh
npm run persona:production-config:check
docker compose -f docker-compose.persona-v2.production.yml config --quiet
```

O primeiro comando verifica os campos obrigatórios, formato do digest, origens,
nome do banco, chave e porta sem rede ou leitura de dados. Recusa a chave de
exemplo conhecida e repetição trivial; isso não mede entropia nem substitui geração
criptográfica. Campos opcionais continuam sujeitos aos validadores do runtime.
O segundo confere interpolação e estrutura, sem imprimir segredos. Não executar
`config` sem `--quiet` em logs compartilhados.

Esses checks não comprovam existência/autenticidade da imagem, entrypoint correto,
acesso ao banco, identidade do hub, TLS, grants ou aceite. Os bloqueios de release
continuam independentes. Nunca usar `NODE_ENV=development` para contorná-los.

## Execução futura e limites

### Procedimento de operador separado

`npm run persona:production -- <fase> <diretório-do-artefato>` implementa as fases
`check`, `migrate` e `start` em Linux. Exige checkout revisado com dependências de
desenvolvimento já instaladas, Node 24, Git, GitHub CLI autenticado para ler Actions,
Docker/Compose, `GITHUB_REPOSITORY` explícito e as variáveis privadas acima no
processo. O diretório contém `image.tar` e `image-proof.json` do artefato aceito.
A imagem por digest deve estar previamente disponível no Docker local; este
procedimento não baixa/carrega, constrói ou troca tags de imagens.

```sh
npm run persona:production -- check /caminho/privado/artefato-aceito
```

Cada fase verifica o manifesto/evidências, prova da imagem, configuração,
versão do Node, origem imutável do artefato no GitHub, hash do arquivo e imagem
local. Confere que o digest configurado resolve ao mesmo ID Docker aceito.
Compose usa projeto/arquivo explícitos e `/dev/null` como env-file, sem herdar
o `.env` legado. `check` não altera serviços, banco ou imagem.

Somente depois de preparar backup/recuperação e interromper o consumo, o operador
para servidor e worker explicitamente. `migrate` e `start` recusam qualquer
contêiner desses serviços que não esteja `exited`, inclusive pausado/reiniciando.
As fases têm comandos independentes:

```sh
npm run persona:production -- migrate /caminho/privado/artefato-aceito
npm run persona:production -- start /caminho/privado/artefato-aceito
```

Migração executa apenas o serviço `migrate` com dependências/pull desabilitados.
Inicialização sobe apenas servidor e worker, sem build/pull/migração, esperando
os healthchecks por até 120 segundos. Aceite é reconferido imediatamente antes
da alteração. Um lock exclusivo em `/tmp/se7e-persona-v2-production.lock`
serializa estas fases entre checkouts no mesmo host; lock remanescente após queda
exige investigação pelo operador, nunca remoção automática ou takeover.
Não coordena outros hosts ou comandos Docker executados fora deste procedimento.

Falha interrompe a sequência sem retry, rollback, restauração ou impressão de
saídas que possam conter segredos. Timeout do comando não comprova cancelamento
de migração/contêiner: conferir estado antes de nova decisão. Inicialização
malsucedida pode deixar serviços parcialmente iniciados; não repetir nem voltar
imagem presumindo reversão de efeitos. O procedimento não muda proxy, SSH,
supervisor ou o deploy legado. Não é seguro reutilizar o rollback automático de
`scripts/deploy-production.sh` para a v2.

**O manifesto atual bloqueia todas as fases antes do Docker.** Mesmo com evidência
completa, o runtime candidato atual ainda recusa produção; este comando não remove
essa guarda. Os testes de sequência simulam comandos e não certificam instalação,
Docker, banco ou sinais reais no servidor de destino.

Servidor e worker usam a mesma imagem por digest, usuário da imagem, filesystem
somente leitura, capabilities removidas e `/tmp` temporário. Apenas o servidor
expõe porta em loopback. Migração é um serviço no perfil `maintenance`, sem
execução automática no startup. Não existe build local nesta composição.

Restart automático permanece desligado nesta preparação. O worker tem
[probe local](review-worker.md#saúde-local-e-parada), sem publicar porta ou executar
jobs; supervisor, backup/restauração e ensaio instalado ainda exigem aceite.
A distribuição padrão e o comando de deploy no servidor não foram trocados.
O corte precisará fixar a imagem aceita, preservar banco/armazenamento do hub e
agente e usar banco MCP novo, conforme o [plano restante](remaining-plan.md).
DV2-015 dispensa validação manual real de HTTPS/ChatGPT, sem declarar aprovação
ou dispensar configuração e verificações técnicas de segurança.

## Recuperação: requisitos para o procedimento instalado

O [ensaio da candidata](candidate-distribution.md#empacotamento-sem-hub) verifica
dump/restore em banco novo de fixture. O procedimento instalado ainda precisa
definir destino protegido, retenção, criptografia do arquivo, armazenamento
separado do keyring, permissões, RPO/RTO e restauração em infraestrutura independente.
Dump contém dados privados mesmo quando alguns campos estão cifrados; não deve
entrar no repositório, artefato CI ou logs.

Interromper novos dispatches e parar servidor/worker antes do corte. Restaurar
primeiro em banco vazio separado, conferir geração/checksums e disponibilidade
das chaves necessárias; nunca sobrescrever o banco atual para experimentar.
Backup de banco não inclui automaticamente segredos externos, journals dos agentes
ou estado dos provedores. A restauração pode recuperar um estado anterior a uma
revogação ou efeito remoto: reconciliar esses estados antes de reabrir consumo e
não interpretar ausência no backup como autorização para reenviar. O ensaio local
preserva revogações e unknown presentes no snapshot; não prova recuperação de
eventos posteriores ao snapshot nem rollback de lançamentos nas bases de negócio.
