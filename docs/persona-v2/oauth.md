# OAuth persona-v2 e conexão privada ChatGPT

Implementado na composição de desenvolvimento, separado do OAuth legado.
Deploy/imagens permanecem bloqueados; esta entrega não comprova instalação
privada nem conversa no cliente real. [Aceite](acceptance.md#oauth-and-console).

## Configuração e endpoints

[Anexos JSON/binários](attachments.md) fixam a concessão e o prazo do consumidor original.
Refresh da mesma concessão não estende o handle; outra conexão ou Bearer manual
não o utiliza. Downloads pela rota OAuth resolvem novamente o access token e
revalidam token originador, consentimento e publicações antes de entregar bytes.

`PERSONA_V2_OAUTH_ENABLED=false` por padrão. Ao habilitar, exigir PostgreSQL v2
dedicado, `PUBLIC_BASE_URL` HTTPS canônica sem path/query e
`PERSONA_V2_OAUTH_CLIENTS` com JSON de client IDs CIMD e redirects exatos.
A allowlist legada `CHATGPT_OAUTH_CLIENTS` não habilita a v2.
Registrar somente URLs reais do ambiente autorizado; não incluir segredos.

| Interface                                           | Contrato                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `/mcp`                                              | Bearer manual de um token da persona; não aceita access OAuth            |
| `/mcp/chatgpt`                                      | Access OAuth obrigatório desde `initialize`; não aceita token manual     |
| `/.well-known/oauth-protected-resource/mcp/chatgpt` | Resource exato e authorization server configurado                        |
| `/.well-known/oauth-authorization-server`           | Endpoints v2, PKCE S256, CIMD e scope `se7e:persona`                     |
| `/oauth/persona-v2/authorize`                       | GET inicia transação de consentimento                                    |
| `/oauth/persona-v2/authenticate`                    | POST de navegador confere token manual sem persistir seu valor           |
| `/oauth/persona-v2/consent`                         | POST seleciona concessões ou cancela; retorna ao redirect validado       |
| `/oauth/persona-v2/token`                           | Troca código ou refresh; somente cliente público sem secret              |
| `/oauth/persona-v2/revoke`                          | Revoga a família do access/refresh apresentado; resposta idempotente     |
| `/api/admin/oauth`                                  | Disponibilidade e endereço no console; sessão Client e CSRF obrigatórios |

O issuer é `PUBLIC_BASE_URL`; resource/audience é exatamente seu
`/mcp/chatgpt`. Validar cliente e redirect via allowlist e documento CIMD HTTPS,
sem redirects de metadata, com classificação DNS, IP fixado, limite de resposta
e timeout. Cada runtime instancia seu próprio cache técnico de metadata.
Nenhuma chamada de rede ocorre dentro da transação PostgreSQL.

## Consentimento, prazos e autorização

O navegador recebe cookie `__Host-persona_oauth_v2`, Secure/HttpOnly/SameSite=Lax.
Host/Origin, nonce e CSRF são conferidos; CSP permite somente o próprio formulário
e o destino de retorno previamente validado. HTML é escapado e não reflete token.
Páginas e respostas usam `no-store`; o retorno não envia Referer.

O usuário informa o token somente no formulário protegido. Na revisão, seleciona
explicitamente fontes, skills e operações externas dentre as concessões existentes.
Cada seleção de skill conserva capacidades, comandos, aprovação e limites do token.
Sem seleção, a conexão entrega somente contexto da persona e guias comuns.
Selecionar uma skill sem suas fontes/dependências não habilita execução.

Administração por OAuth inclui setups de fontes com `gerenciar_fontes` e rotação
do token originador com `gerenciar_tokens`, seleção no consentimento e delegação
vigente do responsável no hub. Treinamento/publicação e manutenção delegada de
tokens seguem o alcance do [onboarding](onboarding.md#administração-delegada-por-consumidor).
Emissão limitada usa o setup descrito abaixo; credenciais de integrações usam o setup específico abaixo. Aprovação humana continua exclusiva
da sessão Client do responsável; consentimento não a substitui.
Conceder uma operação externa não implementa o adapter externo ainda pendente.

| Registro                 | Prazo máximo                                    |
| ------------------------ | ----------------------------------------------- |
| Transação de autorização | 15 minutos                                      |
| Código                   | 60 segundos, uso único                          |
| Access token             | 15 minutos                                      |
| Concessão e refresh      | 30 dias, limitados pela expiração do originador |

PKCE exige S256 e verifier de 43–128 caracteres permitidos. Código, cliente,
redirect, resource e scope são vinculados. Refresh rotaciona a cada uso; replay
confirmado de código/refresh revoga apenas sua família, inclusive sucessor.
Bindings incorretos não consomem registro nem revogam uma conexão válida.
O access anterior pode permanecer válido até seu prazo, enquanto a família estiver
vigente. Não há sobreposição de refresh válido após rotação.

Toda autorização aplica a interseção entre token, consentimento, publicação,
dependências e portões remotos vigentes. Identidade OAuth passa pelos mesmos
serviços de tools/resources/consulta/operação da v2. Deadline do access é conferido
também nas transações e na entrega; diagnóstico não reserva autorização.
Edição, ampliação, redução, rotação ou revogação do token invalidam conservadoramente
as concessões anteriores. Suspensão da persona as revoga. Edição da persona torna
o contexto capturado obsoleto e exige nova conexão; recuperação não ressuscita grants.

## Persistência e concorrência

Usar exclusivamente `oauth_concessao_v2` e `oauth_registro_v2`. Identificadores
opacos têm 256 bits; persistir hashes e payloads cifrados com keyring MCP.
O envelope cifrado é validado contra hash, tipo, persona, concessão e prazos
relacionais. Não persistir token manual, access/refresh em claro, senha ou JWT.

Migration aditiva `0009_oauth_integrity.sql` acrescenta índices e proteções contra
alteração/restauração de grants e reuso de registros consumidos. Não altera
migrations aplicadas, importa grants legados ou executa DDL no startup.
Locks seguem persona → token → concessão → registro. Emissões, rotações,
consentimento, revogação e auditoria fazem commit/rollback juntos; replay revoga
em commit antes de retornar `invalid_grant`. Prazo/autoridade são revalidados
antes do commit de emissão. Auditoria registra somente metadados.

Registros consumidos de refresh devem permanecer disponíveis até expirar a
concessão para detectar replay. Limpeza/rotação operacional automatizadas são
pendências do worker v2; não apagar registro e permitir reexecução pela expiração.

## Cliente e pacote

### Delegação administrativa e setups temporários

O responsável cria, renova ou revoga a delegação em **Tokens e conexões**, com
sessão Client, CSRF e versão/CAS. O hub vincula a credencial opaca a `client.id`,
origem HTTPS canônica do MCP, persona e época das credenciais Client. Expira em
30 dias; bloqueio do Client, mudança de credenciais ou revogação impedem verificação.
Não é JWT, não acessa agentes e não aprova operações. O hub guarda SHA-256; o MCP
guarda somente a credencial cifrada, nunca senha ou JWT. Renovação revoga a anterior
antes da emissão. Falha de gravação local tenta compensação no hub; se falhar,
informa revogação manual ou expiração, sem autoridade local.

O contrato aditivo 1.8.0 inclui `administrative` na emissão e na prova. A seleção
fica persistida nos dois lados e deve coincidir; o consumidor não escolhe scopes
ao verificar a credencial. A omissão na emissão mantém somente `gerenciar_fontes`
por compatibilidade conservadora. Delegações existentes não ganham capacidades
novas. O consentimento oferece somente permissões implementadas presentes no
token e na delegação; nenhuma é selecionada automaticamente. Cada chamada
administrativa exige também o consentimento vigente. [Administração por consumidor](onboarding.md#administração-delegada-por-consumidor).

| Interface                                                                | Autorização e finalidade                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Hub `POST /api/v1/client-auth/persona-delegations`                       | JWT Client vigente; emite credencial uma vez                            |
| Hub `POST /api/v1/client-auth/persona-delegations/verify`                | Bearer opaco próprio; prova Client ativo e vínculo, sem emitir JWT      |
| Hub `DELETE /api/v1/client-auth/persona-delegations/:id`                 | JWT do mesmo Client; revogação idempotente                              |
| MCP `GET /api/admin/personas/:personaId/delegation`                      | Estado local e versão; não confirma disponibilidade remota              |
| MCP `POST /api/admin/personas/:personaId/delegation/create` ou `/revoke` | Responsável, CSRF e `expectedVersion`                                   |
| MCP `iniciar_cadastro_fonte`                                             | Objeto vazio; `gerenciar_fontes` e delegação vigente                    |
| MCP `iniciar_rotacao_credenciais_fonte`                                  | `fonteId`, `expectedVersion`; mesma autorização e fonte da persona      |
| `GET /app/setup/:code`                                                   | Formulário; nunca consome código nem devolve CSRF                       |
| `POST /app/setup/:code`                                                  | Origin exato, CSRF, reautenticação do responsável e concessões vigentes |

As tools são omitidas sem permissão/delegação; chamadas diretas continuam recusadas.
Recebem somente identificadores, nunca credenciais. Link tem código de 256 bits e
CSRF separado no fragmento, ambos por hash. Contexto, consumidor/concessão, finalidade,
versão da delegação e fonte/versão na rotação ficam em envelope cifrado. Compartilhe
o link integral somente com o responsável. O script retira o fragmento do histórico;
segredos ficam em memória e são descartados após tentativa, saída ou prazo, sem
armazenamento local. GET não consome.
Formulário usa Referrer-Policy same-origin para preservar o Origin nativo do POST;
retorno/erro usam no-referrer. Nenhuma referência é enviada a destinos externos.

Setup dura até 15 minutos, limitado também pelo access OAuth originador. O formulário
autentica novamente o responsável; a fonte pode usar outra conta Client. Motor e
identidade são confirmados pelo hub/agente. Credencial, consumo único e auditoria
fazem commit/rollback juntos; conclusões simultâneas não criam duas fontes. Rotação
exige a mesma identidade física e suspende dependências conforme contrato existente.
Cadastro não amplia concessões do consumidor; conceder acesso é outra ação.

O hub é verificado fora da transação MCP, novamente depois da verificação da fonte
e antes da gravação. Dentro dela, locks/CAS e revalidação protegem permissões, prazos
e versão local da delegação. Indisponibilidade bloqueia. Não há transação distribuída
hub/MCP: revogação remota posterior à última prova não possui garantia atômica conjunta.
Reautenticação humana permanece; administração autônoma ampla e homologação integral
continuam pendentes.

Migration MCP `0010_delegation_and_setup.sql` e migration aditiva do hub
`20261012120000_client_persona_delegations` preservam dados. Setups consumidos não
voltam a disponíveis. Auditoria transacional só registra metadados, sem códigos,
hashes ou segredos. Rotação de cofre, limpeza e worker continuam pendentes.

`get_profile` retorna ID opaco estável da persona e nome, sem identidade do
responsável. `obter_contexto_persona` continua sendo a orientação das skills.
`revogar_conexao_chatgpt` exige solicitação humana expressa e
`confirmadoPeloUsuario: true`; revoga somente a conexão atual e entrega comprovante
terminal. Não repetir a mutação após esse comprovante. Outras conexões e o token
originador permanecem intactos. Recusa OAuth usa challenge de reconexão;
falhas de hub/SQL preservam seu tratamento e não são convertidas em retry.

O console mostra disponibilidade e permite copiar endereço OAuth sem segredo.
Montagem ChatGPT v2 exige ID real da conexão privada de homologação;
`.app.json` não cria uma conexão. O catálogo da variante inclui perfil/revogação;
o portátil continua manual. [Empacotamento](plugin.md).

## Evidências e limites

### Homologação HTTPS e conexão manual

O comando `chatgpt:check` permanece **legado**. Para a v2 usar
`persona:https-check`, que não carrega `.env`, não abre banco, não recebe Bearer
e não inicia autorização ou consulta. Ele faz apenas GETs públicos e validação
local do pacote. A origem é explícita e restrita ao hostname de homologação
aprovado; não aceita domínio de produção, localhost ou origem alternativa.

```powershell
npm run persona:https-check -- --stage=discovery --public-base-url=https://homolog-mcp.se7esistemassinop.com.br
```

Discovery exige resource/audience e issuer exatos, scope `se7e:persona`, endpoints
`/oauth/persona-v2/*`, PKCE S256 e challenge 401 de `/mcp/chatgpt`. Usa TLS nativo,
DNS público validado/IP fixado por conexão, timeout, limite de 64 KiB e nenhum
redirect. Não há opção para ignorar certificado. Erros retornam apenas códigos,
sem corpos externos, cookies ou parâmetros. Saída 0 comprova apenas os checks
executados; 1 indica falha e 2 argumentos inválidos.

A etapa `--stage=pilot` exige adicionalmente `--package`, `--connection-id`,
`--client-id` e `--redirect-uri`, todos explícitos. O pacote deve ser ChatGPT
persona-v2, com URL/ID/inventário correspondentes. O client ID deve ser a URL CIMD
real, e o redirect exato deve constar nela; neste verificador ambos precisam ser
HTTPS sem fragmento, query ou credenciais. A checagem CIMD não confirma que esses
valores estão cadastrados na allowlist do servidor. Só o consentimento real pode
demonstrar essa configuração. IDs existentes não comprovam o ambiente conectado.

O relatório conserva `chatGptConnection: not_verified`,
`infrastructureIsolation: not_verified` e `productionReleased: false`, mesmo
quando todos os checks passam. Não consulta ou altera o manifesto de release.

**Procedimento do operador, antes de conectar:**

1. Preparar subdomínio e certificado público no servidor existente. Preservar
   domínio, proxy e porta 3333 da produção. Usar serviço/porta loopback próprios,
   bancos MCP e hub dedicados, volumes/cofres separados e segredos novos. Não
   copiar `.env`, credenciais ou bancos operacionais. Registrar configurações
   redigidas e hashes do candidato, sem segredos.
2. Manter a entrada de desenvolvimento v2 e seu bloqueio de `NODE_ENV=production`.
   Aplicar migrations somente no banco v2 dedicado pelo procedimento explícito;
   startup verifica a geração e não converte o legado. O hub/agente de fixture
   precisam das versões/capabilities revisadas. Não apontar fontes ao ERP real.
3. Configurar proxy preservando Host/Origin canônicos, TLS e cookies Secure.
   Não registrar query strings, bodies, Authorization ou cookies; códigos OAuth
   podem aparecer no retorno. Não aplicar cache a `/oauth/`, `/api/`, `/app/setup/`
   ou `/mcp`. Conferir CSRF, limites, timeout e resposta de descoberta externamente.
4. Habilitar `PERSONA_V2_OAUTH_ENABLED` somente na homologação e configurar
   `PERSONA_V2_OAUTH_CLIENTS` com CIMD/redirect reais e exatos. Criar persona,
   bases de fixture, treinamento/publicação e token restrito pelo navegador.
   Executar discovery antes de cadastrar/conectar o cliente.
5. Criar ou selecionar conexão privada **comprovadamente de homologação** no
   cliente. Não redirecionar a conexão operacional existente. Confirmar URL
   `/mcp/chatgpt`, ID e allowlist; montar pacote separado com `plugin:package`
   e geração explícita conforme [contrato](plugin.md). Executar pilot com os
   valores reais, sem colocar tokens no comando ou no pacote.

**Aceite manual no cliente real:**

- Consentir pelo navegador com token restrito; conferir persona e permissões.
  Em conversa nova, descobrir contexto/fontes/publicações e consultar cada fonte
  de fixture com resposta verificável, origem e completude. Não ensaiar DML.
- Confirmar que fonte/skill não concedida é recusada, pergunta ambígua não vira
  consulta arbitrária, resultado vazio não vira falha e falha não vira dado.
- Verificar cancelamento de consentimento e reconexão após expiração/revogação;
  revogar somente a conexão de teste por solicitação humana. Demonstrar que uma
  segunda conexão e o token originador continuam válidos.
- Registrar candidato, horários, versões, ID da conexão, checks, cenários e
  resultados sanitizados. Não guardar Bearer, códigos, cookies ou refresh tokens.
  Replay, concorrência e avaliação da IA exigem evidências próprias; conversa
  manual não substitui a matriz automatizada nem encerra o gate.
- Encerrar e remover apenas recursos de homologação identificados, preservando
  evidência sem segredos. Não publicar imagem de produção nem liberar `ready`.

Em 2026-10-15 o operador escolheu deixar DNS/servidor e conexão ChatGPT para
validação manual. [Estado e checks locais](validation/2026-10-15-https-manual.md).

[Rodada de 2026-10-12](validation/2026-10-12-oauth-plugin-v2.md): resultados,
hashes, ambiente e limpeza das fixtures.

Testes PostgreSQL cobrem consentimento, isolamento, concorrência, replay,
prazos e revogação. Chromium usa formulários reais, TLS nativo, certificado
sintético fixado e PostgreSQL; DNS público é simulado na fixture CIMD.
Essas provas não são instalação ChatGPT, TLS/DNS público de homologação,
execução persistente nos três motores vigentes, avaliação da IA ou aceite integral.
Setups de fontes/delegação têm [evidência própria](validation/2026-10-12-setup-delegation.md).
Outros setups e gestão administrativa completa de conexões continuam pendentes.
[Plano restante](remaining-plan.md#etapa-10--oauth-v2-e-setup).

## Setup de rotação do próprio token

`iniciar_rotacao_token_persona({})` fica disponível somente com
`gerenciar_tokens`, consentimento OAuth quando aplicável e delegação vigente do
responsável com essa permissão. Não recebe tokenId, concessões, prazo ou segredos:
o alvo é exclusivamente o token originador da conexão, mesmo quando ela usa
OAuth. O servidor captura persona, identidade, versão do token e da delegação
no contexto cifrado; código/CSRF são hashes e o prazo é de até quinze minutos,
limitado também pelo access originador.

GET mostra o formulário sem consumir o setup. O responsável autentica novamente
e confirma explicitamente a invalidação do Bearer anterior e de **todas** as
conexões OAuth derivadas desse token. POST exige Origin exato, CSRF, autoridade
remota e autorização local vigentes. Não amplia concessões nem muda nome,
delegação, limites ou validade. Tokens de outros consumidores não são alterados.

Locks/CAS, consumo único, hash novo, incremento de versão, revogação OAuth e
auditoria são gravados na mesma transação. A identidade anterior deixa de valer
intencionalmente durante o commit; sua invalidação não é confundida com falha
que restauraria o segredo antigo. Prazos da sessão/setup continuam conferidos
antes do commit. Rede fica fora dos locks; não há atomicidade distribuída com o hub.

O Bearer novo só aparece na resposta POST do navegador, mascarado, com revelação
temporária e cópia explícita. A página usa `no-store`, não persiste no storage e
limpa o campo ao sair ou após sessenta segundos. Cópia é ação do usuário e não
promete limpar o clipboard do sistema. GET/replay não recuperam o segredo.
Resposta perdida exige nova rotação pelo console com sessão do responsável;
não reenviar automaticamente o setup. Tools, logs e auditoria não recebem o Bearer.

A persistência existente já admite finalidade textual e envelope cifrado;
`token_rotate` usa as mesmas constraints de identidade/consumo sem alterar
migrations aplicadas. Contextos antigos permanecem válidos nas finalidades
anteriores. Emissão limitada usa o setup próprio abaixo; credenciais de integrações usam o setup específico abaixo.
[Evidência local](validation/2026-10-15-token-rotation-setup.md).

## Setup de emissão com concessões limitadas

`iniciar_emissao_token_persona` recebe `name`, `expiresAt` ISO explícito,
`permissions` e `delegation`. Não recebe persona-alvo ou segredo. Exige
gerenciar_tokens no originador, consentimento OAuth e delegação ativa do
responsável no hub. As concessões devem caber simultaneamente nas permissões e
no teto de delegação do token, no consentimento e nas permissões administrativas
delegadas pelo responsável. A capacidade de delegar do novo token também deve
caber nas suas próprias permissões. Fontes, skills, campos/finalidades, comandos,
aprovação e limites não podem ser ampliados.

Validade é obrigatória, futura e não pode ultrapassar originador, delegação,
concessão OAuth ou access que iniciou o setup. Não existe emissão sem prazo
por esse caminho; o access pode impor validade curta. A proposta é cifrada e
fixada no contexto imutável. GET apresenta nome, data, fontes, skills, efeitos,
capacidades, limites e teto para delegar; não emite nem consome. POST aceita
somente CSRF, login do responsável e confirmação da proposta exata. Não aceita
concessões substituídas pelo formulário. Alteração exige novo setup.

Antes da gravação, autoridade remota é consultada fora da transação. Dentro
dela, locks/CAS revalidam originador, consentimento, delegação e prazo. Inserção,
consumo e auditoria são atômicos; conclusão concorrente emite somente um token.
A emissão preserva o originador e suas conexões. O novo token é uma identidade
manual separada, com validade limitada, gerenciável pelo console; não se deve
confundi-lo com refresh/access OAuth nem presumir vínculo de revogação em cascata
entre tokens manuais. Persona/publicações/fontes continuam sujeitas à autoridade vigente.

Bearer só na resposta POST do navegador, com a mesma proteção e descarte da
rotação. O MCP devolve apenas link/validade/finalidade. Resposta perdida exige
localizar o token no console e revogar/rotacionar; não repetir automaticamente
emissão nem recuperar segredo por GET. Proposta não constitui publicação ou
aprovação de lançamento. Persistência existente comporta `token_issue`, sem
mudar migrations aplicadas. [Evidência](validation/2026-10-15-token-issuance-setup.md).

## Consentimento de limites de execução

A concessão conserva limites globais e por skill do token originador. O formulário
de consentimento permite limites globais menores de consulta (`queryLimits`) e
lançamentos (`operationLimits`); campos em branco conservam a camada anterior.
Limites globais de cruzamento e os limites por skill são preservados, sem editor
próprio de consentimento nesta etapa. A autorização efetiva usa a interseção dos
tetos em cada execução; renovação não amplia concessões antigas. Restrições,
rotação e revogação mantêm a invalidação conservadora dos derivados.
[Limites e alcance](source-queries.md#limites-redutíveis).

## Setup de credenciais de integrações

`iniciar_cadastro_integracao({})` abre formulário de cadastro. O responsável
informa nome, tipo `rest`/`mcp_http`, destino HTTPS e credencial técnica própria
somente no navegador. `iniciar_rotacao_credenciais_integracao` recebe apenas
`integrationId` e `expectedVersion`; o link fixa nome, tipo, destino e versão.
Não é possível trocar o destino pelo formulário de rotação.

Ambas exigem `gerenciar_integracoes`, consentimento OAuth quando aplicável e
permissão na delegação vigente do responsável. Reautenticação Client, confirmação
humana, Origin/Host, CSRF, expiração de até quinze minutos e uso único são
obrigatórios. O access OAuth pode encurtar o prazo. A autorização remota é
revalidada fora dos locks; token, concessão, delegação e prazos são revalidados
na transação. Autoridade indisponível impede gravação. Não há atomicidade
remota distribuída.

Credenciais aceitas: Bearer, API key em header próprio ou Basic com usuário e
senha. Campos de outro modo, headers de transporte/autorização, quebras de linha,
NUL, destinos sem HTTPS, IP literal, nomes locais, user-info, query e fragmento
são recusados. Essa validação sintática **não comprova destino público**: nenhum
DNS ou serviço externo é chamado pelo setup. Os futuros adapters ainda deverão
validar DNS/IP na conexão, redirecionamentos e limites. Não se deve fornecer o
Bearer da persona, JWT do hub ou credencial de uma fonte como credencial externa.

O envelope cifrado vincula persona, integração, versão, configuração e segredo.
Cadastro cria integração inativa; rotação incrementa versão por CAS e deixa
integração e operações inativas, conservando os snapshots. Gravação, consumo e
auditoria de metadados são atômicos. Falha de auditoria não consome o link nem
substitui a credencial. Uma segunda rotação preparada na versão antiga é
recusada. Retorno mostra somente ID/versão, nunca segredo; erros também não
refletem os campos. Navegador descarta campos após tentativa/saída/expiração,
sem storage. Resposta perdida não autoriza reenviar o setup consumido.

A migration aditiva `0024_integration_credential_audit.sql` acrescenta referência
composta de persona/integração à auditoria e default inativo para novos cadastros,
sem modificar migrations aplicadas, credenciais ou estado de registros existentes.
Histórico identifica integração, responsável e versões, sem copiar formulários.

**Limite da entrega:** cadastro e rotação pelo setup não testam conexão,
descobrem ferramentas, publicam contratos, concedem permissões ou executam ações.
O [caminho separado de consultas externas](external-integrations.md) publica
contratos REST GET/MCP remoto e usa o cofre no executor com concessões explícitas.
Gestão completa no console, conciliação por provedor, rotação geral de chaves e
homologação externa continuam pendentes.
HTTPS público e conexão ChatGPT permanecem para validação manual.

## Gestão administrativa das conexões

Em Tokens e conexões, o responsável Client pode carregar os consentimentos da
persona e revogar somente um deles. Não exige nem recupera Bearer, access token,
refresh, código, senha ou JWT. Não testa a conexão real do ChatGPT ou os portões
remotos do hub/agente; `vigente_localmente` é somente um diagnóstico local.

GET `/api/admin/personas/:personaId/oauth-connections?after=<uuid>` retorna vinte
itens e cursor, ordenados por criação/id, com datas históricas ausentes em `null`.
Cada item tem `id`, `tokenId`, `tokenName`, `clientId`, `createdAt`, `expiresAt`,
`revokedAt`, estado local, consentimento imutável e `fingerprint`. A lista não
contém registros cifrados ou tokens. Cursor de outra persona não permite navegação.

POST `/api/admin/personas/:personaId/oauth-connections/:id/revogar` recebe
`{fingerprint, confirmed:true}`. Sessão Client, Host/Origin/CSRF e responsável
vigente são obrigatórios; não é uma permissão administrativa delegada ou tool MCP.
O hash vincula a conexão, cliente, token/versão, consentimento e prazos exatos.
Confirmação pendente é protegida ao sair/trocar contexto. Hash divergente recusa,
preservando a revisão; mudanças exigem recarregar e confirmar novamente.

Transação segue locks persona → token → concessão. Revogação e auditoria fazem
commit juntos; falha desfaz ambos. Repetição do mesmo conteúdo terminal devolve
o mesmo comprovante, sem evento duplicado. Access e refresh dessa concessão são
bloqueados; token originador e outras concessões permanecem. A revogação não
desfaz operações já enviadas nem promete interromper transporte em andamento.
As revalidações habituais continuam impedindo entrega/reuso após revogação.

Migration aditiva 0036 conserva datas históricas desconhecidas, grava relógio de
criação somente em concessões novas e impede alteração/restauração/remoção de
identidades. Auditoria acrescenta FK da concessão: histórico identifica o recurso
correto e filtra por ele, sem reconstruir autoria de eventos antigos. Nenhum
consentimento ou credencial é importado do legado. Instalação ChatGPT/HTTPS real
continua manual e o gate OAuth não é encerrado por esta jornada.

## Manutenção dos registros temporários

O [worker v2](review-worker.md#limpeza-de-dados-temporários) remove setups vencidos
e registros OAuth expirados sem concessão. Registros vinculados permanecem até
vencerem tanto o próprio prazo quanto o da concessão. Código consumido conserva
a identificação da família para detectar replay mesmo após seu prazo individual;
a limpeza não estende validade, remove concessões ou muda revogações.
