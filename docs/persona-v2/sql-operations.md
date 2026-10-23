# Lançamentos SQL — implementação em andamento

**A entrada de desenvolvimento `dev:persona-v2` publica operações treinadas
e liga preparação/aprovação ao transporte REST real do hub. O deploy permanece
bloqueado.** A entrada principal ainda é legada. A matriz inicial de lançamentos
ODBC passou nos quatro motores; o aceite integral e produção não foram liberados.
Evidências e limites em [validação](validation.md). O agente mantém opt-in desligado. Não utilizar
`sql.executeBatch` como substituto do contrato novo.

A [tela de operações](console.md#revisão-de-operações) oferece listagem limitada
por cursor, revisão das etapas/parâmetros e aprovação humana do conteúdo exato.
Execução, consulta ao agente, cancelamento e conciliação usam as tools MCP pelo
[painel do consumidor](console.md#ações-do-consumidor-em-preparações-existentes),
com Bearer solicitante, referência exata e confirmação separada. Criar preparações
no console ainda é pendência; aprovação não executa. O
[editor de skills](console.md#editor-de-skills-de-operação-sql) permite contrato,
casos sintéticos, leitura de relatórios e revisão/publicação. Relacionamentos e
vínculos compartilhados têm edição visual; JSON validado permanece como alternativa.
Adotar padrão/perfil atualiza conhecimento no rascunho, sem alterar passos,
parâmetros, tipos, identidade ou escrita. Inspeção/compatibilidade não substituem
constraints comprovadas, casos e publicação atuais nem concedem execução.

### Casos e relatórios administrativos

Sob `/api/admin/personas/:personaId/skills/:skillId`, com sessão Client,
Host/Origin/CSRF e autorização `treinar` revalidados:

- `GET /testes-operacao?after=<uuid>` retorna revisão, hashes do pacote/casos,
  casos e até vinte relatórios ordenados por horário/ID, com `nextCursor`.
  Metadados incluem runner, revisão, hashes, horário, aprovação técnica e
  resultado por ID de caso; não expõem SQL, parâmetros, resultados de negócio
  ou credenciais no relatório. Conteúdo dos casos é editorial privado da persona.
- `POST /casos-operacao` recebe `expectedRevision`, `required`, `content`,
  `id?` e `remove?`. Usa o schema fechado de caso SQL e CAS da skill.
  Criação, edição e remoção incrementam revisão na mesma transação da auditoria
  de metadados. Não alteram o snapshot publicado. Caso/skill de outra persona
  são recusados; chaves como `approved` são recusadas pelo schema estrito.

Não existem endpoints de execução/aprovação de relatório. O runner separado
continua sendo a única origem técnica. Relatório só conta quando revisão,
pacote e conjunto de casos correspondem; prévia/publicação revalidam as
dependências e coberturas obrigatórias. Se a dependência estrutural ficar
indisponível, os casos continuam editáveis, sem aprovação vigente presumida.
Não houve migration ou alteração no transporte de execução de negócio.

## Estado por projeto

| Projeto | Implementado                                                                                                                                                                                                | Necessário para ligar o fluxo                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| MCP     | Publicação somente_parametros ou SQL adaptável restrito, runner PostgreSQL isolado, preparação/aprovação/claim, REST v1 e conciliação por marcador único; retenção própria e ações do consumidor no console | Editores completos, homologação operacional; conciliação sem marcador exige contrato próprio |
| Hub     | Contrato REST aditivo fixado por base + snapshot; negociação v1, validação e transporte REST/agents:command/relay; limites, revalidação da sessão e ausência de reenvio de lançamentos por ACK              | Homologação real e corte coordenado                                                          |
| Agente  | Journal Drift, bootstrap/DI/shutdown, RPC/OpenRPC, hash local, executor ODBC, outputs/guardas/recuperação; negociação v1 e opt-in desligado por padrão                                                      | Homologação integral, gramática por dialeto e conciliação                                    |

`composePersonaV2` fornece autoridade de publicações, store PostgreSQL e adaptador
REST concretos. `createPersonaAdministrationApp` registra as tools quando recebe
esse serviço. Rascunhos não executam e publicações exigem concessões explícitas.
Nenhuma porta simulada é usada pela composição de desenvolvimento.

## Contrato publicado e testes obrigatórios

Fundação estrutural no agente: expectativa tipada participa do hash local,
exige negociação explícita de `sqlOperations.structureGuard:1` e capabilities
de identidade/estrutura/constraints aplicáveis. A mesma conexão confere metadados
antes da transação, dentro do teto de 32 comandos. Adoção compartilhada inicial
no MCP fixa versões, hashes, grão/classificação e chaves comprovadas conforme o
[contrato compartilhado](shared-knowledge.md#adoção-por-operações-sql). Transporte estrutural hub/MCP possui contrato
aditivo 1.15.0, negociação vigente, leitura exata das dependências e orçamento
nativo antes do envio. Motivo seguro durável é preservado no receipt. Recursos
qualificados estão implementados conforme a gramática abaixo. Publicação,
preparação, aprovação e entrega revalidam dependências compartilhadas. Runners
genéricos e prova limitada de constraints SQL Anywhere 16 estão implementados;
a matriz ampliada e o aceite integral permanecem pendentes.
[Evidência nativa e limites](validation/2026-10-14-agent-operation-structure.md).
[Transporte persistente e contrato reproduzível](validation/2026-10-14-operation-structure-transport.md)
comprovam o carrier por operador nos quatro motores, sem declarar adoção
compartilhada naquela rodada histórica. Evidências novas ficam no índice de validação.

## Motivo durável no comprovante

`failureCode` é opcional e enumerado no contrato 1.15.0. Agente persiste somente
a categoria segura no journal Drift v3, sem mensagem nativa, SQL, parâmetros,
nomes de recursos ou dados. Execute, get e duplicatas preservam o mesmo código;
cancelamento posterior não modifica um comprovante terminal. MCP conserva o
campo na persistência e entrega autorizadas. Estados em andamento e sucesso
não aceitam código de falha. Registros terminais antigos continuam sem motivo,
sem backfill por suposição; recuperação de execução interrompida registra
`SQL_OPERATION_INTERRUPTED` e mantém resultado desconhecido.

O código explica a falha observada; não prova commit, rollback ou ausência de
efeitos. `SOURCE_STRUCTURE_MISMATCH`/`SOURCE_IDENTITY_MISMATCH` exigem revisão da
dependência; nunca reassociação ou reexecução automática. Recusa estrutural
comprovada de operação compartilhada suspende a publicação utilizada na mesma
transação que conserva seu receipt. A revisão do responsável continua disponível;
entrega ao consumidor permanece sujeita à autorização vigente.

## Nomes físicos das tabelas

Treinamento de operações aceita `tabela` ou `schema.tabela` canônicos em
PostgreSQL, SQL Server e SQL Anywhere. Cada segmento tem até 100 caracteres
ASCII minúsculos (`a-z`, dígitos e `_`, início alfabético/underscore), e o nome
completo até 200. Aspas são geradas por segmento: `"public"."pedidos"` ou
`[dbo].[pedidos]`; nunca `"public.pedidos"` ou `[dbo.pedidos]`.
SQL Anywhere usa `[dba].[pedidos]`. Firebird não integra o escopo vigente v2.

Alvo, recortes, concessões, saídas, helper SQL Anywhere e marcador de conciliação
conservam esse nome exato. O SQL adaptável não troca/remove namespace. Misturar
nome simples e qualificado homônimos em tabelas/recortes exige revisão explícita,
evitando omissão de recorte. Schemas distintos podem ter tabelas homônimas;
concessão de uma não concede a outra. Novo nome exige revisão/publicação e
liberação dos novos capabilities/contrato aos tokens, sem alterar snapshots.

MCP e caminho `sql.operation.execute` do agente aplicam correspondência exata,
sem fallback de nome simples. Decisões transacionais não leem nem gravam o cache
legado de autorização. Semântica das flags globais da policy é preservada;
contratos não relacionados continuam com seu comportamento anterior. Recursos
de três/quatro partes, linked servers, nomes não canônicos e DDL são recusados.
O suporte não certifica toda extensão nativa, collation ou identificador Unicode.

[Exemplo completo de rascunho, dois casos e entradas](examples/sql-operation.json)
usa IDs sintéticos. Substitua `draft.training.sourceId` pelo vínculo da persona,
cadastre `draft` na rota de skills e cada item de `cases` na rota `/:skillId/casos`.
Após o runner, gere preview e confirme seu hash. Emita um token com fonte, skill,
efeito `update` e exatamente as `requiredCapabilities` devolvidas pelo preview.
Prepare com `{publicationId,input:prepareInput}`, revise/aprove pelo responsável
e execute somente `{operationId,fingerprint}`. Para operação automática, altere
`training.approval` para `automatic` e execute novamente runner/preview/publicação;
isso exige liberação explícita do novo contrato ao token. Permissão adicional de
aprovação no token continua prevalecendo.

`operacao_sql` usa `persona-sql-operation-v2`. O treinamento declara fonte,
dialeto, finalidade, parâmetros escalares tipados, tabelas/colunas e significado,
colunas graváveis, identidade e concorrência, regras, efeitos indiretos e
procedimento de conciliação. `approval` começa como `human`; a publicação confirmada
pelo responsável pode escolher `automatic`, respeitando exigências extras do token.

O modo inicial é `somente_parametros`. Cada etapa declara `id`, `effect`, `table`,
`values`, `where`, `outputs` e limites `rows`. Valores/igualdades referenciam um
parâmetro de entrada (`{kind:"input",name}`) ou saída escalar de etapa anterior
(`{kind:"step_output",stepId,output}`). UPDATE/DELETE exigem toda identidade e
concorrência treinadas. Leituras auxiliares têm projeção explícita e exatamente
uma linha; INSERT/UPDATE podem devolver identificadores conforme o dialeto.
SQL Anywhere compila saídas de INSERT/UPDATE em SELECT auxiliar, na mesma
transação. INSERT exige `tables[].uniqueKeys`, por exemplo `[["tenant_id","marker"]]`:
chave física UNIQUE treinada, preenchida, não nula e preservada pelos efeitos
indiretos documentados. UPDATE usa a identidade treinada com seus valores após
o SET. Não confundir declarar uma chave no treinamento com inspecionar/criar
uma constraint no banco. Efeitos que alterem essas chaves exigem outro contrato.
Cada escrita com saída exige exatamente uma linha afetada; a leitura exige
exatamente uma linha completa e saídas escalares tipadas. Ausência/duplicidade
faz rollback, nunca retorna ID presumido. Recortes físicos são reaplicados.
O pacote exige capability de tabela SELECT, colunas de leitura e efeito `select`
no token, além da permissão de escrita. Novas saídas exigem republicação e
liberação explícita. O compilador mantém o ID original da etapa para bindings
e cria uma etapa interna `__operation_write_<índice>`; esse prefixo é reservado.
Essas leituras e as contagens do driver entram no teto nativo de 32 comandos.
O consumidor adapta somente o DML original, nunca as leituras auxiliares.
Não há `MAX(id)`, expressões, scripts, DDL ou nomes dinâmicos.
`sql_adaptavel` admite SQL proposto exclusivamente na gramática abaixo. Gramática gerada não homologa o driver.
Esta gramática aceita nomes físicos ASCII simples ou qualificados por um schema,
conforme a seção de nomes físicos. Expressões e construções fora da gramática
exigem evolução do contrato e testes.

O compilador aplica recortes com bindings reservados em cada WHERE e preenche
as colunas recortadas de INSERT. O consumidor não pode fornecê-los ou sobrescrevê-los.
Cada contrato/fonte tem capability de hash exato além dos recursos/colunas/efeitos;
republicação alterada exige liberação explícita para tokens anteriores. Casos e
previews ficam ligados ao pacote, fonte, revisão e base comum vigentes.

Casos obrigatórios têm `input.parameters`, `input.fixtures` (tabela, colunas
`generated`, linhas com escalares tipados) e `expected` (linhas finais de todas
as tabelas e `affectedRows`, ou `error:"ROW_CONDITION_FAILED"`/`"INVALID_PLAN"`/
`"NATIVE_FAILURE"`). Falha nativa esperada só é aprovada pelo runner de transporte
com rollback confirmado, categoria nativa exata e sementes intactas; não identifica
qual constraint falhou pela mensagem do motor. O [contrato da matriz](homologation-chain.md#publicação-sql-genérica-em-fixtures-privadas)
separa a contagem direta dos efeitos de triggers e exige conferência dos dois.
`input.sqlByStep` contém adaptações de casos. No runner genérico de transporte,
`input.operationId` é somente um alias lógico opcional para o marcador treinado;
ele é substituído por UUID novo nas sementes/expectativas daquela coluna em cada
execução, sem interpolação de SQL nem reaproveitamento de receipt. Sem marcador
treinado, o alias é recusado. Preparações reais sempre geram seu próprio ID.
Adaptação exige casos obrigatórios positivos com SQL adaptado
e negativos com SQL recusado. Conciliação exige caso positivo com marcador do ID.
Execute `npm run persona:test-operations -- <personaId> <skillId>` somente em
desenvolvimento. `DATABASE_URL` identifica metadados MCP; a URL explícita
`PERSONA_V2_TEST_DATABASE_URL` deve terminar em `_test` e permitir criar banco.
O runner cria um banco aleatório próprio, executa setup/etapas/comparações em
transação, confirma rollback e remove seu banco. Nunca abre uma credencial ou
conexão cadastrada na persona. Não aceita SQL de setup livre ou relatório enviado
por endpoint. Falha/ausência de motor impede aprovação. Esse comando PostgreSQL
é diagnóstico isolado do executor, sem transporte hub/agente. Para publicação
pela cadeia dos três motores, use o
[runner genérico com manifesto](homologation-chain.md#publicação-sql-genérica-em-fixtures-privadas).

## SQL adaptável dentro do contrato

`training.mode:"sql_adaptavel"` muda a entrada de preparação para
`{publicationId,input:{parameters,sqlByStep}}`. `parameters` continua contendo
exatamente os escalares tipados declarados. `sqlByStep` é um mapa opcional de ID
de etapa para SQL; etapas omitidas usam a forma compilada. Não criar/remover
etapas, trocar comandos, fontes, tabelas, valores gravados, saídas ou limites.

O validador tokeniza o SQL na gramática fechada do dialeto, sem interpretar
Firebird como T-SQL. Permite reordenar atribuições de SET e igualdades de WHERE.
Cada condição obrigatória aparece exatamente uma vez, inclusive identidade,
concorrência e recortes. Só permite acrescentar condições AND presentes em
`step.adaptiveFilters`, por exemplo:

```json docs:adaptive-filter
{ "column": "amount", "operator": "<=", "parameter": "ceiling" }
```

O parâmetro `ceiling` deve estar declarado, não nulo e ter o tipo da coluna.
Operadores permitidos: `=`, `<>`, `<`, `<=`, `>`, `>=`; boolean/UUID só igualdade
ou diferença. O filtro opcional de índice zero recebe binding `:a_0`; atribuições
usam `:v_coluna`, igualdades obrigatórias usam `:w_coluna`. Recortes `:__scope_*`
são reservados. Exemplo PostgreSQL:

```sql
UPDATE "orders" SET "amount" = :v_amount
WHERE "version" = :w_version AND "id" = :w_id AND "amount" <= :a_0
```

Aspas físicas são próprias do dialeto: PostgreSQL `"orders"`, Firebird `"ORDERS"`,
SQL Server/SQL Anywhere `[orders]`. Literais, comentários, scripts, OR, funções,
expressões, JOIN, subconsultas e DDL são recusados. INSERT preserva a estrutura
compilada; UPDATE/DELETE podem ganhar filtros restritivos treinados. A otimização
depende do banco e de seus índices; a ordem textual de AND não garante ganho.
O SQL normalizado e todos os valores entram no fingerprint e no payload cifrado.
Alterá-los exige outra preparação/aprovação. O contrato novo não amplia tokens.

[Exemplo completo adaptável e conciliável](examples/sql-operation-adaptive.json)
contém rascunho, marcador, casos obrigatórios de sucesso/concorrência/SQL recusado
e `prepareInput`. Execute somente em fixtures próprias. As tabelas do exemplo não
são criadas automaticamente na fonte; DDL de negócio permanece fora do MCP.

## Conciliação de resultado desconhecido

`training.reconciliationQuery` declara `table`, `operationIdColumn` e
`appendOnlyGuarantee`. A tabela treinada deve ter identidade única composta só
por essa coluna UUID. Uma única etapa INSERT, com limite exatamente uma linha,
grava `{kind:"operation_id"}` nessa coluna na mesma transação dos lançamentos.
Nenhuma outra etapa pode alterar/apagar a tabela do marcador. O responsável deve
garantir PK/unique e política append-only reais; fixtures não comprovam essas
condições no ambiente de negócio. O MCP nunca cria essa tabela ou concede DDL.

`conciliar_operacao({operationId,fingerprint})` exige estado desconhecido,
publicação/fonte/permissões originais vigentes, concessão SELECT do marcador e
os portões atuais de Client/vínculo/policy. Não aceita SQL, chave, booleano de
aprovação ou resultado esperado. Compila SELECT por UUID exato e recortes da
fonte; usa leitura técnica com limite de duas linhas e prazo de dez segundos.
Revalida policy, credencial, token e publicação antes de persistir e entregar.

- Uma linha exata, completa e não paginada: `reconciliation.classification` é
  `aplicacao_verificada`, evidência do marcador transacional no banco.
- Ausência, duplicidade, truncamento ou ausência de prova de completude:
  `inconclusiva`. Não equivalem a rollback, cancelamento ou permissão de retry.
- Resposta com identidade/colunas divergentes, erro ou revogação: recusada,
  sem evidência entregue nem execução de escrita.

A evidência tem IDs, origem/publicação, fingerprint, hash da consulta, horário,
completude e contagem de linhas **lidas**, sem SQL, parâmetros ou valores.
Migration `0004_operation_reconciliation.sql` adiciona journal append-only por
persona/operação, ordenado pela versão CAS, inclusive quando horários empatam.
Uma evidência verificada não é substituída por leitura inconclusiva posterior.

`state`/`receipt` continuam representando o journal do agente: a conciliação não
inventa confirmação técnica de commit/rollback nem quantidade de linhas alteradas.
Enquanto o journal não comprovar o resultado, o estado técnico é desconhecido.
O campo `reconciliation` permite tratar a aplicação de negócio separadamente.
Um comprovante concorrente tem precedência; nunca é sobrescrito pela conciliação.
Nenhum desses caminhos torna a operação novamente executável. Conciliação sem
marcador exclusivo, por estado atual/chaves arbitrárias, continua pendente.

## Transporte e acompanhamento

O adaptador usa `POST /api/v1/agents/commands` com `sql.operation.execute/get/cancel`,
`contractVersion:1`, fonte física derivada de origem+agente+banco, banco explícito
e `client_token` da fonte. JWTs têm cache por credencial/versão, sem refresh/replay
da escrita. O detalhe autenticado `GET /api/v1/client/me/agents/:id` informa
`agent.sqlOperations` (v1 e limites) ou `null` na instância sem registro compatível.
O hub repete o portão imediatamente antes do dispatch. Policy completa é obrigatória,
com banco definido e permissões do comando; INSERT mapeia para upstream `update`.

Comprovantes preservam IDs, fingerprint, contagem nula e timestamps. Erro de
transporte de operação nunca recomenda retry. O MCP persiste o comprovante antes
da revalidação de entrega. `obter_operacao` consulta o journal quando o resultado
local é desconhecido e pode registrar conclusão/rollback comprovados, sem novo
execute. Sem prova, conserva o estado desconhecido. Conciliação por chave de
negócio quando o próprio journal não resolve ainda está pendente.

## Preparação e aprovação

`preparar_operacao` recebe `{publicationId,input}`. A porta de autoridade deve
compilar entradas contra o contrato imutável publicado; não recebe SQL livre.
O serviço guarda comando cifrado separado da auditoria, ID, fingerprint,
token/concessão solicitante, fonte, publicação e identidade da autorização.
O resumo consumidor contém somente metadados. Validade: 15 minutos.

A aprovação exige sessão administrativa Client do responsável, perfil vigente,
token solicitante autorizado e conteúdo exato. Não amplia permissões. Revisão
e aprovação usam cookie/Origin/CSRF; a IA não fornece booleano substituto.

| Interface condicional                                        | Contrato                                             |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `preparar_operacao`                                          | `{publicationId,input}`                              |
| `executar_operacao`, `obter_operacao`, `cancelar_operacao`   | `{operationId,fingerprint}`; campos extras recusados |
| GET `/api/admin/personas/:personaId/operations/:operationId` | Conteúdo preparado para revisão pelo responsável     |
| POST `/api/admin/personas/:personaId/operations/approve`     | `{operationId,fingerprint}`                          |

Fonte, credencial, publicação, permissões e concessão vinculam a preparação.
Mudanças exigem nova preparação. Persona/token/registro são bloqueados na ordem
da revogação. CAS registra `executando` antes do dispatch. Falha ou comprovante
incompatível após envio gera `resultado_desconhecido`; duplicatas não reenviam.
O comprovante é persistido mesmo após revogação durante execução, mas a entrega
ao consumidor revogado é bloqueada. Sucesso e incerteza incrementam a revisão
da identidade física compartilhada, sem compartilhar resultados entre personas.
O [cache v2](query-cache.md) usa essa revisão quando explicitamente habilitado;
pending/unknown também desativam reuso, sem impedir leituras autorizadas normais.

`0003_operation_integrity.sql` protege conteúdo/aprovação, versões/transições e
comprovantes terminais. Estados terminais agendam remoção do payload em 24 horas.
O [worker de retenção](review-worker.md#retenção-de-operações) remove conteúdo
após 24 horas e comprovantes após 90 dias do desfecho local conhecido, preservando
ID/fingerprint/estado e marcadores de remoção. Histórico sem relógio imutável
inicia prazo na migration; resultado desconhecido nunca entra na limpeza.
Não apagar operações desconhecidas nem restaurar sua executabilidade.

## Transporte e journal

Envelope do hub: `contractVersion:1`, `operationId`, `fingerprint`,
`sourcePhysicalId` (identidade física SHA-256), `expectedSource`, `database`, credencial técnica,
até 32 `steps`, `maxAffectedRows` e `timeoutMs` até 300000. Etapas declaram
`select/insert/update/delete`, SQL, parâmetros escalares tipados ou referência à
saída de etapa anterior, outputs e limites. Inteiros/decimais usam strings para
preservar precisão. O hub limita bytes/estrutura; não interpreta SQL. Agente e
MCP deve validar publicação, SQL completo e recortes. O agente aplica sua policy
vigente e um subconjunto conservador de comandos; não substitui o pacote do MCP.

O journal é um banco separado, aditivo, com WAL e synchronous FULL; guarda somente
metadados. Seu namespace vincula origem do hub, agente, hash do token técnico,
identidade física e prova esperada. sourcePhysicalId combina origem do hub e hash
nativo. O handler calcula o hash do conteúdo, incluindo expectedSource,
independentemente do fingerprint recebido; o mesmo ID/fingerprint não aceita
SQL, parâmetros, prova ou limites diferentes.
O schema 2 adiciona esse hash sem apagar registros; intenções antigas sem hash não
podem ser reclamadas. Duplicatas devolvem o estado original sem autorizar SQL.
`recoverInterrupted` executa no bootstrap exclusivo, antes de aceitar trabalho:
pendências passam a desconhecidas, preservando conclusões. Um lock de arquivo
impede recuperação por outro processo ativo. O shutdown fecha o journal.

O executor usa uma conexão e transação, desativa reconnect/replay, resolve somente
outputs escalares anteriores como parâmetros tipados e revalida policy, credenciais,
fonte e cancelamento antes de cada etapa e do commit. Condições de linhas e limites
por etapa/total são conferidos antes do commit. Manutenção drena operações admitidas
e bloqueia novas; o cancelamento legado por conexão não controla este caminho.

Drivers sem parâmetros preparados, motor conhecido ou base física comprovada
são recusados. A execução v2 exige prova admitida na conexão dedicada antes da
transação, conforme [identidade da fonte](source-identity.md#prova-na-própria-conexão-executora).
Nome da base ou catálogo ODBC vazio/truncado não substitui essa prova.
SQL Anywhere exige UUID provisionado manualmente pelo DBA (DV2-007), nunca
locator. Sem marcador válido, a transação é recusada antes de qualquer etapa;
o runtime não cria/repara a identidade. A prova ocupa um comando interno no teto de 32.
PostgreSQL/Firebird exigem `RETURNING` completo para contar linhas diretas;
SQL Server/SQL Anywhere verificam `@@ROWCOUNT` imediatamente na mesma conexão.
A prova da base e as consultas internas de contagem consomem o teto de 32 comandos.
Quando não há outputs PostgreSQL/Firebird, o MCP acrescenta `RETURNING 1` com alias
interno para contar sem ler campos adicionais. Esse trecho integra o hash preparado
e não deve ser acrescentado pela IA. A matriz inicial passou; triggers e tipos
fora das fixtures ainda precisam de homologação específica.

A gramática inicial aceita SELECT para condições e INSERT/UPDATE/DELETE em uma
tabela por etapa. Escritas com JOIN/subconsulta, CTE, scripts, comentários, DDL,
funções externas e nomes físicos com mais de duas partes são recusados. Várias
tabelas usam etapas distintas na mesma transação. UPDATE/DELETE exigem WHERE;
isso não prova identidade/concorrência, verificadas também pelo pacote publicado no MCP.
Outputs exigem uma linha, coluna declarada e tipo preservável. Não usar `MAX(id)`;
IDs gerados e saídas de INSERT/UPDATE compilados pelo MCP passaram na fixture
SQL Anywhere, encadeados como parâmetros das etapas seguintes. Conversões
completas, efeitos indiretos e cadeia operacional ainda exigem homologação.

Após timeout nativo, o resultado fica desconhecido e a conexão permanece reservada
até a chamada terminar; rollback/disconnect não concorrem com SQL/commit pendente.
Falha de commit nunca causa reenvio. Falha antes do commit só vira rollback confirmado
com confirmação do driver. A recuperação não prova o resultado no banco de negócio.

Solicitar cancelamento não confirma rollback; a operação pode concluir apesar
do pedido. O journal separado não elimina a janela entre commit e confirmação
local: não anunciar execução exatamente uma vez. O hub exige `sqlOperations`
versão 1, `enabled`, journal durável, transação por fonte e `automaticReplay:false`.
Os limites positivos de etapas, linhas e prazo são o menor valor das duas pontas,
limitados a 32/100.000/300.000 ms. Excesso é recusado, sem reescrever a preparação.
REST/`agents:command` (incluindo batches) e relay verificam o registro autenticado
e revalidam a sessão pronta imediatamente antes do envio após filas/serialização.
Agente antigo, versão incompatível ou capability ausente: `CAPABILITY_UNAVAILABLE`.
O agente omite a capability por padrão; `ENABLE_SQL_OPERATIONS` é opt-in explícito
para homologação, com verificação da preferência vigente em cada handler.
Alterar a configuração exige nova negociação. A extensão v1 não altera o perfil
base 2.11.2 nem certifica motor ou concede autoridade.

Nenhum método novo entra em reenvio por falta de ACK. Perda da resposta após envio
de execute retorna `SQL_OPERATION_OUTCOME_UNKNOWN`, `retryable:false`; consultar
estado/conciliação substitui repetição. Contagem indeterminada permanece `null`,
inclusive na serialização/replay do agente. Um harness isolado Node/Dart usa o
transporte Socket.IO de produção, journal SQLite temporário e transação simulada,
cobrindo dispatch REST e relay com duplicatas, consulta/cancelamento e commit
incerto. Não executa SQL nas bases de negócio nem homologa ODBC.

## Validação e continuação

Testes usam SQLite temporário, PostgreSQL descartável e gateways simulados.
Nenhum DML é executado em fontes de usuários. Cobrem preparação cifrada,
aprovação, identidade, expiração, CAS, concorrência, revogação, imutabilidade,
perda de confirmação, reinício, isolamento e revisão física do cache.

O [runner da cadeia isolada](homologation-chain.md) exercita MCP, REST, Socket.IO,
policy, publicação e aprovação Client nos quatro motores. O avaliador de casos
aceita somente a tabela fixa da fixture. Perda de confirmação injetada após
commit real permanece desconhecida e não é reenviada. Runners genéricos,
retenção e as jornadas de UI ainda ausentes estão no [trabalho restante](remaining-plan.md).

Os três manifestos seguem `ready: false`, sem gate integral marcado. Publicação
de imagem, deploy, instalador e feed do agente verificam o aceite coordenado.
Dry-run de instalador continua permitido sem publicação. Evidências:
[validação](validation.md).

## Runner SQL genérico de homologação

O treinamento opcional `relationships` conserva pares ordenados, cardinalidade,
significado e caminhos N:N. A adoção compartilhada inclui as FKs e a unicidade
1:1 no pacote e na guarda anterior à transação. Não amplia a gramática de escrita
nem concede efeitos nas tabelas apenas relacionadas. [Contrato](shared-knowledge.md#adoção-por-operações-sql).

A [cadeia isolada](homologation-chain.md#publicação-sql-genérica-em-fixtures-privadas)
agora compõe `runSqlPublicationCases` com gateways reais nos três motores.
Ele não substitui implicitamente o CLI PostgreSQL acima. Aceita declarações e
sementes tipadas do operador, confere resultados completos e invalida relatório
anterior antes de nova execução. Fonte/pacote/casos são conferidos novamente ao
persistir aprovação. Outcome incerto exige descarte, sem replay nem limpeza
concorrente. A composição operacional do produto e a matriz completa continuam
pendentes; esta extensão não libera deploy.

## Orçamento redutível da operação

`operationLimits` no token e na concessão da skill limita `maxAffectedRows` e
`timeoutMs`; OAuth pode reduzir novamente. `preparar_operacao.limits` é opcional
e só reduz. Tetos da plataforma: 100.000 linhas diretamente afetadas e 300.000 ms,
sempre subordinados ao treinamento publicado e aos portões remotos. Cada campo
aceita apenas inteiro positivo dentro do teto. O comando compilado fixa o menor
orçamento no fingerprint antes da preparação e aprovação. A soma dos mínimos de
linhas das etapas DML precisa caber no teto; consultas auxiliares não são contadas
como linhas alteradas. Guardas por etapa continuam vigentes. Não se apresenta
esse total como todos os efeitos de triggers/cascatas. Os 32 comandos são um teto
fixo, incluindo auxiliares; não há parâmetro por token para ampliá-lo.

Mudança de autoridade invalida preparação/aprovação; aprovação humana não
remove limite. Conciliação conserva seu contrato de leitura e reduz seu prazo
pelo orçamento vigente. Resultado desconhecido não é reenviado por reduzir prazo.
[Composição dos limites](source-queries.md#limites-redutíveis).
