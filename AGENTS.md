# Orientação para agentes

DV2-015 (2026-10-24): o responsável dispensou validação manual real de
HTTPS/ChatGPT e aceite funcional humano. Não declarar essas atividades aprovadas.
Preservar testes técnicos e demais gates, incluindo aprovação Client de operações.
Ver docs/persona-v2/decisions.md e docs/persona-v2/release-evidence.md.

## Contrato ativo

O projeto está em refatoração para **persona-v2**: um responsável administra
personas com várias fontes, skills publicadas e tokens com concessões explícitas.
Essas decisões substituem os invariantes de produto legados incompatíveis.

A entrada principal (`src/main.ts`) ainda é legada. A entrada
`src/main-persona-v2.ts` é exclusiva de desenvolvimento. Não transferir
automaticamente contratos, credenciais, dados, caches ou migrations entre elas.
Não anunciar conclusão nem remover o bloqueio de deploy:
`contracts/persona-v2-release.json` exige evidência de todos os gates.

O alvo Docker `persona-v2-candidate` e sua composição são exclusivos de
homologação isolada; não substituem o alvo padrão legado. Servidor/worker não
aplicam migrations no startup; migração v2 é explícita e produção continua
recusada. Ver [distribuição candidata](docs/persona-v2/candidate-distribution.md).

## Ordem de leitura e precedência

1. Este arquivo e [persona_v2](.cursor/rules/persona_v2.mdc): decisões aprovadas.
2. [Objetivo](.cursor/rules/product_objective.mdc) e
   [segurança](.cursor/rules/security.mdc): autoridade, isolamento e dados.
3. [Índice documental](docs/README.md) e [estado v2](docs/persona-v2/README.md):
   contratos por subsistema, implementação e pendências.
4. Regras especializadas abaixo, conforme a alteração. O
   [console v2](docs/persona-v2/console.md) separa jornadas entregues e pendências,
   incluindo identidade oficial, edição protegida e aprovação humana.

Referências **legadas** valem somente para manutenção da entrada principal.
Relatórios históricos registram a rodada executada; não são regra atual nem
autorização de produção. Divergência entre código e contrato deve ser apontada,
sem presumir que funcionalidade aprovada já foi entregue.

Decisões e regras substituídas: [registro v2](docs/persona-v2/decisions.md).
Pendências por gate e evidência exigida: [matriz de aceite](docs/persona-v2/acceptance.md).

Pacotes privados: [contrato do plugin](docs/persona-v2/plugin.md). Montagem exige
geração explícita e validação offline; não misturar tools do legado/v2 nem
usar grants ou sessões legadas na v2. [OAuth v2](docs/persona-v2/oauth.md) usa
scope próprio, consentimento limitado e revogação da conexão atual. Pacote validado não comprova
instalação no cliente e não libera deploy.

| Área                  | Rules                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arquitetura e domínio | [architecture](.cursor/rules/architecture.mdc), [domain_layer](.cursor/rules/domain_layer.mdc), [project_structure](.cursor/rules/project_structure.mdc)                                                                                         |
| Catálogo e interfaces | [catalog](.cursor/rules/catalog.mdc), [mcp_protocol](.cursor/rules/mcp_protocol.mdc), [express_api](.cursor/rules/express_api.mdc), [plug_server_client](.cursor/rules/plug_server_client.mdc)                                                   |
| Código e ferramentas  | [coding_standards](.cursor/rules/coding_standards.mdc), [typescript](.cursor/rules/typescript.mdc), [project_stack](.cursor/rules/project_stack.mdc), [lint_format](.cursor/rules/lint_format.mdc), [performance](.cursor/rules/performance.mdc) |
| Entrega               | [testing](.cursor/rules/testing.mdc), [governance](.cursor/rules/governance.mdc), [changelog_and_docs](.cursor/rules/changelog_and_docs.mdc), [git_workflow](.cursor/rules/git_workflow.mdc)                                                     |

## Invariantes essenciais

Autoridade, identidade, publicação, consulta e operação estão em
[persona_v2](.cursor/rules/persona_v2.mdc) e no
[objetivo](.cursor/rules/product_objective.mdc). O procedimento de cada tema
fica no documento do subsistema.

- Não transferir contrato, credencial, cache ou migration entre a entrada legada
  e a v2, nem anunciar aceite sem a evidência de todos os gates.
- Inspeção estrutural usa somente metadados fixos pelo hub/agente. A adoção
  inicial por consultas fixa versão, evidência e colunas no snapshot; confere
  estrutura e constraints utilizadas na conexão executora. Constraints desconhecidas
  não habilitam chaves/FKs. Perfis exigem curador com acesso vigente à mesma base;
  versões não são adotadas automaticamente. Contrato: docs/persona-v2/shared-knowledge.md.
  Editores do console aplicam conhecimento somente ao rascunho; diagnóstico não
  reserva autorização, publica a skill ou amplia concessões.
  Curadoria aceita propostas explícitas por console/MCP; revisão por curador
  usa preview/hash/CAS e altera somente rascunhos. Exemplos enviados permanecem
  candidatos até revisão editorial. Tools não concedem navegação pelo catálogo.
  Propostas físicas têm persistência própria e origem imutável; revisão exige
  curador com acesso vigente à mesma base, preview/hash/CAS e consumo único.
  Incorporar altera só o rascunho do perfil, sem publicar/adotar/conceder acesso.
  Busca/grafo usam o snapshot concedido; índice é reconstruível e não autoriza
  execução. Revisão temporal aprovada exige prazo definido pelo curador, sem
  prazo padrão ou suspensão automática por idade (DV2-010).
  Feedback é explícito, vinculado ao item/publicação concedidos e armazenado fora
  da auditoria. Calendários e decisões ficam separados dos snapshots; curador
  escolhe prazo e justifica por CAS. Novas publicações exigem prazo humano
  vinculado à revisão/hash e ao preview; calendário nasce na mesma transação.
  Worker v2 de desenvolvimento gera tarefa/notificação interna única por versão,
  com lease e retomada. Ler o aviso não conclui revisão; não autoriza, suspende
  ou republica. Manutenção temporária tem lease próprio e lotes: remove
  setups/prévias expirados e vínculos órfãos. OAuth vinculado conserva registros
  até o prazo do registro e da concessão para preservar detecção de replay.
  Não remove journals ou identidades de operações. Retenção própria remove
  payload/result após 24h e comprovante após 90 dias do desfecho local conhecido,
  com lease/CAS e tombstone permanente. Unknown/em execução nunca entram;
  conciliação comercial não habilita limpeza. Rotação de chave do cofre tem
  CLI de operador separado, simulação, lock de sessão e cursor transacional.
  Rewrap muda somente cifras, preserva metadata/autoridade e exige papel de banco
  com permissão específica; GUC não concede exceção. Nova cifra exige chave ativa;
  startup verifica keyring e rodada vigente. Contrato: docs/persona-v2/vault-rotation.md.
  Outbox v2 tem assinatura HMAC, destinos HTTPS públicos, claim com fencing/lease,
  orçamento e retomada. Configuração explícita pelo responsável no navegador;
  só metadados privados da persona, sem exportar catálogo ou repetir operações.
  Origem e configuração são revalidadas antes do envio. Entrega pode duplicar;
  receptor deduplica por ID. Homologação operacional ampliada continua pendente.
  Contrato: docs/persona-v2/outbox.md.
  Contrato: docs/persona-v2/review-worker.md.
  Leases de manutenção usam relógio PostgreSQL e duração limitada; relógio da
  aplicação não pode roubar lease ou antecipar tarefas. Parada registrada antes
  do primeiro ciclo aguarda o job atual, sem iniciar outro job ou claim do lote.
  Queda do cliente não promete cancelamento imediato de SQL ou POST em andamento.
  Biblioteca editorial v2 de templates/datasets é cifrada e versionada por
  catálogo; exige sessão Client e papel colaborador/curador/administrador.
  Importação explícita cria só rascunho de consulta, com fonte/dialeto escolhidos
  e exemplos candidatos, sem herdar autoridade, casos ou relatórios. DDL usa
  gramática fechada, nunca executa, conserva inferido/unknown e exige inspeção
  antes da adoção. Contrato: docs/persona-v2/knowledge-library.md.
  Importação exata de template por consumidor exige treinar, fonte concedida,
  teto/consentimento vigentes e papel editorial no catálogo. Não abre navegação
  pela biblioteca nem devolve linhas de dataset; exemplos ficam candidatos.
  Composição de inspeções recebe IDs de páginas imutáveis da mesma fonte,
  identidade, versões e escopo completo; preserva menor validade e linhagem.
  Lacunas/conflitos são inconclusivos, sem adoção ou execução automática.
  RPC continua limitado a quatro recursos por página; composição interna até
  dezesseis não comprova snapshot simultâneo. sourceSchema v1 vigente é obrigatório.
  Operações SQL adotam versões/provas explícitas com grão/classificação livre e
  identidade PK/UNIQUE comprovada; pacote/preparação fixam dependências usadas.
  Revogação bloqueia aprovação/dispatch/entrega; recusa estrutural conserva receipt
  e suspende a publicação utilizada. SQL Anywhere unknown não habilita adoção.
  SQL Anywhere 16 prova constraints locais declaradas por catálogos públicos e
  índices físicos; FK exige configuração vigente verificável. Outras versões,
  proxies e evidências insuficientes não habilitam. Ver o contrato compartilhado.
  Runner sem guarda na conexão real da fixture não aprova pacote compartilhado.
  Relacionamentos DML fixam pares/elos, FKs na filha e unicidade 1:1; tabelas
  relacionadas exigem leitura estrutural, sem conceder escrita ou JOIN em DML.
  Contrato: docs/persona-v2/shared-knowledge.md#adoção-por-operações-sql.
  Consulta preserva IDs/intermediárias/elos N:N; só elos diretos licenciam JOIN.
  Relação reversa fixa a FK na filha; 1:1 exige unicidade comprovada e direção
  inequívoca. Snapshot compartilhado sem caminho explícito exige republicação,
  sem reescrita ou adoção automática. Enforcement desconhecido não é habilitado.
- Segredos entram somente pelo navegador. Auditoria guarda metadados permitidos,
  não SQL, pergunta, parâmetro ou resultado.
- Limites v2 usam o menor teto da plataforma, skill publicada, token, concessão
  OAuth e requisição. Delegação só reduz. Bytes limitam a resposta materializada
  no MCP; timeout não promete cancelar SQL já enviado. DML fixa linhas/prazo no
  fingerprint; 32 comandos continuam teto fixo. Contrato: docs/persona-v2/source-queries.md#limites-redutíveis.
- Setups v2 de fonte exigem gerenciar_fontes, delegação vigente do hub e
  reautenticação humana no navegador. OAuth exige consentimento explícito.
  Código/CSRF por hash, contexto cifrado, até 15 minutos e consumo transacional.
  Rotação do próprio token exige gerenciar_tokens/consentimento/delegação, login
  e confirmação humana. Preserva prazo/concessões, consome setup e invalida o
  Bearer anterior/derivados no mesmo commit; novo segredo só no POST do navegador.
  Não reautorizar pela identidade antiga após a rotação deliberada. Sem recuperação
  do segredo: resposta perdida exige console. Emissão limitada fixa proposta
  cifrada de nome/prazo/concessões/delegação e exige revisão/confirmação no
  navegador. Revalida teto do originador, consentimento, delegação e prazos;
  consumo, token e auditoria são atômicos. Novo Bearer nunca volta pela tool.
  Setups de integrações exigem gerenciar_integracoes/consentimento/delegação,
  login e confirmação humana. Credencial técnica cifrada, consumo e auditoria
  são atômicos. Rotação fixa destino/tipo/versão; cadastro e rotação mantêm
  integração/operações inativas. Não fazem chamadas externas ou publicações.
  Publicação separada habilita consulta externa REST GET/MCP remoto,
  com contrato exato, casos, prazo humano e concessão explícita por operação/skill.
  DNS público fixado no TLS; sem redirects, retry ou encaminhamento de credenciais
  de outra origem. Revalidar antes do envio e entrega. Ação usa preparação cifrada,
  aprovação aplicável no navegador Client e claim CAS durável antes do efeito.
  Desconhecido nunca volta a executável; aprovação não amplia concessões nem
  existe por tool. Cadastro não ativa ações. Conciliação explícita usa leitura
  fixada em reconciliationCheck e chave original; evidência append-only separada
  nunca altera receipt/estado ou autoriza retry. Ausência/falha é inconclusiva.
  Contratos antigos não ganham essa capacidade automaticamente.
  Runner CLI externo é de operador, com manifesto exato e integração de fixture
  separada; claim único, identificação autenticada e limpeza confirmada precedem
  aprovação técnica. Rodada incerta não repete efeitos. Console edita casos por
  CAS e lê relatórios; nunca dispara ou aprova testes por HTTP/MCP.
  Contrato: docs/persona-v2/external-integrations.md.
  não prometer atomicidade distribuída
  nem delegar aprovação humana. Contrato: docs/persona-v2/oauth.md.
- Ciclo explícito de fontes e limites da recuperação/substituição:
  [onboarding](docs/persona-v2/onboarding.md#suspensão-recuperação-e-substituição-de-fontes).
- Testes usam fixtures isoladas. Parser, mock ou uma suíte PostgreSQL não
  certificam os três motores.
  Runners genéricos são de operador: manifesto/vínculo explícitos, sem SQL em
  fonte operacional. Casos e pacote capturados, reprovação preventiva, rede fora
  dos locks, limpeza/revalidação antes do relatório. Evidência guarda metadados;
  resultados sintéticos não comprovam SELECT. UUID de caso é alias de marcador
  treinado, sempre materializado em identidade nova, sem reuso de receipt.
  Contrato: docs/persona-v2/homologation-chain.md#publicação-sql-genérica-em-fixtures-privadas.
  Matriz privada admite FK composta e cópia de inserção por trigger tipado,
  sem SQL livre de setup. Falha nativa esperada exige rollback confirmado e
  sementes intactas; contagem direta não inclui efeitos indiretos.
  Extensões da matriz privada usam CHECK de intervalo inteiro, cascata explícita
  e cópia NEW/OLD por UPDATE/DELETE, sempre por declaração tipada, sem scripts.

Administração por consumidor exige token/consentimento e teto explícito da
delegação ativa do responsável no hub. Renovar não amplia concessões antigas.
Prévia de publicação vincula a autoridade exata; publicar nunca substitui a
sessão humana de aprovação de lançamentos. Alcance no onboarding v2.

## Mudanças e validação

Cadastro direto de integrações no console exige sessão Client, CSRF e
reautenticação do mesmo responsável. UUID estável da tentativa impede replay;
segredos são cifrados e descartados após envio. Conferir confirmação perdida
pela listagem, sem retry automático ou recuperação de credencial. Integração
nasce inativa; não cria operações, publicações, grants ou chamadas externas.
Setups de consumidores preservam delegação e consentimento.

Gestão de integrações no console exige sessão Client, impacto/fingerprint e CAS.
Suspender bloqueia descoberta/publicação e invalida prévias; recuperar não reativa
contratos. Rotação exige reautenticar o mesmo Client, preserva destino/tipo e
suspensão, desativa operações e limpa segredos após tentativa. Journals/unknown
não são alterados; não há execução ou retry. Contrato: external-integrations.md.

Descoberta externa usa somente initialize/tools/list pela conexão HTTPS protegida,
com revalidação e limites. OpenAPI JSON é interpretado sem buscar URLs. Propostas
não publicam, executam ou concedem acesso; schemas incompatíveis são recusados,
e salvar exige ação explícita e versão da integração ainda vigente. Contrato:
docs/persona-v2/external-integrations.md#descoberta-mcp-e-importação-openapi.

Editor de skills externas cria/edita somente rascunhos não publicados por CAS.
Contrato publicado exige nova skill/operação; copiar não herda casos, relatórios
ou concessões. Conexões são listadas sem credenciais; schemas MCP propostos não
comprovam o serviço remoto. Casos/relatórios reutilizam o runner separado; console
não envia ações, aprova testes ou substitui aprovação Client de cada efeito.
Contrato: [integrações](docs/persona-v2/external-integrations.md#editor-de-skills-externas).

Editor de cruzamentos fixa consultas publicadas e etapas tipadas; casos por CAS
preservam formatos sintéticos e de transporte. Console só edita/lê relatórios,
sem executar runner ou aprovar evidências. Revisão/publicação exige conteúdo
atual e prazo humano; não altera snapshot ativo por edição nem concede acesso.
Contrato: [cruzamentos](docs/persona-v2/federation.md#editor-e-casos-administrativos).

Editor de operação SQL no console edita contrato/casos por revisão, lê relatórios
e publica pela prévia vigente. Não executa/aprova testes nem lançamentos; aprovação
humana de efeito continua separada. Snapshot ativo é preservado ao editar; casos
alterados exigem nova rodada isolada. Relacionamentos/vínculos existentes não são
apagados pela edição. Contrato: docs/persona-v2/console.md#editor-de-skills-de-operação-sql.

Relacionamentos de operações têm editor visual com pares/elos ordenados e N:N
explícito. Adoção visual de padrão/perfil reutiliza prova e compatibilidade, só
enriquece recursos declarados e preserva tipos, identidade, concorrência, parâmetros,
etapas, limites e escrita. Aplicar/remover vínculo altera só o rascunho; trocar
fonte descarta o vínculo local com confirmação, sem reassociação de perfil.

Cache/singleflight v2 são opt-in e isolados do legado. Chaves HMAC, conteúdo
cifrado e revalidação própria de cada consumidor em hit/espera. Revisão física
compartilhada invalida resultados entre personas sem compartilhá-los; operações
pendentes/desconhecidas impedem reuso. Guardas estruturais permanecem na conexão
executora, sem cache dessa consulta nesta etapa. Redis indisponível reduz a
otimização; timeout/lease vencido não disparam nova consulta. Ver [cache v2](docs/persona-v2/query-cache.md).

Cache Redis confere novamente a entrada após claim e respeita idade autenticada
desde a criação, sob o TTL da instância leitora e vencimento original. Namespace
v3 não reaproveita envelopes antigos. Homologação de dois processos usa Redis e
bancos próprios; barreiras de publicação não alteram SQL/autoridade. Queda após
SELECT não autoriza takeover ou reenvio pelo seguidor.

Consultas v2 publicam finalidades por campo; pessoal/sensível exige `uses` e
`usePurpose`, com capacidade explícita e contrato exato no token/consentimento.
Concessão incompleta bloqueia a publicação inteira, inclusive contexto/busca/grafo.
Livre sem `uses` preserva consultas anteriores. Segredo/inferido nunca executam;
DML segue livre. Anexos JSON locais exigem contrato publicado, capability nova e
exportacao explícita em toda a linhagem projetada; tokens antigos não são ampliados.
Anexos cifrados ficam no PostgreSQL de controle v2, com hash do handle e vínculo ao
consumidor/concessão e à origem. Outra instância/reinício preserva somente conteúdo
e prazo original, nunca autoridade. Quotas são globais/transacionais; sem fallback
em memória, extensão de validade ou reconsulta. Worker remove expirados em lotes;
rotação cobre a cifra sem alterar vínculo/prazo. Handles brutos não são persistidos;
downloads revalidam fonte/policy/publicações, revisão física e estrutura compartilhada.
Pendência/unknown bloqueia entrega; não cachear nem repetir SQL. Binários exigem
binaryAttachments/capability próprias, coluna física direta, metadados positivos,
namespace explícito de tipos (odbc_fast não é ODBC nativo), base64 canônico e
um registro completo com truncated:false explícito. Consulta comum/JSON não entrega essa
coluna; download conserva bytes, MIME publicado e nome seguro, sem conversão.
Contratos e tokens antigos não ganham binários. Contrato:
docs/persona-v2/attachments.md. Linhagem insuficiente
recusa, sem alias ou combinação ampliar autoridade. Contrato:
[campos e finalidades](docs/persona-v2/source-queries.md#campos-e-finalidades).

Mudança de comportamento atualiza contrato, schemas, instruções do runtime
afetado, rules e testes na mesma tarefa. O legado usa
`src/infrastructure/mcp/server-instructions.ts`; a v2 usa base e guias em
`src/application/persona-v2/`, incluindo `runtime-instructions.ts`. Não aplicar
instruções de uma entrada à outra. Roteiro, diagnóstico e histórico do console
não reservam autoridade; comparação de publicação é produzida pelo servidor
com os pacotes exatos. Auditoria transacional conserva somente metadados.

Console executa somente preparações existentes com Bearer do consumidor,
persona e estado reconferidos. Aprovação Client é separada; tools de referência
recebem apenas ID/fingerprint, sem copiar conteúdo administrativo. Clique duplo
ou confirmação perdida não autoriza retry. Troca de token/contexto descarta
estado e respostas antigas. Contrato: docs/persona-v2/console.md.

`npm run docs:check` verifica links locais/âncoras, índice das rules, exemplos
JSON/contratos e cobertura documental dos gates, sem rede ou banco. Uso e limites
no [índice documental](docs/README.md#validação-automática).

Node 24 LTS e TypeScript 7 real permanecem nos gates. O contrato do hub é fixado
por commit upstream exato + snapshot histórico SHA-256 já incorporado; CI e
`training:check` exigem checkout, SHA e contrato exatos. Comprovam incorporação
no ancestral revisado por índice temporário, sem reaplicar patch ou tocar o index
do hub; candidato atual exige ancestralidade e revisão própria. Snapshot não é commit.
Console lista conexões OAuth por persona e revoga somente a escolhida com sessão
Client, CSRF e fingerprint exato. Auditoria é transacional; access/refresh derivados
da conexão são bloqueados, sem revogar originador/outras conexões. Datas históricas
ausentes não são inventadas. Estado local não certifica autoridade remota.
Migrations aplicadas são imutáveis. Baseline v2 exige banco MCP vazio/dedicado;
não converter ou resetar banco legado, hub, agente ou ERP automaticamente.
