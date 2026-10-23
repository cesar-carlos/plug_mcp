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
HTTPS e ChatGPT permanecem para validação manual.

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
