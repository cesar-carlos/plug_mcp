# Distribuição candidata local persona-v2

Configuração exclusiva de desenvolvimento e homologação isolada. Não substitui
o legado, publica imagem ou libera produção. HTTPS e ChatGPT permanecem manuais.

## Imagem e serviços

`tested-image.mjs verify-loaded` confere o arquivo original e a identidade carregada.
Docker clássico identifica pela configuração; o armazenamento containerd pode
identificar pelo manifest OCI. Essa diferença só é aceita quando os bytes do
manifest no tar verificado têm o digest anunciado pelo daemon e referenciam o
digest de configuração exato da prova do CI. Tag ou revisão iguais, sozinhas,
não comprovam equivalência. Plataforma e runtime também permanecem obrigatórios.

Construir explicitamente o alvo candidato:

```sh
docker build --target persona-v2-candidate -t se7e-persona-v2-candidate:local .
```

O último alvo/default do Dockerfile continua `runtime`, com entrypoint legado.
O candidato reutiliza dependências, assets e migrations empacotados, mas aceita
somente `server`, `worker` ou `migrate`, executando os módulos v2 correspondentes.
Não aceita comandos arbitrários. `NODE_ENV=production`, banco ausente ou chave
ausente são recusados. Servidor/worker apenas verificam migrations; startup não
aplica DDL.

`docker-compose.persona-v2.yml` define projeto separado, PostgreSQL 16 sem extensão
vetorial, Redis, servidor, worker e migração no perfil `maintenance`. O banco não
tem porta publicada; console usa somente loopback, porta 3334 por padrão.
Servidor/worker têm filesystem somente leitura, usuário sem privilégios,
capabilities removidas e `/tmp` temporário. Worker não publica porta HTTP; supervisionar
atividade/parada pelos metadados e pelo healthcheck próprio em loopback
`127.0.0.1:3335/health`, sem porta publicada. O healthcheck do servidor não
substitui o do worker. `/ready` não
comprova disponibilidade do hub/agente.

## Configuração explícita

Usar arquivo privado fora do repositório, com permissões restritas. Não copiar
ambiente, credenciais ou volumes operacionais. Variáveis obrigatórias:

- `PERSONA_V2_POSTGRES_PASSWORD`: senha dedicada hexadecimal aleatória. Esta
  composição não escapa caracteres especiais da senha na URL.
- `PERSONA_V2_ENCRYPTION_KEY`: chave dedicada aleatória de 64 caracteres hexadecimais.
- `PERSONA_V2_HUB_URL`: URL explícita do hub isolado de homologação.

Opcionais: `PERSONA_V2_LOCAL_PORT`, `PERSONA_V2_PUBLIC_BASE_URL`,
`PERSONA_V2_CANDIDATE_TAG`, `PERSONA_V2_CANDIDATE_REVISION`,
`PERSONA_V2_ENCRYPTION_KEY_ID`, `PERSONA_V2_QUERY_CACHE_TTL_MS`,
`PERSONA_V2_OAUTH_ENABLED` e `PERSONA_V2_OAUTH_CLIENTS`. OAuth exige HTTPS e allowlist
própria; nunca herda configuração legada. Cache fica desligado por padrão.

Não trocar a chave de volume existente: isso não é rotação. A composição inicial
não substitui o [procedimento do cofre](vault-rotation.md). Não imprimir a
configuração interpolada completa, pois contém segredos; validar com `config --quiet`.

## Inicialização controlada

Usar o mesmo projeto e arquivo privado em todas as chamadas. Substituir o caminho:

```sh
docker compose --env-file /caminho/privado/candidate.env -f docker-compose.persona-v2.yml config --quiet
docker compose --env-file /caminho/privado/candidate.env -f docker-compose.persona-v2.yml up -d --wait database redis
docker compose --env-file /caminho/privado/candidate.env -f docker-compose.persona-v2.yml run --rm migrate migrate
docker compose --env-file /caminho/privado/candidate.env -f docker-compose.persona-v2.yml up -d --no-build --wait server worker
```

Migração exige banco vazio dedicado ou geração v2 compatível. Não converte legado,
reseta ou acessa bancos do hub/agente/ERP. Para parar preservando volume, usar
`stop server worker`. Reiniciar não recria treinamento nem concede permissões.
Login e treinamento exigem autoridade real do hub de fixture; subir contêiner
não comprova esse percurso.

### Parada do servidor

SIGINT e SIGTERM compartilham uma única parada do servidor v2. O HTTP deixa de
aceitar conexões novas e aguarda as requisições atuais antes de fechar os recursos
do runtime. O prazo total permanece em dez segundos, incluindo o fechamento do
runtime; falha ou prazo excedido encerra o processo com código 1. Sinais distintos
não repetem o fechamento. Sucesso remove o temporizador e encerra com código 0.
Isso não promete cancelamento de SQL/POST remoto, rollback ou reenvio seguro.
O worker conserva seu procedimento próprio de parada cooperativa.

## Ensaio automatizado local

### Fluxo real de treinamento na imagem

O wrapper da [cadeia persistente](homologation-chain.md) aceita `-CandidateImage`
para iniciar o MCP HTTP pela imagem, sem overrides de gateway. Resolve a tag para
ID imutável local e recusa imagem ausente, entrypoint diferente ou autoridade em
memória. O controlador registra o ID em metadados da rodada e limpa o contêiner
por nome/label da sessão; arquivo temporário de ambiente é removido após create.

No Docker Desktop, os endpoints já conferidos da fixture são alcançados por
`host.docker.internal`. Para o hub, um relay TCP privado no loopback do contêiner
preserva a mesma URL de origem usada pelo agente e pelos helpers; essa origem
participa da identidade administrativa e física das operações. O relay não altera
conteúdo HTTP/RPC e termina com o contêiner. Hub e agente continuam processos reais
no host, sem proxy público ou mudança de contratos. Esse modo exige verificar a
conectividade local do Docker Desktop, sem presumir suporte equivalente no Linux.

Com fixture já criada e imagem construída, o percurso dirigido é:

Cada invocação requer fixture nova; o wrapper recusa diretório com sessão `chain-*`
anterior. Reinício dentro de uma mesma rodada continua sendo testável, sem reutilizar
bootstrap ou tabelas de outra rodada.

```powershell
& scripts/run-persona-chain-homologation.ps1 -Manifest $manifest `
  -Persistence prisma -Flutter 'C:/flutter/bin/flutter.bat' `
  -DriverDirectories @("$fixtureRoot/pgdriver") `
  -CandidateImage 'se7e-persona-v2-candidate:local' `
  -TestNamePattern 'Chromium cria persona'
```

O navegador cria persona, três fontes, treinamento/publicação e token, confirma
conexão e consulta os valores sintéticos pela cadeia. Também verifica vazio,
recusa de escrita pela consulta e armazenamento do navegador vazio. O filtro é
uma rodada dirigida; os demais casos não executados não contam como homologação.
O parâmetro substitui o processo MCP principal; helpers especializados que criam
composições em memória não passam automaticamente a certificar a imagem.
O removedor da fixture recusa apagar a pasta enquanto houver contêiner controlador
rotulado ainda presente; parar/remover somente a sessão comprovadamente própria
antes de repetir a limpeza. [Rodada dirigida](validation/2026-10-19-candidate-training-chain.md).

### Empacotamento sem hub

Após construir a imagem, executar no Windows:

```powershell
.\scripts\homologation\test-persona-candidate.ps1
```

O ensaio cria projeto aleatório, porta local, banco/Redis próprios e arquivo
temporário de segredos. Recusa produção/chave ausente/comando desconhecido,
confere ausência de DDL no startup, aplica/reaplica migrations e verifica readiness,
assets, ciclo do worker e reinício. Também semeia registros sintéticos de armazenamento,
para os serviços, faz `pg_dump -Fc` e restaura com `pg_restore --single-transaction`
em banco novo, conservando o original. Compara digest das linhas, descriptografa
credencial/payload e confere revogação, imutabilidade de publicação e proteção do
journal desconhecido. Depois inicia servidor/worker sobre a cópia restaurada.
Não é runner de publicação: os registros sintéticos não representam treinamento
aprovado ou operação executada. O hub usa endereço inválido proposital: nenhum
login remoto, consulta de negócio ou treinamento é alegado.

Limpeza restringe-se ao projeto aleatório, containers/volume com suas labels e
pasta temporária conferida. A imagem local é conservada para inspeção. Em falha
de limpeza, não reutilizar a fixture nem apagar volumes por nome aproximado.

Ainda faltam imagem de produção aprovada, vínculo ao digest, cadeia instalada,
backups/restauração instalados, proxy/TLS, supervisão e corte coordenado. Ver
[plano restante](remaining-plan.md) e [aceite](acceptance.md).

O ensaio `test-persona-candidate.ps1 -Image <referência-local>` resolve o ID Docker
antes de criar a fixture e exige entrypoint v2. A composição usa esse ID durante
toda a rodada; não reconstrói nem baixa a aplicação. Imagem ausente é erro, sem
fallback. Banco/Redis são exclusivamente da fixture; limpeza confere propriedade.
CI executa esse ensaio antes de exportar o artefato persona-v2-tested-image-amd64,
sem publicação no registro ou liberação de produção.
