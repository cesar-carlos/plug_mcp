# Homologação MCP → hub → agente → três motores

O reinício composto reserva orçamento para cada parada/partida sequencial,
reconexão e verificação final. Os limites individuais de processo, RPC e SQL
permanecem vigentes; o timeout de um caso de consulta não deve encerrar esse
percurso antes de terminar a inicialização autorizada de seus processos.

O [runner explícito](../../scripts/run-persona-chain-homologation.ps1) usa a
composição persona-v2 real, PostgreSQL de controle, REST do plug_server,
Socket.IO/RPC do plug_agente, policy técnica, identidade na conexão executora,
ODBC, transações e journal SQLite durável. Nenhuma consulta de negócio é enviada
diretamente do MCP ao banco. Todos os dados e credenciais são sintéticos.

Antes de iniciar processos ou migrations da cadeia, o runner executa
`check-training-base` contra o `HubCheckout` explícito. Divergência do commit-base
ou contrato revisado recusa a rodada; não atualiza pin/snapshot automaticamente.
O commit vigente já incorpora o snapshot histórico: a checagem confirma
ancestralidade, bytes commitados e `apply --reverse --check`, sem reaplicar o patch.
A checagem inicial não congela arquivos contra alterações concorrentes posteriores.
O runner captura os três checkouts antes dos testes e reconfere depois, inclusive
quando os testes falham. [Inventário compartilhado](../../scripts/checkout-snapshot.mjs)
fixa commit-base, hash dos bytes locais e contagem de arquivos; inclui modificações,
arquivos novos não ignorados e exclusões. Não altera o index nem lê `.env` ignorado.
Links/junctions, checkout aninhado ou repetido e arquivos ilegíveis são recusados.

O [registrador](../../scripts/persona-chain-sources.mjs) conserva o antes/depois
em arquivo novo `node_modules/.cache/persona-chain-sources-<UUID>.json` e emite
somente seus metadados no log. Divergência ou inventário indisponível impede
resultado positivo do runner, mesmo com testes aprovados. Falha dos testes
continua sendo falha quando os bytes não mudam. Interrupção que impeça a fase
final deixa registro incompleto, sem certificação.

Esse registro não é aceite de gate, não substitui a identidade da imagem e não
prova que arquivos ficaram congelados entre as duas leituras: alterações
transitórias revertidas podem ser indetectáveis. Arquivos ignorados e binários
instalados exigem evidências próprias. Usa as exclusões MCP da
[captura de candidato](release-evidence.md#identificação-do-candidato), sem
excluir fontes distribuídas do hub/agente. Conservar também o filtro e o resumo
do executor: um inventário estável não transforma rodada dirigida em matriz
completa. HTTPS/ChatGPT continuam manuais e `authorizesRelease` permanece false.

O modo padrão é `prisma`: hub e MCP usam bancos PostgreSQL separados e processos
HTTP independentes. As migrations Prisma são aplicadas somente no banco do hub
da fixture. Cadastro/aprovação de Client, solicitação e aprovação de
ClientAgentAccess passam pelas rotas reais; o MCP não cria contas ou agentes.
O runner reinicia os processos MCP/hub/agente e verifica os mesmos vínculos,
publicações e tokens, exigindo novo login administrativo. Antes de reiniciar o
agente, retira conexão ODBC e JWT/refresh de bootstrap do manifesto privado.
O agente deve recuperar sua configuração e segredos persistentes.

O cenário `delegação externa com hub persistente` usa Client e delegação reais
do hub Prisma para ler/editar casos externos via MCP. Recria a composição MCP
para conferir persistência e revoga diretamente no hub, mantendo o registro
local ativo para provar a revalidação remota. Contrato e relatório inicial são
fixtures editoriais sintéticas; isso não homologa execução do provedor, TLS
público ou OAuth completo. O filtro desse cenário não certifica os demais casos
da matriz, embora a infraestrutura dos três motores seja inicializada.

Os casos `publica adoção explícita` também verificam releitura de propostas
compartilhadas: estado sem conteúdo por padrão, conteúdo original quando pedido,
publicação/hash-base, outro token recusado e revogação diretamente no hub.
Precisam dos casos `inspeciona metadados pela conexão`, que produzem evidências
estruturais reais por motor. O recorte dirigido não inclui OAuth ponta a ponta,
reinício composto ou toda a matriz de falhas.

Nesse mesmo percurso, a lista de propostas próprias percorre 21 envios em duas
páginas, compara todos os IDs e confere a ausência de conteúdo. Outro token com
concessões equivalentes recebe lista vazia e não pode usar o cursor do autor.
Revogação diretamente no hub bloqueia página inicial e continuação. As páginas
não constituem snapshot distribuído nem prova de desempenho em catálogo grande.

O mesmo recorte verifica inativação delegada de exemplos privados das skills
adotadas: envio explícito, duas solicitações concorrentes, revisão incrementada
uma única vez e preservação do conteúdo e da publicação ativa. Revogação no hub,
com registro local ainda ativo, bloqueia a inativação de outro exemplo; leitura
independente da persistência confirma que a recusa não altera o rascunho.
Não executa os exemplos nem suspende a publicação.

Histórico entre versões é verificado nesse recorte com publicação e adoção de
uma segunda versão em outra skill. Token anterior não herda a versão nova;
token concedido às duas vê os dois vínculos. O novo vínculo executa consulta
pela cadeia. Suspensão do perfil da versão anterior bloqueia sua âncora/cursor,
preservando o vínculo independente; revogação do token bloqueia a leitura.

Inativação também passa por `/mcp/chatgpt`, com código PKCE e consentimento
pelas rotas OAuth. Consentimento sem treinar ou sem fonte recusa a mutação,
com persistência reconferida. Revogação da conexão impede a próxima inativação
sem alterar rascunho/publicação; outro acesso OAuth e Bearer seguem utilizáveis.
Somente os metadados do cliente são fixture; HTTPS/ChatGPT permanecem manuais.

A lista física também é exercitada via `/mcp/chatgpt`, com duas conexões do mesmo
originador, autorização/consentimento/código PKCE pelas rotas HTTP e persistência
real. Verifica duas páginas, cursores cruzados, consentimento sem treinar e
revogação individual preservando a outra conexão e o Bearer. Somente validação
de metadados do cliente OAuth é substituída por fixture; autoridade do hub e
acesso às bases permanecem reais. Isso não homologa HTTPS público ou ChatGPT.

`-Persistence memory` preserva o ensaio com repositórios privados em memória e
sem reinício conjunto MCP/hub. Não é fallback de Prisma. O agente usa
AgentConfigRepository, HubSessionStore, OdbcCredentialStore e ClientTokenRepository
reais sobre Drift; os adapters FlutterSecure usam o backend Windows DPAPI real
de flutter_secure_storage_windows. Somente a localização de suporte é redirecionada
para `chain-<UUID>/vault`; não há mock de criptografia nem leitura/migração do
cofre operacional. SQLite guarda metadados e o marcador de segredo, nunca PWD/JWT
ou token em claro. Cofre ausente, corrompido ou incompleto bloqueia recuperação,
sem recriar tokens ou usar credenciais de bootstrap.

Um segundo reinício do agente verifica os três journals por RPC real, sem
reutilizar o comprovante local do MCP. A mesma operação incerta mantém estado,
executionId e contagem desconhecida quando recebe uma duplicata de fixture.
Não homologa bootstrap/instalador desktop, concorrência entre processos no mesmo
cofre, Redis distribuído, TLS público ou quedas reais durante commit. Flags e
controle de casos continuam específicos da fixture. O MCP não recebe overrides de
gateway/autorização/transporte. Processos hub/MCP trabalham na sessão temporária,
sem carregar `.env` do checkout.

Processos filhos herdam somente caminhos e variáveis das ferramentas nativas.
Configurações operacionais, segredos, NODE_OPTIONS e seletores dotenv são
excluídos; configuração sintética é fornecida explicitamente pelo controlador.

## Pré-requisitos e isolamento

- Windows, Node 24 do projeto, TypeScript 7, Flutter/Dart e dependências dos três
  checkouts irmãos `plug_mcp`, `plug_server` e `plug_agente`.
- Docker para PostgreSQL 17 e SQL Server 2022 Developer. O provisionador também
  reserva uma instância Redis local para o ambiente; este runner mantém seus
  backends Redis desligados e não certifica operação distribuída.
- SQL Anywhere 16 instalado/licenciado e driver ODBC; SQL Server ODBC 18 e
  registrados. Pacote local extraído do psqlODBC (`podbc35w.dll` e dependências).
  O provisionador não instala drivers globais nem baixa binários.
- Recursos novos com nome `se7e_persona_<12 hex>_test`, filhos diretos da pasta
  temporária, portas aleatórias em loopback, DSN
  PostgreSQL privado em HKCU, removido ao final.

O [provisionador](../../scripts/new-persona-chain-fixture.ps1) cria três bancos
no PostgreSQL próprio: negócio, `persona_chain_control_test` e
`persona_chain_hub_test`. O manifesto inclui `hubDatabaseUrl`; Prisma recusa
manifesto anterior sem esse campo, banco compartilhado com MCP, destino externo
ou overrides de conexão na URL. Não lê `.env`,
não reutiliza fontes cadastradas e recusa substituir diretório/DSN existente.
Preserva a chave e as entradas ODBC preexistentes; cria apenas o DSN privado e
seu nome de exibição, removidos especificamente ao final.
Na primeira inicialização, o agente confere o banco efetivamente conectado antes
de criar somente as tabelas sintéticas `operation_fixture`, `schema_parent` e
`schema_child` (as duas últimas têm PK/FK compostas), além de quinze tabelas
`wide_00` até `wide_14` e duas views sintéticas. A policy de fixture usa recursos
explícitos: escrita somente em `operation_fixture`, leitura nas tabelas e em
`wide_15`; `wide_hidden` não é concedida. Reinício não recria
tabelas nem dados. UUID SQL Anywhere é provisionado pelo operador
na base recém-criada, conforme [DV2-007](decisions.md#dv2-007--uuid-provisionado-no-sql-anywhere).
O runtime nunca cria a tabela de identidade.

O runner também inspeciona metadados pela composição real nos três motores,
confere pares ordenados e ocultação de relacionamentos fora do escopo. Publica
padrões sintéticos e skills que adotam referências exatas, emite concessões novas
e executa SELECT com expectativa de colunas e constraints na própria conexão.
Publica/adota perfil físico, exige substituição explícita, recusa outra base e
confirmação reutilizada; suspensão do perfil bloqueia contexto/consulta. SQL Anywhere
mantém enforcement desconhecido. Editar padrão não altera a skill. Esses
casos não homologam a matriz integral de constraints, views, mínimos
privilégios ou a matriz integral de drift/compartilhamento entre responsáveis.

O ensaio amplo inspeciona dezesseis recursos em quatro páginas, recusa lacuna,
compõe na ordem física mesmo quando recebe IDs invertidos e conserva a menor
validade. Publica uma skill com JOINs compostos entre recursos de páginas
diferentes e uma view. O observer registra somente a contagem da expectativa
estrutural recebida no RPC, sem SQL/valores. Duas ações fixas do companion alteram
somente `wide_07`: acrescentar coluna fora do treinamento e mudar o tipo de uma
coluna treinada. O primeiro caso deve preservar a consulta; o segundo deve
descartar dados/suspender a publicação dependente, conservando consulta independente.
Essas ações são de provisionamento de fixture, nunca tools/endpoints do produto,
não recebem SQL/identificadores e conferem a base antes do DDL. Não habilitam
DDL de negócio. Resultados executados ficam no [índice de evidências](validation.md).

## Execução reproduzível

O modo opcional `-CandidateImage` do wrapper usa o MCP empacotado e exige
autoridade Prisma. O [roteiro da imagem](candidate-distribution.md#fluxo-real-de-treinamento-na-imagem)
define alcance, requisito Docker Desktop e filtro dirigido. Sem esse parâmetro,
o processo MCP continua usando a composição do checkout; não tratar essa rodada
como prova da imagem.

Na fixture Docker, a origem do hub permanece igual à configuração persistida
do agente e aos helpers locais. Um relay TCP restrito ao loopback do contêiner
encaminha a porta verificada para o host, sem interpretar HTTP/RPC ou alterar
identidades. O controlador encerra o relay com o contêiner. Isso não instala
proxy de produção nem comprova HTTPS público; substituir a origem apenas no
MCP quebraria a autorização física dos lançamentos.

No PowerShell, com os diretórios dos pacotes locais preparados:

```powershell
$manifest = & scripts/new-persona-chain-fixture.ps1 `
  -PostgresDriverDirectory 'C:/fixtures/psqlodbc/bin'
$fixtureRoot = Split-Path $manifest -Parent
try {
  & scripts/run-persona-chain-homologation.ps1 -Manifest $manifest `
    -Persistence prisma `
    -Flutter 'C:/flutter/bin/flutter.bat' `
    -DriverDirectories @("$fixtureRoot/pgdriver")
  if ($LASTEXITCODE -ne 0) { throw 'Cadeia real reprovada.' }
  & scripts/run-four-engine-homologation.ps1 -Manifest $manifest `
    -Flutter 'C:/flutter/bin/flutter.bat' `
    -DriverDirectories @("$fixtureRoot/pgdriver")
  if ($LASTEXITCODE -ne 0) { throw 'Matriz nativa reprovada.' }
} finally {
  & scripts/remove-persona-chain-fixture.ps1 -Manifest $manifest
}
```

Execute os runners Flutter em sequência: compartilham o artefato nativo do
checkout do agente. Falta de motor, driver, companion ou manifesto falha; não há
skip silencioso. A suíte comum exclui essa pasta para nunca abrir bancos por
acidente. `test:persona-v2:chain` exige as mesmas variáveis explícitas preparadas
pelo wrapper e não tem fallback operacional.

Manifesto e arquivos temporários contêm apenas credenciais sintéticas da fixture;
nunca os anexar a relatórios ou versionar. Cada rodada usa subpasta `chain-<UUID>`
própria. Ao terminar, o controlador solicita parada dos seus processos. O
[removedor](../../scripts/remove-persona-chain-fixture.ps1) verifica raiz absoluta,
nomes e labels Docker, volumes anônimos exclusivos, DSN e processo SQL Anywhere antes de remover os recursos
indicados. Não limpar bancos do hub, agentes existentes ou bases de usuários.
Se o provisionamento falhar antes de produzir manifesto, `resources.json`
identifica os alvos criados para inspeção e limpeza específica; não há reset geral.

## Casos e limites da evidência

O cenário Redis lança dois processos MCP adicionais, com origem canônica e banco
de controle comuns e Redis exclusivo da fixture. Mantém o processo principal
sem cache para não mudar os demais cenários. Barreiras somente da fixture retêm
publicação após SQL e sinalizam claim do seguidor; não alteram SQL ou autoridade.
Parada/reinício do Redis exige label proprietário e porta privada fixa, conferida
por nova conexão ao retornar. Isolamento, revogação e ausência de reenvio são
verificados nos três motores. [Rodada e limites](validation/2026-10-16-redis-multi-instance.md).

O runner aceita `-TestNamePattern` para repetir explicitamente cenários afetados.
Segue exigindo os três motores e o pin do hub; registrar cenários excluídos e
não apresentar a seleção como matriz completa ou aceite de infraestrutura.

A fixture fechada `binary_fixture` tem somente leitura na policy e nove linhas
sintéticas: assinaturas PDF/PNG/JPEG/WebP, bytes opacos, NULL, arquivo vazio,
duplicata e arquivo acima de 64 KiB. O companion verifica o banco descartável
antes de criar/sementar e não recria dados após reinício. Nenhum DDL ou byte
arbitrário do consumidor é aceito. A preparação usa literais binários gerados
somente desses bytes fechados, sem depender do binding de parâmetros binários.

As consultas publicadas usam schema explícito e somente a coluna do arquivo,
parâmetros separados, teto de duas linhas e prova truncated:false no caminho
expectedSource, sem paginação gerenciada. Os casos comparam bytes HTTP/resource,
exercitam obter_anexo, conferem revalidação remota sem novo SELECT e recusam
outro token/persona, contrato ausente, NULL/vazio/múltiplas linhas e revogação.
Reinício recupera os anexos cifrados ainda vigentes no banco de controle, com
revalidação remota e sem novo SELECT de negócio. Token revogado permanece
recusado; somente nova criação explícita consulta novamente com as credenciais
recuperadas do cofre. A [rodada de recuperação](validation/2026-10-16-shared-attachments.md)
passou nos 77 cenários persistentes dos três motores, sem encerrar gates.
Metadados do observador conservam somente nomes, tipos,
tamanhos, contagens e flags, nunca células, SQL, parâmetros ou credenciais.
[Evidência binária](validation/2026-10-16-binary-chain.md).

A suíte cobre persona vazia recebendo três fontes; autenticação administrativa;
descoberta de motor/identidade; publicação real de consulta; SQL adaptado;
leitura do treinamento publicado; origem e completude; resultados vazios;
concessões restritas; reinício persistente MCP/hub; cruzamentos PostgreSQL com cada outro
motor, publicações exatas, proveniência e negação de dependência sem concessão.

As skills SQL registram casos obrigatórios e só publicam após execução nativa
isolada com rollback confirmado. O avaliador legado usa a tabela fixa vazia; o companion genérico adicional
é descrito abaixo e mantém fronteiras próprias de fixture. Preview, hash, publicação e aprovação Client passam pelas rotas reais.
São exercitados INSERT/UPDATE/DELETE, saídas escalares, concorrência, contagens
diretas, recusa sem aprovação, hash divergente, cancelamento antes do envio,
token consumidor revogado após aprovação, journal e credencial técnica revogada.

Uma falha deliberada é injetada **depois do commit nativo bem-sucedido**. MCP e
journal mantêm resultado desconhecido e contagem nula; nova execução é recusada
sem outro dispatch. A matriz nativa separada complementa essa evidência com
reabertura do journal e efeitos persistidos. Não representa queda real do processo
nem certifica todas as janelas de desconexão/timeout do sistema distribuído.

Prova divergente na conexão executora recusa SQL deliberadamente inválido antes
de executá-lo. Consultas verificadas informam `truncated:false` explicitamente
quando completas; truncamento continua recusado pelo cruzamento. Isso não
converte ausência de prova em completude nem aprova semântica de negócio.

Os [gates](acceptance.md) permanecem pendentes de aceite integral. Avaliação da
IA consumidora, tipos/triggers completos, reinício dos processos em trânsito,
retenção, OAuth, integrações externas e demais jornadas requerem evidência própria.
Deploy e corte continuam bloqueados pelos três manifestos de release.

Evidências do modo Prisma e seus limites:
[rodada persistente MCP/hub](validation/2026-10-12-persistent-onboarding-chain.md) e
[cofre/reinício do agente](validation/2026-10-12-agent-vault-restart-chain.md).

## Publicação SQL genérica em fixtures privadas

`runSqlPublicationCases` captura pacote/casos/fonte sob lock, grava reprovação
preventiva, executa fora da transação MCP e revalida todos os hashes e versões
antes de aprovar. O relatório identifica `persona-generic-sql-fixtures-v1`.
Preview/publicação e runner usam `compileOperationPublication` para operações;
consultas usam o mesmo compilador e a mesma adoção do catálogo. IDs de operação
são novos por caso. Com marcador treinado, `input.operationId` do caso é um alias
lógico materializado em UUID novo nas sementes/expectativas daquela coluna.
Sem marcador, alias é recusado. Nunca se reaproveita receipt.

`BridgePublicationCaseExecutor` compõe os gateways reais de leitura/operação e
recebe um controlador local de fixture. Só executa na fonte test vinculada ao runId,
agente e identidade. Pode receber vínculo explícito com uma fonte pretendida:
conserva SQL, dialeto, recortes e expectativa estrutural, mas usa exclusivamente a
credencial/identidade da fixture. DML recebe banco/fingerprint próprios de teste;
não altera o pacote pretendido nem envia SQL à credencial operacional.
As declarações tipadas do manifesto privado provisionam tabelas `publication_*`
no companion do agente. A policy concede apenas essas tabelas adicionais.
Declarações podem incluir `foreignKeys` com pares ordenados e chave anterior
PK/UNIQUE compatível. `onUpdate`/`onDelete` aceitam somente `no_action` (default)
ou `cascade`; não habilitam escrita distribuída. `checks` admite exclusivamente
`{ kind: "integer_range", column, min, max }`, com limites decimais inteiros textuais
dentro de int64 e coluna inteira existente. Não aceita expressões SQL. CHECK
preserva a semântica nativa de NULL/UNKNOWN; não substitui NOT NULL.

`insertAudit`, `updateAudit` e `deleteAudit` aceitam `{ targetTable }`. Triggers fechados
copiam as colunas para tabelas separadas de layout idêntico: INSERT/UPDATE usam
a imagem NEW e DELETE usa OLD. Destinos dos eventos devem ser distintos e sem
outros triggers; não há seeding que dispare UPDATE/DELETE automaticamente.
O manifesto não aceita SQL, scripts, cadeia de triggers ou destino externo. O companion
verifica as declarações, cria FKs/triggers somente na fixture, recria tabelas em
ordem de dependência e descarta a fixture se preparo/limpeza falhar.
Cada caso semeia tabelas vazias, executa SQL pela cadeia e confere todas as linhas,
tipos, duplicatas, ordem quando declarada, contagem e completude. Condições de
linhas exigem rollback confirmado e prova de que todas as sementes sobreviveram.
Decimais de conferência são projetados como texto; números JS inexatos são
recusados. Células SQL nulas são preservadas no transporte, inclusive em múltiplos
resultados. Campos opcionais do protocolo continuam omitidos.
Inteiros de conferência também usam texto, preservando valores fora do intervalo
seguro de JavaScript. Casos de consulta podem projetar BIGINT/DECIMAL/UUID como
texto explícito e ainda comparar o valor lógico tipado, sem arredondamento.

`expected.error: "NATIVE_FAILURE"` exige receipt com `rollback_confirmado`,
categoria `SQL_OPERATION_NATIVE_FAILED` e igualdade de todas as sementes após
o erro. Timeout, erro de transporte, limite de linhas e resultado desconhecido
não satisfazem essa expectativa. A categoria não distingue PK, UNIQUE, FK ou
erro de trigger: a causa exercitada vem da fixture/caso, não de mensagem nativa
interpretada. É obrigatório um caso positivo para aprovar a operação.
Contagem direta não inclui inserções causadas pelo trigger; os efeitos indiretos
são verificados separadamente nas tabelas esperadas e documentados no treinamento.
O mesmo vale para linhas modificadas/removidas por cascata. Casos de cascata
composta conservam outro tenant homônimo, conferem filhos e provocam falha em
CHECK descendente ou etapa posterior para provar rollback de todos os efeitos.

A conferência autoriza o conjunto exato das tabelas uma vez por caso e revalida
essa policy antes/depois de cada SELECT. Uma consulta de COUNTs por UNION ALL
comprova cardinalidade de todas as tabelas; só as comprovadamente vazias deixam
de ter leitura de linhas. As não vazias têm todos os valores conferidos. Contagem
incompleta, duplicada ou divergente reprova, sem inferir ausência.
Checagens do operador são espaçadas em
200 ms por agente/gateway em memória; não há cache de policy/resultados, redução
de portões ou retry. No host persistente de teste, os gateways reais e suas sessões
em memória são reutilizados por credencial/versão. O comando CLI isolado continua
compondo seus próprios gateways. Rate limit ainda recusa a rodada; não se alteram
limites para acelerar testes e uma fixture incerta não é reutilizada.
A sessão do companion privado dura até doze minutos para a matriz ampliada,
com timeout de teste de catorze. Isso não altera prazos SQL, preparação/aprovação
de quinze minutos ou sessões administrativas. Encerramento e limpeza seguem
por ownership, sem manter fixture em produção.

Falha de preparo, execução incerta, leitura sem conclusão ou falha de limpeza
inutiliza o executor. Não há retry; descarte toda a fixture. O companion reiniciado
recusa preparar/limpar casos genéricos. Nenhum endpoint aceita relatório pronto.
Use sempre manifesto recém-provisionado; reutilizar tabelas de uma
rodada encerrada não constitui nova evidência.

Escopo inicial: consulta parametrizada com resultado vazio/não vazio,
texto Unicode, inteiros, null, operação em duas tabelas e rollback completo por
versão divergente. A matriz ampliada acrescenta casos de BIGINT/DECIMAL exatos,
datas/booleanos/UUID, PK/UNIQUE/NOT NULL, FK composta e trigger de cópia de inserção.
Inclui também CHECK de intervalo inteiro, cascatas compostas UPDATE/DELETE e
triggers de cópia NEW/OLD, com conferência separada de efeitos indiretos e rollback.
As rodadas e resultados estão no [índice de evidências](validation.md).
Não certifica todos os tipos, collations, triggers,
adoção compartilhada pelo novo executor, fontes
operacionais ou semântica de negócio. Não encerra qualquer gate de release.

### Comando de operador e evidência

`npm run persona:test-publication -- <manifesto.json>` é exclusivo de desenvolvimento.
`DATABASE_URL` aponta ao controle MCP v2; a geração/migrations são verificadas,
sem reset. O manifesto fica na sessão `chain-*` da fixture temporária ainda ativa.
Contém versão 1, runId, sessionRoot, hubUrl local explícita, personaId, skillId e
bindings de sourceId → fixtureSourceId com declarações tipadas de tabelas.
Não aceita credenciais, SQL de setup ou aprovação enviada pelo usuário.
O companion precisa ter sido iniciado com as mesmas declarações. As tabelas usam
namespace `publication_*`; o runtime de produção não oferece esse controlador.

O relatório técnico usa `persona-generic-sql-fixtures-v1` ou
`persona-generic-federation-fixtures-v1`. A migration aditiva `0023` acrescenta
`evidencia` com ID/horários da rodada, fonte pretendida, versões, dialeto,
fingerprints, identidade da fixture, hash da declaração e publicações dependentes.
Não armazena SQL, parâmetros, linhas ou segredos nesse campo nem na auditoria.
Relatórios antigos permanecem sem essa prova; nada é backfilled ou aprovado.

Consultas têm `input.params`, `input.fixtures` e `input.sql` opcional para testar
adaptações, sempre sob AST/recortes/finalidades/limites normais. `expected` fixa
colunas/tipos, linhas tipadas e ordem. Operações têm contrato próprio já descrito
em [lançamentos](sql-operations.md); aprovação exige ao menos um caso positivo
obrigatório, além das coberturas específicas de adaptação/conciliação.

### Cruzamentos com leitura real

`runFederationPublicationCases` recebe plano tipado, sementes por fonte em
`input.sources` e saída tipada (`columns`, `rows`, `ordered`, `totalRows`) ou
erro determinístico esperado. Não recebe resultados locais fabricados. Cada fonte
precisa de fixture física independente e vinculada; sem fonte/motor/guarda real,
a rodada falha. Todos os SELECTs passam pela validação normal e hub/agente;
campos usados pelo cruzamento mantêm as finalidades de suas dependências.

Captura/publicação fixam publicações ativas, versões, fontes, recortes e
conhecimento compartilhado autorizado. Uma reprovação inicial invalida aprovação
anterior antes de executar. Preparo, SQL, combinação e limpeza ficam fora dos
locks MCP. Revalida antes de cada leitura e depois de todas as etapas, incluindo
fontes já lidas. Limpeza precisa terminar antes de gravar aprovação final.
Falha de transporte/identidade/autoridade não vira erro esperado. Prazo perdido
durante SELECT inutiliza a fixture; não se limpa/reenvia enquanto o efeito estiver
incerto. Erro na definição ou semeadura também não aprova caso de recusa.

Casos obrigatórios precisam passar e incluir saída positiva; somente erros
esperados não certificam a capacidade. Truncamento nunca é total presumido.
O runner sintético anterior continua com escopo `synthetic-combination-only`
para os casos de desenvolvimento antigos; não aceita este formato, não fornece
evidência de SQL real e não encerra gates. Migrar um caso é ação explícita, sem
converter ou alterar publicações existentes automaticamente. Avaliação da IA e
revisão semântica humana permanecem separadas da aprovação técnica.

## Sessão contínua para treinamento manual

O comando abaixo cria uma fixture Windows nova, privada e descartável. Exige os
três motores/ODBC, Flutter, dependências dos três checkouts e imagem candidata
preparados conforme este documento. Não usa fontes cadastradas pelo usuário.

```powershell
& scripts/start-persona-manual-training.ps1 `
  -PostgresDriverDirectory 'CAMINHO_DO_DRIVER_POSTGRES' `
  -Flutter 'CAMINHO_DO_FLUTTER/flutter.bat' `
  -CandidateImage 'IMAGEM_CANDIDATA_LOCAL' `
  -Minutes 60
```

A seleção da imagem é explícita e resolvida para ID imutável local. O controlador
confere o contrato do hub e inventaria os três checkouts. Cria PostgreSQL de
controle MCP vazio, PostgreSQL/Prisma do hub, bases sintéticas dos três motores,
agentes com persistência/cofre isolados e servidor/worker da imagem candidata.
As migrations são explícitas. Não cria persona, fonte, token, treinamento ou
publicação no MCP: essas ações pertencem ao ensaio humano.

A duração é de 10 a 120 minutos, padrão de 60, contada desde o início da
preparação dos companions. Não há renovação automática. Sessão administrativa,
aprovações, operações e consultas conservam seus próprios prazos e limites.
O manifesto imprime somente endereço local, prazo e caminhos privados. O arquivo
`manual-access.json` contém credenciais sintéticas e os cinco campos de cada
fonte; abra-o localmente e preencha somente os formulários do navegador. Não
copie credenciais para chat, relatório, URL ou pacote do plugin. A ACL da raiz
é restrita ao usuário atual e SYSTEM antes da gravação de credenciais; logs e
arquivos filhos herdam essa proteção. O controlador confere a ACL real antes de
criar a sessão, gravar chaves ou iniciar serviços, inclusive quando chamado
diretamente. Pasta com herança aberta ou concessão adicional é recusada sem
alterar suas permissões. O teste específico exige Windows real e não usa os
motores. A sessão não prepara HTTPS público nem
instala o aplicativo desktop do agente.

Mantenha o terminal inicial aberto. Após aparecer a confirmação de prontidão,
outro terminal pode solicitar a parada antecipada com o caminho do manifesto
informado pelo comando inicial:

```powershell
& scripts/stop-persona-manual-training.ps1 -Manifest 'MANIFESTO_PRIVADO_DA_FIXTURE'
```

A parada é cooperativa e não promete cancelar SQL em andamento. No prazo final
ou na solicitação, o controlador aguarda os companions e remove somente seus
containers identificados. O lançador limpa a infraestrutura pelo procedimento
guardado existente somente após comprovante de parada limpa da mesma sessão.
Se faltar confirmação, houver erro ou o terminal for encerrado à força, conserva
a fixture; investigar os recursos próprios antes de usar a limpeza guardada.
Não iniciar outra sessão sobre a raiz anterior. A limpeza remove os cadastros e
treinamentos experimentais; não há importação automática para outro ambiente.

Executar o [roteiro humano](onboarding.md#roteiro-manual-de-treinamento-no-candidato-isolado)
e registrar os resultados separadamente. Processo encerrado com sucesso ou
inventário estável não aprova o treinamento, a IA ou qualquer gate de produção.
Deploy/publicação continuam bloqueados, e HTTPS/ChatGPT permanecem manuais.

### Material sintético para a primeira consulta manual

Em cada uma das três fontes desta sessão, o companion prepara a tabela
`operation_fixture`, sem dados do ERP. O registro inicial tem `marker='seed'`,
`amount=10.25` e `revision=1`; `id` é chave primária inteira gerada pelo motor.
`marker` é texto obrigatório e único; `amount` é `DECIMAL(18,2)` obrigatório;
`revision` é inteiro obrigatório. O grão é um registro sintético por identificador.
Não há relacionamento a inventar para essa consulta inicial.

No editor de consulta da fonte, declarar a tabela, sua identidade `id` e as
colunas `id` e `amount`, com significado e classificação livre. Salvar este
exemplo, válido nos três motores da fixture:

```sql
SELECT p.id, p.amount
FROM operation_fixture p
WHERE p.id > 0
ORDER BY p.id
```

Para exercitar parâmetros, adicione `minimum` do tipo `integer`, obrigatório,
com significado “Identificador mínimo”, e substitua o filtro por
`WHERE p.id > :minimum`. Recarregue o treinamento e confira nome/tipo do parâmetro.
Após publicar, informe `0` no campo do consumidor para obter `10.25` e `999`
para obter vazio. Os valores seguem separados do SQL; não interpolar no texto.
Ao sair de Consultas, valores e modos de envio são descartados. A
[rodada parametrizada](validation/2026-10-23-query-parameter-reset.md) também
preserva concessões distintas e revogação pela cadeia real dos três motores.

Revisar semanticamente, definir o prazo humano de revisão e publicar. Consulta
sem casos avisa essa ausência; não criar relatório aprovado por suposição. Para
testar casos obrigatórios, usar o runner separado e suas fixtures próprias.
Conceder explicitamente a fonte/skill publicada no token e usar esse Bearer
somente no navegador para validar e consultar. O resultado inicial esperado é
um registro com valor decimal `10.25`. Adaptar o filtro para `p.id > 999` deve
produzir vazio, preservando a distinção de falha/recusa. Não usar a tabela de
treinamento manual como ambiente de DML experimental ou de runner.

### Repetir a validação técnica da sessão manual

A verificação de ACL pode ser executada separadamente no Windows real, sem
subir bancos ou usar DLL de ODBC:

```powershell
& scripts/with-project-node.ps1 node node_modules/vitest/vitest.mjs run `
  --config vitest.persona-manual.config.ts `
  tests/homologation/manual-fixture-access.test.ts
```

Para repetir também o navegador e a cadeia real, criar fixture nova com
`new-persona-chain-fixture.ps1 -PrivateAccess` e selecionar explicitamente a suíte
no runner existente. Exemplo, com manifesto e imagem locais próprios:

```powershell
& scripts/run-persona-chain-homologation.ps1 `
  -Manifest 'MANIFESTO_PRIVADO_DA_FIXTURE_NOVA' `
  -Flutter 'CAMINHO_DO_FLUTTER/flutter.bat' `
  -CandidateImage 'IMAGEM_CANDIDATA_LOCAL' `
  -Suite manual-training
```

Essa suíte exige Prisma, imagem candidata explícita e ACL privada. Registra
inventário antes/depois e testa recusa de pasta aberta, início vazio, treinamento
pelo Chromium nos três motores e parada limpa. O percurso também verifica tokens
com concessões distintas, omissão na descoberta, recusa de chamada MCP direta,
retirada de concessão pelo console e preservação do consumidor independente.
Emissões sucessivas aguardam o novo valor confirmado antes de trocar o consumidor;
campo não vazio não prova que a nova emissão terminou. Os Bearers ficam somente
em memória. Saída do console verifica descarte de resultados e armazenamento.
O modo adicional `-Suite manual-publication` usa outra fixture nova e percorre
casos obrigatórios pelo console, recusa de preview sem aprovação técnica, CLI
real de operador, leitura do relatório, revisão/publicação e invalidação do
relatório após alterar o caso. Não substitui `manual-training`: executar ambos
separadamente preserva o alcance e as cotas reais, sem ampliar limites ou repetir
SQL automaticamente. Ambos exigem Prisma, imagem explícita e ACL privada.

O runner registra um vínculo exclusivo de ambiente `test` pela API administrativa,
com credenciais sintéticas daquela fixture; a fonte pretendida permanece distinta.
Essa preparação é do operador, não uma jornada humana de cadastro. O CLI recebe
manifesto privado e não pode ser executado ou aprovado pelo console/MCP. Sua
falha devolve apenas código, origem enumerada e eventual prazo seguro de cota;
`repeatAllowed:false` permanece obrigatório, sem mensagens/SQL/segredos upstream.
O prazo informado não autoriza repetir efeito incerto. Veja a
[rodada integrada](validation/2026-10-23-manual-publication-console.md).
Não é um ensaio humano. O modo
`chain` continua padrão e não ganha prazo manual. Após a rodada, limpar somente
a fixture criada com `remove-persona-chain-fixture.ps1`, respeitando suas recusas.

## Bootstrap do aplicativo Windows compilado

O controlador `scripts/homologation/native-desktop.ts` testa o entrypoint privado
do agente compilado com prova de origem. É independente da sessão humana do
console e não executa instalador ou comandos de negócio.

Pré-requisitos: Windows, Python concreto com as dependências do tooling do agente,
prova `application-build.json` válida e fixture nova criada com
`new-persona-chain-fixture.ps1 -PrivateAccess`. O manifesto deve ter banco próprio
do hub; fixtures com sessão anterior são recusadas. Não usar alias Python da
Microsoft Store quando ele não puder ser resolvido pelo Node.

```powershell
& scripts/with-project-node.ps1 node node_modules/tsx/dist/cli.mjs `
  scripts/homologation/native-desktop.ts `
  --manifest 'MANIFESTO_PRIVADO_DA_FIXTURE_NOVA' `
  --hub 'CHECKOUT_DO_HUB' `
  --agent 'CHECKOUT_DO_AGENTE' `
  --python 'EXECUTAVEL_CONCRETO_PYTHON' `
  --proof 'RECIBO_PRIVADO_APPLICATION_BUILD_JSON'
```

O agente verifica a prova antes de criar um workspace protegido diretamente no
temporário do Windows. O controlador aplica migrations somente ao hub de fixture,
usa autenticação/aprovações reais e executa duas fases no mesmo perfil DPAPI:
início e reinício. Verifica primeiro frame, integridade SQLite, renovação de
sessão, identidade persistente, descoberta RPC pelo REST normalizado e parada
limpa. A conexão ODBC desse perfil é deliberadamente inacessível em loopback;
não é teste de consultas aos motores.

Logs, seeds e cofres permanecem privados. `native-result.json` contém somente
metadados, e `native-stopped.json` registra o fechamento observado dos processos.
Em falha ou parada inconclusiva, conservar a fixture para diagnóstico, sem
reiniciar o mesmo ensaio automaticamente. Para repetir, usar infraestrutura nova.
Após fechamento confirmado, preservar somente metadados autorizados e limpar a
infraestrutura pelo limpador existente; qualquer remoção do workspace desktop
deve conferir alvo absoluto, pai temporário, prefixo e ausência de reparse point.

Capturar inventário antes/depois conforme este contrato; não certificar alterações
posteriores com o resultado. A
[rodada compilada persistente](validation/2026-10-23-native-desktop-persistent.md)
registra falhas corrigidas, snapshots e limpeza. Esse bootstrap não substitui
atualização/recuperação instaladas, testes de interface ou os gates de produção.
