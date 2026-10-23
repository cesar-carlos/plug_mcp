# Integrações externas com contratos publicados

## Escopo da gestão delegada em implementação

Permissões v2 aceitam `managedIntegrationIds` opcional: IDs explicitamente
concedidos para administração, distintos das operações executáveis.
Ausência equivale a lista vazia; `gerenciar_integracoes` sozinho não amplia
tokens antigos. Delegação exige subconjunto desse escopo.

A camada de serviço de listagem, impacto e suspensão/recuperação já exige a
interseção token/concessão e a autoridade administrativa vigente; mantém CAS e
fingerprint. Credenciais continuam nos métodos de navegador. Rotas consumidor
e tools estão conectadas. OAuth oferece seleção explícita dos IDs quando a
delegação permite gerenciar_integracoes; consentir exige a permissão e os IDs,
sem herança automática ou ampliação por IDs forjados.
A [regressão PostgreSQL](validation/2026-10-20-integration-management-oauth.md)
valida essa interseção. Seletores de emissão/edição estão ligados e validados
no Chromium. A [rodada Bearer com hub persistente](validation/2026-10-20-integration-management-persistent.md)
comprova escopo, CAS, reinício e revogação remota.
A [rodada OAuth persistente](validation/2026-10-20-integration-management-persistent-oauth.md)
confirma consentimento limitado e revogação da conexão e da delegação remota.
Não anunciar gestão delegada completa.

Rotas sob `/api/consumer/{bearer|oauth}/administration/integracoes`:
GET lista o escopo, GET `/:integrationId/impacto` retorna revisão, e POST
`/:integrationId/suspender` ou `/:integrationId/recuperar` recebe
`{expectedVersion,fingerprint,confirmed:true}`. Cookies não substituem Bearer;
Host/Origin e autorização de serviço permanecem obrigatórios.

Tools: `listar_integracoes_administraveis`, `revisar_gestao_integracao`
e `alterar_estado_integracao`. A última acrescenta `integrationId` e `suspended`
à confirmação. Não existe tool de credenciais. Recuperação preserva contratos
inativos e nunca toca journals ou operações desconhecidas.

## Disponibilidade e credenciais

Descoberta/importação também aceita administração delegada:
`POST /api/consumer/{bearer|oauth}/administration/integracoes/importar` e
tool `propor_contrato_externo({import})`. O contrato import tem kind openapi,
integrationId, version e document JSON, ou kind mcp, integrationId, version e
confirmed:"discover". Exige gerenciar_integracoes e managedIntegrationIds em
todas as camadas, revalidados antes da descoberta e antes de entregar propostas.
Não busca URLs do documento OpenAPI nem envia ações no MCP remoto.
Nenhum rascunho/publicação/concessão é criado automaticamente.

Serviços de criação, detalhe, edição, listagem, prévia e publicação de skills
externas agora aceitam consumidor administrativo, limitado pelos IDs de
integrações concedidos em todas as camadas. Edição verifica integração anterior
e nova, preserva operação e CAS. Prévia/publicação usam a autoridade exata;
prazo deve ter sido definido pelo responsável para o conteúdo atual.

Rotas administrativas de consumidor em
`/api/consumer/{bearer|oauth}/administration/external-skills`:
GET lista e POST cria; GET `/:skillId` lê; POST `/:skillId/rascunho` edita;
POST `/:skillId/preview` recebe objeto vazio, sem prazo; POST
`/:skillId/publicar` recebe confirmationHash. Host/Origin e ausência de cookies
continuam obrigatórios. Credenciais nunca entram nesses contratos.

A [regressão de serviços e criação HTTP](validation/2026-10-20-external-editor-delegation.md)
passou em PostgreSQL. Tools MCP editoriais e casos de rascunhos ainda não
publicados estão ligados; homologação ampliada HTTP/OAuth com hub persistente
permanece pendente.

Tools: criar_skill_externa, editar_skill_externa, listar_rascunhos_externos,
obter_rascunho_externo, revisar_publicacao_externa e publicar_skill_externa.
Usam as permissões administrativas correspondentes e o escopo da integração.
obter_testes_skill/editar_caso_skill também aceitam rascunho externo não publicado
sob treinar e esse escopo. Contrato publicado conserva exigência de concessão
executável exata. Nenhuma tool executa runner ou aprova relatório.

Implementação de desenvolvimento da persona-v2. Produção permanece bloqueada.
Credenciais são cadastradas pelos [setups de navegador](oauth.md#setup-de-credenciais-de-integrações).
O setup não faz chamadas externas nem ativa operações. A publicação posterior
é uma ação distinta e não concede acesso aos tokens existentes.

## Escopo entregue

Casos e relatórios também podem ser administrados por consumidor com `treinar`,
delegação do responsável e consentimento vigente, somente para publicação/skill/
operação explicitamente concedidas e contrato exato. A permissão de executar
sozinha não autoriza treinamento. O acesso não lista outras integrações nem
recebe credenciais. [Contrato de casos delegados](catalog.md#casos-e-relatórios-por-administração-delegada).
Cadastro/edição/remoção por CAS não executam ações, runner ou aprovação técnica.
Novos contratos e publicações continuam exigindo seus fluxos próprios.

- REST: GET com parâmetros na query; POST/PUT/PATCH/DELETE com corpo JSON plano,
  sempre em rota fixa. Resposta 204 exige saída publicada vazia.
- MCP remoto: Streamable HTTP, negociação, descoberta e chamada de uma ferramenta
  explicitamente selecionada. Nome e schemas devem coincidir com a publicação;
  para consultas a ferramenta também precisa anunciar `readOnlyHint: true`. Essa indicação não
  substitui a revisão humana do efeito declarado no contrato.
- Entradas e saídas são objetos planos com campos string, number ou boolean,
  finalidade explícita e classificação livre. Inteiros inseguros são recusados;
  decimais exatos devem ser transportados como string. Campos extras são recusados.
- Ação MCP exige schema remoto plano correspondente aos mesmos campos, tipos e
  obrigatoriedade. Enum, pattern, referências e outras constraints fora dessa
  gramática são recusadas; não são ignoradas para permitir uma ação. Consultas
  anteriores conservam a validação plana e o pin do schema remoto.
- Consultas e ações têm caminhos próprios. A ação exige preparação durável,
  aprovação aplicável e claim antes do envio com efeito.

## Publicação e concessões

A publicação é recusada enquanto a integração estiver suspensa. Recuperação e
rotação não reativam operações ou publicações anteriores; contratos publicados
continuam imutáveis e exigem nova skill/operação para nova publicação.

As rotas administrativas, protegidas por sessão Client, Host/Origin e CSRF, são:

- `POST /api/admin/personas/:personaId/integracoes/skills`: slug, name e contract.
  O servidor atribui operationId. Exige gerenciar_integracoes.
- `POST /api/admin/personas/:personaId/integracoes/skills/:skillId/preview`:
  reviewDueAt humano explícito e futuro. Exige publicar e relatório técnico atual.
- `POST /api/admin/personas/:personaId/integracoes/skills/:skillId/publicar`:
  confirmationHash da prévia de quinze minutos, consumo único e CAS.

O schema executável está em
[`external-contract.ts`](../../src/domain/persona-v2/external-contract.ts).
O pacote `persona-external-v2` fixa destino, versão da credencial, entrada, saída,
efeito, ferramenta/rota, timeout e tamanho máximo de resposta. Usa persistência
v2 existente: skill, publicação imutável, vínculo de integração, casos, preview
e calendário de revisão. Não cria uma fonte SQL fictícia.

A publicação exige pelo menos um caso obrigatório e relatório do runner de
operador `runFixtureCases`, sem endpoint HTTP/MCP para aprovar relatórios.
O runner usa conexão de fixture com destino diferente, revalida revisão/hash/casos
e não aprova significado de negócio. O CLI e o editor de casos/relatórios são
descritos abaixo; testes com transporte sintético não homologam o serviço real.

## Runner CLI e casos no console

O operador executa `npm run persona:test-external -- CAMINHO_DO_MANIFESTO.json`
na geração v2 de desenvolvimento. Produção é recusada; o comando verifica a
geração/checksums do controle MCP e não executa migrations. Usa a chave de cofre
configurada no servidor, sem receber senha, JWT ou sessão humana. O acesso local
de operador ao banco é autoridade técnica para registrar relatórios, assim como
os runners SQL; não fabrica sessão Client, aprovação humana ou concessão.

O manifesto é JSON fechado de até 64 KiB, arquivo regular sem symlink. Contém:

- `version: 1`, `runId` UUID novo, `personaId`, `skillId` e `ownerId` exatos.
- `revision`, `packageHash` e `casesHash` do conteúdo capturado.
- `fixtureIntegrationId`, `fixtureCredentialVersion` e `fixtureDestinationHash`
  (SHA-256 da string exata de destino da fixture cadastrada no cofre v2).
- `confirmation: isolated-external-effects` explícita do operador.

Não incluir credenciais ou payloads nesse manifesto. A fixture deve pertencer à
persona, ter o mesmo tipo de adapter e hostname diferente do destino pretendido.
Outro caminho/alias da mesma origem não comprova isolamento. Credenciais da fixture
são cadastradas pelo fluxo de navegador; nunca reutilizar a credencial operacional.
O operador é responsável por atestar que o destino possui somente dados sintéticos.

O serviço de fixture precisa implementar controles HTTPS autenticados com a
própria credencial, independentemente de seu endpoint de negócio REST/MCP:

| Controle                          | Contrato plano                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET `BASE/_se7e_fixture/status`   | Recebe `runId` e `packageHash`; retorna os mesmos valores, `isolated: true`, `ready: true`                        |
| POST `BASE/_se7e_fixture/cleanup` | Recebe `runId` e `packageHash`; remove somente material sintético dessa rodada e retorna `runId`, `cleaned: true` |

`BASE` é o destino registrado, incluindo seu prefixo de caminho. Os controles
devem recusar rodada/hash divergentes e nunca atuar em dados operacionais. A
declaração autenticada do provedor não substitui a revisão de isolamento pelo
operador. DNS/IP/TLS e limites são os mesmos dos adapters; CLI não possui opção
para resolver localhost, ignorar certificado ou aceitar uma porta privada.

Migration aditiva `0027_external_runner.sql` registra claim único por runId e
reserva a origem da fixture. Rodada em execução ou incerta impede outra na mesma
origem, inclusive em outra persona. Um ID consumido nunca pode ser reaproveitado.
Crash conserva o bloqueio e relatório preventivo não aprovado; não há retomada
automática de efeito. Investigação de rodada interrompida/incerta exige operador;
rotinas de conciliação desse journal continuam pendentes, sem reset automático.

Antes da rede, o runner captura conteúdo/casos/vínculos e grava reprovação
preventiva. Cada dispatch revalida conteúdo, persona, vínculo/credencial e controle
da fixture, fora dos locks. Falha ambígua após envio para os casos seguintes, sem
retry. Após execução, tenta uma única limpeza somente se a identificação da
fixture já foi confirmada. Confirmação perdida, limpeza incerta ou processo
interrompido nunca gera relatório aprovado.

O relatório final corresponde ao pacote original, com revalidação na mesma
transação de gravação. Alteração concorrente torna-o reprovado/obsoleto. Resultado
final contém apenas IDs, hashes, revisão, estado e aprovação por caso; não contém
resposta do provedor, parâmetros, segredos ou diagnóstico nativo. Casos e expectativa
ficam no treinamento explícito, fora da auditoria. CLI não publica nem amplia token.

No console **Integrações → Casos e relatórios**, o responsável pode listar skills,
criar/editar/remover casos tipados por CAS, escolher obrigatoriedade e consultar
relatórios paginados. O contrato administrativo usa GET
`/api/admin/personas/:personaId/integracoes/skills`, GET `/:skillId/testes?after=UUID`
e POST `/:skillId/casos` com `expectedRevision`, `id` opcional, `remove` opcional,
`required` e `content: {name,input,expected}`. Todos exigem sessão Client vigente,
Host/Origin/CSRF aplicáveis; não há endpoint HTTP/MCP de executar ou aprovar testes.

Até 256 casos por skill. Edição aumenta revisão sem alterar snapshot ativo;
o conteúdo anterior de casos editados/removidos fica em histórico editorial
imutável separado da auditoria, sem reescrever relatórios antigos.
relatórios anteriores ficam obsoletos. Histórico distingue conteúdo atual,
aprovação técnica, rodada incerta/em execução e ausência de vínculo antigo, sem
inventar autoria. Parâmetros são objetos fechados tipados; números vazios/inteiros
inseguros são recusados, e decimais exatos usam campos string. Edição fica apenas
em memória, protegida em navegação/troca de persona/logout, com conflitos preservados.

Antes da primeira publicação, o rascunho admite edição por CAS, preservando a
identidade da operação e invalidando relatórios/prévias aplicáveis. Depois de
publicado, mudança de contrato requer nova skill/operação e novas concessões;
republicação da mesma skill externa é recusada. A rotação da credencial desativa
operações anteriores e impede seu uso. Não há reativação automática.

O token precisa conceder a skill, o operationId externo e a capability exata
`external-contract:<hash>`. OAuth também precisa consentir esse subconjunto.
Uma exigência adicional de aprovação do token bloqueia a execução direta.
Para ações, somente o responsável autenticado pode satisfazer essa exigência.

## Preparação e aprovação de ações

Skill de efeito `acao` exige `effectDescription` e `reconciliation` explícitos.
`approval` omitida significa `human`; somente publicação confirmada pode escolher
`automatic`. Token e consentimento podem exigir aprovação adicional. O runner
usa `executeAction` em serviço de fixture isolado, sem testar o destino operacional
ou aceitar relatório enviado pelo consumidor.

| Interface MCP                                                           | Comportamento                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `preparar_acao_externa({skillId,input,limits?,expectedPublicationId?})` | Fixa conteúdo, publicação, destino, credencial, autoridade e orçamento; não envia a ação |
| `executar_acao_externa({operationId,fingerprint})`                      | Executa a preparação vigente uma única vez após aprovação aplicável                      |
| `obter_acao_externa({operationId,fingerprint})`                         | Retorna estado/comprovante e saída autorizada; não reenvia                               |
| `cancelar_acao_externa({operationId,fingerprint})`                      | Cancela somente preparação ainda não enviada                                             |

Preparação e aprovação duram até quinze minutos, reduzidos pela validade do token
e da concessão/access OAuth. Alteração de conteúdo, versão, permissão, credencial
ou publicação exige nova preparação. Aprovação não amplia a concessão original.

O responsável revisa parâmetros, efeitos e conciliação em **Integrações → Ações
externas** no console e confirma o conteúdo exato. Listagem/detalhes e aprovação
usam `/api/admin/personas/:personaId/external-actions`, `/:operationId` e
`/approve`, protegidos por sessão Client revalidada, Host/Origin e CSRF.
Não há tool de aprovação nem booleano da IA que a substitua.

Journal próprio `external_action_v2` e aprovação imutável são adicionados pela
migration `0025_external_actions.sql`, sem mudar migrations aplicadas. Payload e
saída são cifrados e vinculados a ID/fingerprint; auditoria conserva somente
metadados e autoria humana da aprovação. Nenhuma transação fica aberta durante
espera humana ou chamada externa.

O claim CAS é persistido depois da verificação DNS e imediatamente antes da
chamada REST com efeito ou `tools/call` MCP. Inicialização/descoberta MCP podem
preceder o claim, com revalidação em cada envio. Só o vencedor do claim envia a
ação. Timeout, erro, resposta inválida ou perda de confirmação após claim produzem
`resultado_desconhecido`, sem retry. Um claim interrompido é reconhecido ao ler o
journal após prazo de execução mais cinco segundos, inclusive após reinício;
nunca volta a executável. Cancelar depois do claim é recusado, sem promessa de
reversão no serviço externo.

`concluida` significa resposta recebida conforme o contrato. Receipt inclui
`provesBusinessOutcome: false`: HTTP/RPC não prova todos os efeitos comerciais.
Se a autorização for revogada após envio, o comprovante ainda é registrado,
mas a saída não é entregue. Conciliação explícita consulta somente a leitura
treinada descrita abaixo; nunca fabrica comprovante ou autoriza reexecução.

## Conciliação por evidência treinada

`conciliar_acao_externa({operationId,fingerprint})` exige o mesmo token/conexão OAuth
e autoridade vigente da preparação. Aceita somente `concluida` ou
`resultado_desconhecido`; uma execução ainda em andamento deve primeiro terminar
ou ser reconhecida como incerta pelo journal. Não recebe SQL, URL, chave nova ou
booleano de aprovação. Sessão administrativa não substitui o consumidor.

Novas publicações podem declarar `reconciliationCheck`:

- `guarantee`: garantia revisada do serviço para consulta por chave única e estado terminal.
- `transport`: GET em rota fixa ou ferramenta MCP de leitura com schemas exatos,
  no mesmo conector, destino e credencial da ação. MCP exige `readOnlyHint: true`.
- `input`, `output`: campos planos livres e tipados, como o contrato externo.
- `bindings`: cada parâmetro obrigatório de leitura aponta para um campo obrigatório
  da entrada original, com o mesmo tipo. Não há valores livres enviados na conciliação.
- `evidence.countField`, `completeField`, `correlation`, `statusField`, `appliedValue`:
  campos obrigatórios distintos para contagem numérica, completude booleana, todos
  os componentes da chave e o estado terminal esperado. Cada chave vinculada deve
  aparecer na correlação, inclusive tenant quando for parte da chave de negócio.

O runner obrigatório testa a leitura treinada após a ação na fixture. A capability
fixa o hash do contrato completo; publicações e concessões antigas não recebem
essa leitura automaticamente. Sem `reconciliationCheck`, investigação continua manual.
Não inferir uma garantia de negócio a partir de HTTP 200 ou de uma annotation MCP.

`applied_verified` significa que a evidência retornada pelo serviço corresponde
ao contrato treinado: contagem exatamente um, completude true, chave original
exata e estado esperado. Não prova efeitos além dessa garantia revisada. Ausência,
duplicidade, truncamento, chave divergente, outro estado, schema incompatível,
timeout ou falha retornam `inconclusive`. Ausência não comprova inexistência de efeito.

Migration aditiva `0026_external_reconciliation.sql` mantém evidências append-only,
com publicação/hash/fingerprint, horário, classificação, motivo seguro e hash da
resposta. Não persiste linhas, chaves, parâmetros ou texto de erro do provedor.
Auditoria conserva somente metadados. Leitura remota ocorre fora dos locks;
revogação impede registro/entrega de evidência nova. `obter_acao_externa` e a revisão
no console mostram a evidência mais recente autorizada.

O estado e receipt técnico original permanecem imutáveis, inclusive após prova
positiva; `permitsRetry: false` vale para todos os resultados. Não há retry automático,
reenvio, cancelamento remoto ou reativação por conciliação. Consultas respeitam o
menor orçamento vigente e o orçamento preparado. Payload removido impede nova leitura
de conciliação; operações desconhecidas preservam o payload até tratamento adequado.

## Interfaces de consumo

`listar_operacoes_externas({})` retorna somente contratos publicados concedidos.
`consultar_integracao({skillId, input})` valida entrada, revalida autorização
antes de cada dispatch remoto e novamente antes de entregar a saída.
Essas tools constituem uma superfície separada: a listagem SQL por fonte não
é usada para apresentar publicações externas.

`limits` opcional permite reduzir maxBytes e timeoutMs. Os menores tetos de
publicação, token, concessão da skill, consentimento OAuth e pedido prevalecem;
o resultado informa os limites efetivos. Bytes limitam também o resultado
materializado da tool antes da entrega, sem o envelope do protocolo MCP.

A resposta contém dados, publicationId, contractHash, integrationId e horário.
`dataCompleteness: not_asserted` não promete totalidade ou paginação do serviço.
`untrusted: true` identifica conteúdo externo sem autoridade para instruir a IA,
alterar treinamento ou disparar outra ação. Texto de erro remoto não é devolvido.
Auditoria registra somente metadados; não guarda parâmetros, resultados ou segredos.

## Transporte e limites

Somente HTTPS público na porta 443, sem credenciais na URL. Todas as respostas
DNS precisam ser públicas; uma resposta mista é recusada. O IP aprovado é fixado
na conexão TLS com validação do certificado e hostname original. Cada dispatch
refaz a verificação; não há proxy, redirect, retry ou reaproveitamento de socket.
Somente a credencial técnica daquela integração é enviada.

Timeout publicado até 30 segundos inclui DNS e protocolo. Resposta até 1 MiB,
com contagem dos bytes recebidos; compressão é recusada. MCP aceita JSON ou SSE
finito dentro desse orçamento, sem executar requisições reversas. A primeira página
de descoberta comporta até 256 ferramentas; ferramenta ausente nessa página é
recusada. Sessão remota fica somente na memória da chamada. Não há stream infinito,
retomada de eventos ou troca automática de ferramenta após mudança de schema.

## Pendências de aceite

Preparação visual no console usa somente contrato concedido, token da persona e
confirmação explícita. `expectedPublicationId` é opcional para consumidores já
existentes, mas obrigatório no formulário; quando informado, divergência é
recusada na transação antes de registrar a preparação. Não concede autoridade,
aprova ou executa. Consulta externa não recebe esse parâmetro.

Ações do consumidor em preparações existentes podem ser acompanhadas/executadas,
canceladas antes do envio e conciliadas pelo [console](console.md#ações-do-consumidor-em-preparações-existentes),
usando Bearer e as tools vigentes. Aprovação Client continua separada; UI não
supre permissões, procedimento de conciliação ou a homologação do provedor.

Importação OpenAPI e descoberta administrativa como rascunho estão entregues.
Continuam pendentes respostas estruturadas mais amplas,
paginação remota, homologação pública por provedor, cancelamento remoto e manutenção
operacional ampliada do journal externo. A
[retenção pelo worker](review-worker.md#retenção-de-operações) está implementada
em desenvolvimento: payload/result por 24 horas e comprovantes por 90 dias do
desfecho local conhecido, com lease e identidade permanente. Respostas autorizadas
mostram `retention` e `dataAvailability`; revisão sem payload retorna contrato,
input e limites nulos, sem recuperar conteúdo pela rede ou inventar dados.
Estados desconhecidos preservam payload e impedimento de repetição.
Essas limitações não contam como entrega do plano completo de integrações.
HTTPS público e conexão privada ChatGPT serão validados manualmente.

## Editor de skills externas

Em **Treinamentos → Treinar ações e consultas externas**, a persona pode criar
uma skill sem fontes SQL. O responsável seleciona integração cadastrada pelo
setup de navegador; a seleção mostra somente nome, tipo, destino e versão.
Não pede ou recupera credenciais. Escolher outra conexão não converte o contrato.

O editor oferece campos tipados de entrada/saída com finalidade, obrigatoriedade
e classificação livre, efeitos, aprovação, timeout e limite de resposta. REST
fixa método e rota. MCP fixa ferramenta e schemas; a proposta plana a partir dos
campos exige ação e confirmação explícitas e não comprova o contrato do remoto.
Constraints incompatíveis permanecem recusadas. JSON continua opção avançada,
sem edição concorrente dos controles estruturados ou identidade livre da operação.

A conciliação opcional tem garantia revisada, leitura do mesmo conector, campos,
vínculos à entrada original e evidência de contagem/completude/chave/estado.
Valor esperado tem tipo explícito e aplicação separada; número vazio/inseguro
é recusado, decimal exato usa texto. O editor não executa essa leitura ou ação.
Conciliação não muda receipt nem permite repetição.

Salvar rascunho usa `gerenciar_integracoes`, sessão Client e CAS. Não ativa
integração ou operação. Depois da primeira publicação, o formulário é somente
leitura. **Preparar nova skill com este contrato** copia apenas o contrato local;
exige novo identificador e recebe outro operationId pelo servidor. Para ações,
restabelece aprovação humana inicial, mesmo se a origem era automática. Não copia
casos, relatórios, publicação, concessões ou aprovações. Histórico e snapshot
anterior permanecem intactos, inclusive se estiverem indisponíveis/suspensos.

Casos e relatórios reutilizam o painel existente, agora também vinculado à skill
selecionada. Edição aumenta revisão e invalida prévia/relatório; recarregar pede
descarte quando há alteração local. Mudança concorrente do contrato durante a
leitura dos testes não atualiza o CAS da edição antiga: exige recarregamento
explícito, preservando os campos locais. Não há endpoint para executar ou aprovar
relatórios. Runners continuam sendo ações de operador em fixtures separadas.

A revisão mostra comparação produzida pelo servidor com pacote, destino, versão
da credencial, campos, transporte, efeitos, aprovação, conciliação e casos exatos.
Exige relatório obrigatório atual, data futura escolhida pelo responsável,
prévia/hash de quinze minutos e confirmação humana. Publicar não envia chamadas,
concede acesso ou aprova cada ação. Skill/operação/capability precisam de concessão
explícita e autoridade vigente na execução.

### Contratos administrativos do editor

- `GET /api/admin/personas/:personaId/integracoes/conexoes`: metadados das
  integrações da própria persona, sem ler/devolver a cifra ou o segredo.
- `GET .../integracoes/skills/:skillId/rascunho`: contrato/identidade/revisão,
  indicação de primeira publicação e snapshot utilizável quando disponível.
- `POST .../integracoes/skills/:skillId/rascunho`: `expectedRevision`, `name` e
  `contract`; somente antes da primeira publicação, com operationId preservado.
- `POST .../preview` preserva os campos anteriores e acrescenta revisão, prazo,
  comparação estruturada, avisos e capacidades. Publicação permanece no endpoint
  existente, sem confiar em comparação ou aprovação de relatório do navegador.

As rotas usam sessão Client, CSRF, Host/Origin e revalidação. Referências de outra
persona, tipo incompatível, alteração de identidade e conflito são recusados.
Auditoria conserva metadados na transação correspondente. Não foi necessária
migration; tabelas de integração, rascunhos, casos, relatórios e preview já existem.

[Evidência parcial do editor](validation/2026-10-17-console-external-editor.md).
HTTPS e ChatGPT permanecem para validação manual; não encerra gates ou libera deploy.

## Gestão de integrações no console

Em Integrações, o responsável lista nome, tipo, destino, versão da credencial,
revisão de gestão e estado local: ativa, aguardando publicação ou suspensa.
Listagem/impacto não leem ou devolvem a credencial. Ativa localmente não comprova
disponibilidade ou autoridade do serviço remoto.

**Cadastrar integração** permite ao responsável criar REST ou MCP remoto sem
token de consumidor ou setup. Informa nome, tipo, destino HTTPS público e
credencial técnica Bearer, API key em header ou Basic, reautentica o mesmo Client
e confirma explicitamente. A senha/JWT do hub são transitórios; somente a
credencial técnica é persistida, cifrada. Não consulta o provedor, descobre
ferramentas ou cria operações, skills, casos, publicações e concessões.
O cadastro permanece inativo até publicação independente do contrato treinado.

O navegador fixa UUID de tentativa, utilizado como identidade da integração.
Inserção e auditoria são atômicas; conflito desse UUID recusa replay inclusive
com conteúdo diferente. Após erro, os segredos são descartados e novo envio fica
bloqueado até conferir a lista. Se a confirmação foi perdida após commit, a
listagem localiza o UUID original e destaca o cadastro, sem recuperar credenciais.
Se não foi localizado, uma tentativa explícita conserva o mesmo UUID; não há
retry automático. Fechar/recarregar a página descarta o contexto em memória:
confira os cadastros existentes antes de iniciar outro.

Antes de suspender, recuperar ou rotacionar, o console mostra publicações exatas,
nomes/revisões dos snapshots e contagens de operações habilitadas e pendentes/
desconhecidas. A confirmação fixa fingerprint do impacto e versão de gestão,
recalculados na transação autorizada. Não reserva autoridade ou promete rollback
de chamadas enviadas. Não cancela, concilia ou repete ações.

- Suspender desativa integração/operações, suspende publicações dependentes e
  consome prévias de publicação pendentes. Descoberta e publicação ficam bloqueadas.
- Recuperar remove somente a suspensão, conservando integração e operações
  desativadas. Não restaura snapshots/concessões; exige nova revisão/publicação
  de nova skill/operação, com concessões explícitas quando necessárias.
- Rotacionar exige reautenticar o mesmo Client responsável no hub. JWT/senha
  são transitórios, somente no servidor/navegador; não há senha/JWT persistentes.
  Bearer, API key em header e Basic técnicos são cifrados pelo cofre existente.
  Nome, tipo e destino são fixos. A rotação incrementa versões, suspende
  publicações/operações anteriores e preserva eventual suspensão da integração.
  Não chama o provedor ou verifica a nova credencial; novos casos/revisão seguem
  o runner separado. Consumer setups existentes conservam consentimento e delegação.

Rotação direta usa sessão Client e revalidação do responsável, sem fabricar
token ou delegação de consumidor. Rede com o hub fica fora dos locks MCP;
não há atomicidade distribuída. Endpoint de credenciais limita dez tentativas
por IP/minuto/instância, além dos portões administrativos. Segredos são limpos
após tentativa, descarte, expiração ou troca de contexto. Erro/confirmação perdida
exige recarregar impacto antes de nova tentativa; sem retry automático.

Rotas administrativas sob `/api/admin/personas/:personaId/integracoes/gestao`:

- `GET /`: conexões da persona, somente metadados.
- `POST /`: `requestId` UUID, `confirmed: "create"`, `registration` com
  `name/kind/destination`, `owner: {email,password}` e `credential` tipada.
  Retorna 201 com `id`, `version: 1`, `active: false` e
  `credentialsReturned: false`; nunca devolve segredo. Limita dez tentativas por
  IP/minuto/instância independentemente do limite da rotação.
- `GET /:id`: impacto e fingerprint atuais.
- `POST /:id/suspender` e `POST /:id/recuperar`: `expectedVersion` de gestão,
  `fingerprint` e `confirmed: true` específicos do impacto revisado.
- `POST /:id/credenciais`: mesmos campos, `owner: {email,password}` e
  `credential` no schema técnico vigente. Resposta contém versão, nunca segredo.

Usam sessão Client, Host/Origin, CSRF e autoridade vigente; não estão expostas
como tools ou administração Bearer/OAuth. Alterações/auditoria são transacionais,
com metadados; journals, payloads, comprovantes e resultados desconhecidos não
são alterados. A migration aditiva `0040_integration_lifecycle.sql` acrescenta
revisão de gestão e suspensão distinta da espera por publicação; preserva dados
e migrations aplicadas. Recuperação não remove registros de suspensão de snapshots.
Cadastro direto reutiliza o armazenamento existente, sem nova migration.

## Descoberta MCP e importação OpenAPI

Em Treinamentos, selecione uma integração existente e solicite explicitamente
descoberta MCP ou análise de arquivo JSON OpenAPI. O endpoint administrativo
`POST /api/admin/personas/:personaId/integracoes/importar` exige sessão Client,
CSRF/Host/Origin e responsável vigente; recebe `integrationId`, `version` e
`kind`. MCP exige `confirmed: "discover"`; OpenAPI recebe `document` JSON.
Não há equivalente em tool de consumidor nesta entrega.

Descoberta usa somente initialize, notifications/initialized e tools/list por
Streamable HTTP. Limites: quinze segundos, quatro páginas, 256 ferramentas,
512 KiB por resposta e menos de 1 MiB acumulado. Catálogo incompleto, cursor
repetido e nomes duplicados são recusados. A chamada normal também confere as
páginas, sem aceitar nomes ambíguos. Schema e nome exatos são preservados; schemas
não representáveis ou sem outputSchema ficam indisponíveis para importação.
Hints remotos não aprovam leitura ou efeitos: toda proposta MCP começa como
ação exigindo revisão, descrição dos efeitos, conciliação e aprovação humana.

Rede ocorre fora das transações. Usa apenas a credencial técnica da integração;
DNS/IP público é fixado na conexão TLS, sem redirects, retry, OAuth individual
ou execução de ferramentas. Antes de cada envio e antes da entrega, revalidar
responsável, fonte da credencial, tipo, destino, estado e versão. Rotação ou
indisponibilidade da autoridade recusa a proposta.

OpenAPI 3.0/3.1 aceita JSON UTF-8 de até 512 KiB, 128 rotas e 256 operações.
O documento não é buscado por URL: servers não substituem o destino configurado;
credenciais, exemplos e definições de segurança não são incorporados. Referências
suportadas são locais, diretas, em components/schemas; referências remotas,
cíclicas/encadeadas e composição não são resolvidas.

Gramática inicial: rotas fixas, GET com parâmetros query escalares ou
POST/PUT/PATCH/DELETE com corpo JSON obrigatório; resposta única 2xx de objeto
JSON plano ou 204 sem conteúdo. Campos são string, number e boolean; required
é preservado. Objetos aninhados, arrays, integer/formats, enum, limites nativos,
parâmetros de caminho/header/cookie, serialização especial e múltiplas respostas
de sucesso não são convertidos. Restrições não suportadas tornam a operação
indisponível, sem remover regras silenciosamente. Segurança por operação,
callbacks e servers particulares também exigem contrato manual revisado.

A resposta contém propostas e motivos seguros. Importar/aplicar modifica apenas
o formulário em memória, com descarte protegido; salvar é ação explícita pelo
endpoint de criação já existente. `expectedConnection` opcional fixa id, versão
e destino observados, conferidos novamente na criação. Não persiste o documento
original, não cria conexão, publicação, casos, relatórios, grants ou journals.
Não modifica skills existentes. Arquivos inválidos não substituem silenciosamente
a edição. Valores importados são declarações: classificação e significado devem
ser revisados, com casos atuais e publicação independente antes de execução.
