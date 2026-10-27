# Conhecimento compartilhado persona-v2

Decisão aprovada [DV2-008](decisions.md#dv2-008--conhecimento-compartilhado-por-padrão-e-base).
Compartilhamento usa catálogos privados e concessões explícitas. A plataforma não
captura consultas automaticamente nem promove treinamento privado existente.

## Camadas e autoridade

Base técnica comum → padrão versionado do sistema → particularidades da base
física → especialidade/skills da persona. Cada skill deverá fixar versões e hashes;
alterar o rascunho de um padrão nunca altera uma skill publicada.

Credenciais, resultados, recortes e concessões continuam isolados. Uma publicação
de padrão declara estrutura e significado revisados, sem provar compatibilidade
física, homologar os motores ou conceder permissão de executar SQL.

## Implementado em desenvolvimento

- Migrations aditivas 0006–0007, sem seeds nem alteração de migrations anteriores.
- Catálogo privado; membros identificados por hubOrigin/client.id, nunca e-mail.
- Administrador gerencia papéis; curador publica; colaborador prepara rascunho;
  leitor recebe somente publicações não suspensas. Criador mantém administração.
- Rascunho CAS; preview de 15 minutos vinculado ao responsável, revisão, hash e
  versão de autorização do catálogo e publicação anterior; confirmação de uso único. Mudança de membros
  invalida previews. Edição preserva publicações anteriores imutáveis.
- Estrutura tipada, nomes físicos por dialeto, colunas, grão, classificação,
  tipos nativos/precisão/escala/comprimento por dialeto, unidades/moedas/calendário,
  chaves primárias/únicas e estado declarado. Relacionamentos têm chaves compostas,
  cardinalidade, origem de negócio/banco e estado declarado da restrição.
  `via` identifica tabelas intermediárias N:N; exige `path` com os IDs das relações
  diretas, na ordem que conecta origem, intermediárias e destino. Uma relação
  abstrata N:N via intermediárias não habilita JOIN direto entre as extremidades.
  Importação registra declarações revisáveis, nunca prova técnica do banco.
- Vários exemplos com variantes SQL por dialeto, parâmetros e explicação.
  Cada variante, inclusive inativa, recebe validação estrutural SELECT e fanout.
  Isso não substitui casos executados pelo runner nem revisão semântica.
- Console cria catálogos, importa conteúdo JSON, revisa/publica e concede membros.
  Também consulta histórico, compara versões e suspende uma publicação preservando
  seu snapshot. Alteração pendente exige descarte explícito ao trocar/criar catálogo.
  Importação de até 50 KiB não executa conteúdo. API mantém teto JSON de 64 KiB.
- Skills privadas de consulta aceitam `examples` opcionais com `id`, `purpose`,
  `sql` e `explanation`. Todos usam a fonte, dialeto e parâmetros da skill e passam
  por AST, fanout e recortes. Alterações entram no hash do contrato concedido;
  `obter_skill` entrega os exemplos publicados, sem captura de resultados.

## Relacionamentos reversos e caminhos executáveis

O treinamento de consulta conserva `id`, `via` (nomes físicos qualificados) e
`path` (IDs dos elos diretos na ordem). Importação de template e adoção pelo
console preservam esses campos; todas as intermediárias e os pares compostos
precisam estar selecionados. O pacote publicado fixa esse caminho no contrato.
A relação conceitual N:N não entra no allowlist SQL: somente seus elos diretos
autorizam JOINs. Caminho ausente, repetido, aninhado ou divergente é recusado.

Para relações declaradas de banco, `N:1` comprova a FK na origem; `1:N` comprova
a FK na tabela filha de destino, invertendo os pares sem mudar sua ordem.
`1:1` exige também chave primária/única habilitada nas colunas da filha e cobertura
da evidência. Quando há FKs nos dois sentidos, informe `constraintName` para
desambiguar; não se escolhe uma direção pela ordem das tabelas. Essas provas
não aprovam significado de negócio.

Um caminho N:N declarado de banco exige prova de todos os seus elos físicos.
Declaração `enabled` do treinamento não substitui cobertura ou enforcement
nativos. SQL Anywhere continua recusando adoção dependente dessas constraints
enquanto o estado for desconhecido. Relação de negócio revisada pode orientar
consulta sem afirmar enforcement; não há conversão automática para esse modo.

Snapshots compartilhados antigos que perderam o caminho explícito deixam de
ser utilizáveis; exigem revisão, testes, republicação e concessão aplicável.
Não se reescrevem snapshots ou hashes antigos nem se promove um JOIN direto por
coincidência de extremidades. Grafo e contexto preservam o caminho autorizado.
[Evidência e limites](validation/2026-10-14-relationship-paths.md).

## API administrativa

Todos os caminhos usam sessão Client vigente, Host/Origin e CSRF do console.
Gestão/publicação dos catálogos continua exclusiva da sessão Client e dos papéis
concedidos. A ferramenta MCP `inspecionar_estrutura` aceita Bearer/OAuth com
`treinar`, fonte concedida e delegação vigente. Identidades de destinatários
pertencem à origem do hub configurada.

| Método   | Caminho abaixo de /api/admin/catalogos           | Comportamento                                                              |
| -------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| GET/POST | /                                                | Listar concedidos / criar com name                                         |
| GET/POST | /:catalogId/membros                              | Listar / alterar com expectedVersion, hubClientId e role; null revoga      |
| GET/POST | /:catalogId/padroes                              | Listar / criar com slug, name e content                                    |
| POST     | /:catalogId/padroes/:patternId/editar            | name, content e expectedRevision                                           |
| POST     | /:catalogId/padroes/:patternId/preview           | reviewDueAt futuro ou plano humano vigente; revisão, diff, hash e validade |
| POST     | /:catalogId/padroes/:patternId/publicar          | confirmationHash do mesmo curador                                          |
| GET      | /:catalogId/padroes/:patternId/versoes           | Histórico, 20 versões por página; beforeId recebe nextCursor               |
| POST     | /:catalogId/comparar                             | beforeId e afterId do mesmo padrão, ambos autorizados                      |
| GET      | /:catalogId/publicacoes/:publicationId           | Snapshot concedido; suspenso indisponível para leitor                      |
| POST     | /:catalogId/publicacoes/:publicationId/suspender | Objeto vazio; somente curador/administrador                                |

Auditoria própria armazena IDs/eventos/horário, nunca SQL, estrutura ou resultados.
Rede de autenticação ocorre antes da transação; lock do catálogo serializa
concessões, revisão e publicação. Antes do commit a sessão é conferida novamente.

Histórico e comparação não mostram rascunhos ou versões suspensas para leitores.
Curadores mantêm acesso ao histórico suspenso para revisão. Cursor de outro padrão
ou catálogo é recusado. A comparação informa hashes e caminhos de itens acrescentados,
removidos e alterados, incluindo significados, classificação e SQL por dialeto.
Ela não decide compatibilidade, aprova testes ou atualiza fontes/skills. Reordenação
de entidades identificadas não aparece como mudança; a ordem dos pares de chaves,
do caminho N:N e de outras sequências semânticas permanece relevante.

## Exemplo de estrutura

Este exemplo é fictício; não descreve tabelas reais do Data7.

```json docs:shared-structure
{
  "system": "ERP sintético",
  "label": "1.0",
  "dialects": ["postgres"],
  "tables": [
    {
      "id": "orders",
      "name": "orders",
      "meaning": "Um pedido sintético por identificador",
      "resourceType": "table",
      "grain": ["id"],
      "physicalNames": [],
      "columns": [
        {
          "name": "id",
          "meaning": "Identificador sintético",
          "logicalType": "integer",
          "nullable": false,
          "classification": "livre"
        }
      ]
    }
  ],
  "relationships": [],
  "examples": [
    {
      "id": "orders-after-id",
      "purpose": "Pedidos após identificador",
      "explanation": "Filtra pelo parâmetro e ordena pela chave",
      "state": "approved",
      "variants": [
        {
          "dialect": "postgres",
          "sql": "SELECT p.id FROM orders p WHERE p.id > :minimum ORDER BY p.id",
          "parameters": [
            {
              "name": "minimum",
              "type": "integer",
              "required": true,
              "meaning": "Identificador mínimo"
            }
          ]
        }
      ]
    }
  ],
  "rules": ["Dados sintéticos"]
}
```

## Inspeção e adoção inicial por consulta

`POST /api/admin/personas/:personaId/fontes/:sourceId/estrutura` recebe
`resources` (até 16 recursos únicos com schema/nome/tipo), `offset` e `pageSize`
(até quatro recursos por página). Firebird usa schema nulo; os demais motores
exigem schema explícito. A tool `inspecionar_estrutura` usa esses campos e
`fonteId`. Não aceita SQL, DSN, conexão ou credenciais do consumidor.

O hub encaminha `sql.describeSchema`, negociado por `sourceSchema` e
`sourceIdentity` v1. O agente executa consultas fixas aos catálogos próprios de
PostgreSQL, SQL Server, SQL Anywhere e Firebird, com nomes como parâmetros. Na
mesma conexão prova identidade antes/depois; retorna colunas/tipos/nulabilidade,
pares ordenados de PK/FK e apenas relacionamentos entre recursos autorizados do
escopo solicitado. Defaults, comentários e linhas de negócio não são retornados.
Os helpers genéricos da biblioteca ODBC não são usados para essa prova.

`metadataPage` pagina metadados, separadamente da paginação SQL. `coverage` e
`limitations` informam informação indisponível; falta de visibilidade não prova
inexistência. PKs, índices únicos simples não filtrados e FKs retornam estado
`enabled`, `disabled`, `unvalidated` ou `unknown`, com cobertura própria. A
inspeção não confirma significado. PostgreSQL verifica validade dos índices,
validação e triggers de FK; SQL Server verifica índices desabilitados e FKs não
confiáveis; Firebird verifica índices das constraints. Índices por expressão ou
parciais não comprovam unicidade global. SQL Anywhere observa as chaves, mas
mantém enforcement `unknown`: o indicador interno documentado pelo fabricante
não é prova contratada de validação. Essa limitação impede dependências executáveis
de constraints nesse motor; não impede consultas que dependam somente de colunas.
Os nulos obrigatórios são preservados pelo transporte.

No SQL Anywhere, tabelas BASE e views regulares VIEW são identificadas pelo
valor legível `SYSTAB.table_type_str`; materialized views não entram implicitamente
nessas categorias. Isso corrige a omissão de views regulares na inspeção, sem
habilitar constraints desconhecidas. O catálogo documenta a representação legível
na [referência SAP](https://help.sap.com/docs/SAP_SQL_Anywhere/93079d4ba8e44920ae63ffb4def91f5b/3beaaafb6c5f1014a708bc9a46535407.html).

A migration aditiva 0013 conserva a observação imutável, hash, fonte/versão,
credencial/versão, identidade e validade de 15 minutos. A auditoria guarda
somente o evento e referências. `POST .../compatibilidade` recebe `evidenceId`,
`catalogId` e `publicationId`: compara fatos com a versão concedida, sem
publicar ou conceder execução; retorna compatível, incompatível ou inconclusivo.

O treinamento de uma consulta pode selecionar explicitamente `sharedKnowledge`
com `catalogId`, `publicationId` e `evidenceId`. Preview e confirmação da skill
revalidam catálogo, publicação ativa, hash e evidência vigente da mesma fonte.
Fixam no snapshot o recorte de tabelas/colunas/relacionamentos usados, as regras,
hashes e expectativa estrutural. Significado, classificação e grão divergentes
exigem revisão; não há sobrescrita implícita. Regras compartilhadas devem ser
preservadas. Exemplos não são importados automaticamente; os exemplos explícitos
da skill continuam sujeitos ao seu contrato SQL.

A adoção de consultas aceita campos confirmados com finalidades locais explícitas
para pessoal/sensível, preservando a classificação compartilhada e a concessão
integral da publicação. [Campos e finalidades](source-queries.md#campos-e-finalidades).
Segredo/inferido não habilitam adoção. Tipos nativos e
nulabilidade precisam estar comprovados. Dependências de chaves declaradas ou
relacionamentos físicos ficam inconclusivas enquanto seu estado não for provado.
Metadados de outra página não são inferidos; o recorte deve caber numa evidência
individual ou explicitamente composta.

### Composição de páginas

`POST /api/admin/personas/:personaId/fontes/:sourceId/estrutura/compor` recebe
somente IDs de duas a dezesseis evidências imutáveis. MCP oferece
`compor_inspecoes_estrutura` com `fonteId` adicional, condicionado a `treinar`,
consentimento/delegação vigentes e fonte concedida. Nenhuma interface recebe
metadados fabricados pelo consumidor. Exemplo de corpo administrativo:

```json docs:structure-composition
{
  "evidenceIds": ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]
}
```

IDs são ilustrativos. As páginas precisam ter mesma persona, fonte, identidade
durável, versões de fonte/credencial, motor e escopo ordenado completo. Lacunas,
sobreposição, conteúdo conflitante ou composição aninhada produzem
`status: inconclusive`, sem gravar evidência combinada. Página ausente, expirada,
de outra fonte/persona ou obsoleta é recusada. Policy, vínculo, identidade e
`sourceSchema` v1 vigente são revalidados pelo hub antes da gravação; versões,
concessões e prazos locais são conferidos novamente dentro da transação MCP.
Rede permanece fora dessa transação, sem promessa de atomicidade distribuída.
Revalidar pode ler metadados fixos de identidade pelo hub/agente; não repete
a inspeção de esquema nem executa SQL de negócio.

Sucesso retorna `status: composed`, ID/hash próprios, até dezesseis recursos,
origem de cada página e a **menor validade** das páginas. A migration aditiva
0022 fixa linhagem por FKs de persona/fonte/versões/identidade/hashes e impede
mutação dos vínculos. A resposta composta é um envelope interno: o contrato RPC
do agente continua estrito, com até quatro recursos por página. Cobertura,
recusas e constraints desconhecidas permanecem intactas. `composed` não significa
compatível, executável ou semanticamente aprovado.

Cada página conserva seu horário; o horário geral é o da leitura mais recente,
sem representar snapshot simultâneo. Não se renova o prazo ao combinar páginas.
Compatibilidade, publicação de perfil e adoção por skill aceitam o ID composto,
mantendo suas verificações próprias e sem adotar versões automaticamente.

O MCP envia `expectedStructure` no SELECT; agente incompatível é recusado. A
mesma conexão confere as colunas e constraints usadas antes e depois da consulta, sem
reconexão/cache. Mudança em coluna não utilizada não faz parte dessa expectativa.
Drift comprovado descarta o resultado e suspende as publicações utilizadas;
cruzamentos dependentes ficam indisponíveis. Uma versão suspensa ou acesso
revogado ao catálogo bloqueia descoberta/chamada direta/envio/entrega, sem worker.
Atualizar padrão não altera a skill e novos contratos exigem concessão explícita.
`obter_skill` entrega o recorte adotado e sua proveniência, sem navegação irrestrita.
Consultas locais também retornam `provenance.sharedKnowledge` com catálogo,
publicação, hash e hash da evidência e, quando adotado, publicação/hash do perfil,
sem armazenar linhas de negócio no catálogo. Expectativas de constraints exigem
`sourceConstraints` v1 negociada; agentes antigos são recusados antes do dispatch.

## Perfis físicos publicados

Migrations aditivas 0014–0015 separam o identificador físico interno, que inclui
a origem do hub, do hash nativo comprovado pelo agente. Constraints do banco MCP
vinculam perfil, catálogo, padrão e par físico/nativo; não associam uma base apenas
pelo nome. Nenhum treinamento privado é promovido automaticamente.

API sob `/api/admin/personas/:personaId/fontes/:sourceId/perfis`, sempre com sessão
Client, Host/Origin e CSRF. Mutações exigem papel curador/administrador no catálogo e acesso
remoto vigente à fonte, verificado fora da transação MCP e revalidado localmente:

`GET` nesse prefixo exige catálogo concedido e acesso vigente à base, com
`catalogId` e `basePublicationId` na query. Retorna `drafts`, `publications`,
`nextDraftCursor` e `nextPublicationCursor`, até vinte itens de cada tipo por página,
ordenados por UUID decrescente. `beforeDraft` e `beforePublication` são cursores
independentes e precisam pertencer ao mesmo catálogo, par físico/nativo e padrão-base.
Leitores/colaboradores recebem somente publicações não suspensas, sem rascunhos;
curadores/administradores também recebem rascunhos e estados de suspensão.
Cursor de publicação oculta não amplia a visibilidade. Indisponibilidade remota
impede confirmar o acesso; não produz uma listagem autorizada presumida.

| POST         | Entrada e resultado                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `/salvar`    | `catalogId`, `basePublicationId`, `name`, `content`, `overrides`; edição inclui `id` e `expectedRevision`. Retorna rascunho CAS. |
| `/preview`   | `catalogId`, `profileId`, `evidenceId`; compara estrutura comprovada, retorna conteúdo/hash e confirmação de 15 minutos.         |
| `/publicar`  | Mesma entrada e `confirmationHash` do curador; consumo único transacional, snapshot imutável.                                    |
| `/suspender` | `catalogId`, `publicationId`; bloqueia dependentes imediatamente, sem apagar snapshots.                                          |

`content` contém a composição revisada completa. `overrides.tables` e
`overrides.relationships` identificam substituições de itens comuns: mudança sem
substituição explícita é recusada. Campos comuns e regras restritivas são preservados;
classificação não pode ser reduzida. Inspeção técnica não substitui revisão semântica.
Rascunho novo não modifica publicação adotada; mudar padrão-base exige novo perfil.

A skill adota `sharedKnowledge.profilePublicationId` opcional, junto ao padrão e
à evidência. Hash do perfil, base exata e identidade são conferidos na publicação;
catálogo e suspensões são revalidados antes de executar/entregar. Perfil de outra
base é recusado, mesmo se a estrutura parecer igual. Outras personas podem adotar
o mesmo perfil somente com catálogo concedido, prova da mesma base e nova publicação
da própria skill, sem compartilhar credenciais, resultados ou concessões.

`POST /api/admin/personas/:personaId/fontes/:sourceId/compatibilidade` aceita
`catalogId`, `publicationId`, `evidenceId`, `profilePublicationId` opcional e
`selectedTables [{ id, columns }]` opcional. Compara somente dependências
selecionadas do snapshot autorizado; campos desconhecidos são recusados. Chaves
que utilizam campos fora do recorte não habilitam nem bloqueiam essa consulta.
Relacionamentos entre tabelas selecionadas continuam exigindo seus pares completos.
Sem recorte, compara o conteúdo integral. Fonte, evidência, catálogo e perfil são
revalidados antes da entrega. `executionReady`, `semanticApproval` e
`automaticAdoption` permanecem falsos; publicação da skill faz a validação definitiva.

O [workspace de conhecimento da fonte](console.md#inspeção-compatibilidade-e-perfis-físicos)
orquestra a escolha da versão publicada, a inspeção da base, a conferência de
compatibilidade, a seleção de tabelas e campos para adoção explícita no rascunho,
o editor de perfil físico e os painéis de curadoria e calendário de revisão.
Nenhum padrão ou perfil é adotado automaticamente. A seleção não modifica
publicações ou concessões existentes.

## Curadoria e ferramentas MCP

A migration aditiva `0016_knowledge_curation.sql` acrescenta propostas explícitas
com payload/proveniência imutáveis e decisão terminal. Não promove treinamentos
privados existentes nem captura consultas, parâmetros ou resultados.

Uma proposta identifica catálogo, padrão e publicação-base exata; registra autor,
origem e, no MCP, persona/token/concessão/fonte/skill. `change` admite um item
tipado: `tabela`, `relacionamento`, `exemplo_sql` ou `regra`. A tabela inclui seus
campos; relacionamentos preservam todos os pares, cardinalidade e caminho N:N.
Propostas deste fluxo alteram o padrão-base, não particularidades físicas. Conteúdo
deve ser revisável, sem segredos/dados reais de clientes; variantes SQL passam por
validação SELECT/AST/fanout sem dispatch, inclusive quando candidatas.

Colaborador propõe e vê somente propostas de sua autoria; curador/administrador
vê a fila do catálogo e decide na sessão Client. Leitor não propõe nem lê a fila.
A lista retorna até vinte propostas por página, UUID decrescente, com `nextCursor`;
`beforeId` precisa pertencer ao mesmo catálogo e escopo de autoria.

| Método   | Caminho sob /api/admin/catalogos             | Contrato                                                      |
| -------- | -------------------------------------------- | ------------------------------------------------------------- |
| GET/POST | /:catalogId/propostas                        | Lista com beforeId / envia basePublicationId, summary, change |
| GET      | /:catalogId/propostas/:proposalId            | Payload e proveniência autorizados                            |
| POST     | /:catalogId/propostas/:proposalId/preview    | Objeto vazio; conteúdo resultante, diff, hash e prazo         |
| POST     | /:catalogId/propostas/:proposalId/incorporar | confirmationHash e reason; somente rascunho                   |
| POST     | /:catalogId/propostas/:proposalId/rejeitar   | expectedVersion e reason; preserva conteúdo                   |

Preview de quinze minutos fixa proposta/versão, revisão do rascunho, conteúdo/hash,
curador e versão de autorização do catálogo. Incorporação consome a revisão uma
vez, aplica CAS e registra a decisão na mesma transação. Mudança do item proposto
desde a publicação-base exige resolução explícita/nova proposta; mudanças em
outros itens podem compor uma nova revisão exata, nunca um preview obsoleto.
Revogação, suspensão da base, expiração ou revisão concorrente bloqueiam a ação.

`pending → incorporated|rejected` é terminal; payload/autoria não podem ser
reescritos. Justificativa integra o armazenamento editorial próprio, não logs ou
auditoria. Auditoria registra somente IDs, evento, autor e horário. Incorporar não
confirma fatos técnicos, aprova significado, publica, atualiza skills ou concede acesso.

Ferramentas autenticadas v2:

| Tool                                                          | Alcance e autoridade                                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listar_padroes({})`                                          | Somente padrões/perfis adotados por skills concedidas; catalogBrowsing=false                                                                          |
| `obter_padrao({skillId})`                                     | Snapshot recortado da skill, versões/hashes/proveniência; sem catálogo completo                                                                       |
| `propor_conhecimento({skillId, summary, change})`             | treinar + consentimento + delegação hub vigentes, skill de consulta publicada/concedida com padrão adotado e papel colaborador/curador do responsável |
| `obter_proposta_conhecimento({skillId, proposalId})`          | Estado somente da proposta deste token/skill sob a mesma autoridade atual                                                                             |
| `registrar_exemplo_sql({skillId, expectedRevision, example})` | treinar + consentimento/delegação e fonte concedida; adiciona candidato ao rascunho de consulta, sem executar SQL                                     |

Leitura não amplia visibilidade por conhecer IDs. Nova versão não aparece até
adoção/republicação/concessão aplicáveis. Propostas por token fixam a publicação-base
da skill concedida; não aceitam escolher um catálogo arbitrário. Publicar catálogo
e gerenciar seus membros continuam exclusivos do console autenticado.

Exemplos compartilhados usam `candidate`, `approved`, `inactive` ou `replaced`;
envio explícito sempre força `candidate`. Publicação do padrão recusa candidatos:
curador deve revisar e aprovar/inativar/substituir explicitamente. Rascunhos privados
aceitam o mesmo estado opcional; ausência preserva os contratos v2 existentes sem
reescrever seus hashes. Novos exemplos pelo MCP/console iniciam candidatos e a
publicação da consulta também os recusa até revisão. `obter_skill` entrega somente
aprovados (ou exemplos antigos sem estado), nunca inativos/substituídos/candidatos.
`sqlModel` e parâmetros não são substituídos ao registrar um exemplo. ID duplicado,
revisão obsoleta, SQL inválido ou fonte fora das concessões são recusados.

## Busca lexical e grafo concedidos

A migration aditiva 0017 acrescenta `publication_knowledge_index_v2`, projeção
derivada por persona, publicação/hash e versão do indexador, com FK composta para
o snapshot exato. Não altera publicações/hashes anteriores nem importa domínio
legado. A leitura autorizada reconstrói índices ausentes, de versão antiga ou
com hash de conteúdo divergente. Índices podem ser descartados sem perder
treinamento; não armazenam SQL, resultados, parâmetros fornecidos ou credenciais.
Revogação é conferida antes de acessar o índice e antes da entrega.
Busca/grafo adquirem os locks de leitura dos catálogos das dependências em ordem
estável, dentro da transação autorizada, antes de calcular correspondências.

`buscar_contexto({pergunta})` mantém busca lexical, até 64 termos distintos e
vinte skills, ordenadas por correspondência e slug. Inclui significado de tabelas/
campos, relacionamentos, regras, parâmetros e finalidade/explicação de exemplos
aprovados. Candidatos/inativos/substituídos e campos fora do recorte concedido não
entram no índice. Rascunho posterior não muda nomes ou conteúdo pesquisados.
Operações acrescentam somente campos usados nas capabilities de leitura/escrita
do contrato, não toda coluna declarada no treinamento; cruzamentos acrescentam sua
semântica publicada. Cada resultado inclui `items`, referências e proveniência
privada/padrão/perfil, `itemsComplete`; `complete` informa corte das vinte skills.
Texto SQL não é pesquisado nem devolvido pela busca. Termo sem correspondência
não prova ausência de dados ou capacidade; leia a skill antes de consultar.

`obter_grafo_conhecimento` recebe `skillId`, `pageSize` (padrão 50, teto 100),
`cursor` opcional e `tables [{ fonteId, table }]` opcional. Nome físico inclui
schema quando declarado. Filtro desconhecido, repetido ou não concedido é recusado
sem identificar recurso oculto. A resposta contém publicação/hash, `nodes`,
`edges`, escopo, `omittedRelationships` e `page` com returned/nextCursor/complete.

Nós identificam fonte/schema/tabela/coluna e significado/origem. Arestas preservam
todos os pares na ordem, JOIN/cardinalidade, opcionalidade declarada, intermediárias,
caminho N:N e estado declarado da constraint. Informação ausente permanece nula;
não é confirmada pela leitura. Caminho que dependa de item não exposto é omitido
e contabilizado, nunca completado por inferência. Em páginas parciais, arestas
podem referenciar nós em outras páginas; concluir paginação antes de interpretar
o grafo completo. Filtros reduzem somente o recorte já concedido.

Consultas usam a estrutura publicada e o perfil adotado. Grão que dependa de campo
fora do recorte não é exposto no grafo. Operações usam tabelas/colunas utilizadas
no contrato, sem inferir relacionamentos. Cruzamentos revalidam todas as
publicações locais e mantêm seus grafos distintos, inclusive quando descrevem
uma mesma tabela; não inventam relacionamentos físicos a partir da combinação.

Cursor cifrado vincula persona/token/concessão, versões, publicação/hash, filtros,
tamanho e posição. Não reserva autorização; expiração/revogação/suspensão e
republicação impedem sua continuação. `semanticApproval` e `executionAuthorized`
permanecem falsos: ler o grafo não aprova fatos ou libera JOIN/SQL. Os controles
do [console](console.md#exploração-do-conhecimento-concedido) usam o token do
consumidor e descartam respostas/contextos obsoletos.

## Curadoria de particularidades físicas

A migration aditiva 0018 mantém propostas físicas e previews em tabelas próprias,
sem reescrever propostas, hashes ou publicações anteriores. Cada proposta fixa
catálogo, perfil/publicação/hash, padrão-base/hash, identidade física interna e
nativa, fonte/versões, autoria e eventual token/concessão/skill. Constraints e
trigger preservam a origem e impedem decisões terminais reversíveis.

O console trabalha no perfil publicado selecionado de uma fonte. Colaboradores
propõem e leem somente suas propostas; curadores/administradores daquele catálogo
revisam a fila daquela base. Todas essas ações exigem acesso atual à mesma base,
com prova de identidade pelo hub/agente e revalidação Client/policy. Outro vínculo
da mesma base pode sustentar a revisão, mas descobrir identidade igual não concede
papel no catálogo. As versões da origem são históricas; a revisão vincula também
as versões atuais da fonte e credencial do curador. Chamadas remotas ficam fora
da transação MCP, sem promessa de atomicidade distribuída.

Ferramentas administrativas condicionais:

- `propor_particularidade_fisica({skillId, summary, change, overrideCommon?})`
  fixa o perfil adotado pela consulta publicada e concedida; exige `treinar`,
  consentimento/delegação vigentes, fonte concedida e papel colaborador/curador.
- `obter_proposta_particularidade({skillId, proposalId})` acompanha somente a
  proposta deste token/skill/persona sob a mesma autoridade atual.

Nenhuma tool aceita escolher um catálogo ou perfil arbitrário. Envio explícito
não captura consultas ou resultados e recusa segredos. Exemplos novos são sempre
candidatos; publicação de perfil também exige sua revisão editorial.

Rotas administrativas sob
`/api/admin/personas/:personaId/fontes/:sourceId/perfis/curadoria/:catalogId/:profilePublicationId/propostas`:
GET lista vinte itens, com `beforeId` e `nextCursor`; POST registra proposta com
`profilePublicationId`, `summary`, `change` e `overrideCommon` opcional. Os POSTs
`/:proposalId/preview`, `/incorporar` e `/rejeitar` utilizam sessão, Origin/CSRF e
revalidação do responsável. IDs conhecidos não contornam o escopo.

Preview devolve `profileRevision`, diff, conteúdo, substituições, hash e validade
de quinze minutos. Incorporar exige esse hash, justificativa e consumo único,
vinculados à proposta, rascunho CAS, curador, catálogo e fonte atuais. Alteração
do item desde a publicação-base exige resolução explícita e nova proposta;
mudança de outro item permite nova revisão exata. Substituição de definição comum
exige `overrideCommon` ou substituição já explícita no perfil, sem reduzir
classificação. Não há sobrescrita por ordem de documentos.

Incorporação atualiza somente o rascunho do perfil e termina a proposta na mesma
transação da auditoria de metadados. Não confirma estrutura/significado, publica,
adota versão ou amplia concessões. Rejeição exige `expectedVersion` e justificativa,
com CAS e autoridade atual, sem depender de preview aplicável: um conflito também
pode ser descartado, sem alterar o perfil. Conteúdo e justificativa ficam no
armazenamento editorial; auditoria não os copia. Suspensão, expiração e mudanças
relevantes impedem reutilização de previews.

## Feedback e revisão temporal

A migration aditiva 0019 separa conteúdo editorial, decisões de feedback e
calendários dos snapshots publicados. Não altera hashes nem inventa datas antigas.
Versão sem calendário aparece como **revisão não configurada**. Configurar uma
versão não configura versões posteriores.

`registrar_feedback_conhecimento({skillId, publicationId, itemId, type, content})`
aceita `erro`, `correcao` ou `lacuna`, com até 4.000 caracteres. Use a referência
dos itens autorizados de `buscar_contexto`; servidor confere publicação ativa
exata, item exposto e origem derivada. Leitura concedida permite relatar, sem
permissão administrativa: feedback não treina ou publica. Envio é explícito, sem
captura automática de SQL, perguntas, parâmetros ou resultados; use material
sintético sem segredos. Origem imutável fixa persona/token/concessão, skill,
publicação/hash, item, padrão/perfil aplicável, horário e hash editorial.

`obter_feedback_conhecimento({skillId, publicationId, feedbackId})` entrega estado,
versão e hash somente do feedback daquele token em item ainda concedido. Outra
publicação/consumidor, suspensão e revogação impedem acesso. Não abre a fila.

O responsável autenticado lista a fila em
`GET /api/admin/personas/:personaId/feedback-conhecimento`, vinte itens por página,
com `beforeId`/`nextCursor`. POST `/:feedbackId/decidir` recebe `expectedVersion`,
justificativa e `proposal: null | {id, kind: padrao|perfil}`. Decisão terminal
encerra ou encaminha por CAS. Encaminhar só vincula proposta explícita existente,
de autoria do responsável e da mesma publicação de origem, com papel vigente no
catálogo. Não cria/incorpora conteúdo. Feedback privado pode orientar edição
explícita, sem promoção automática. A fila histórica permanece com o responsável
quando o token autor perde acesso. Auditoria transacional guarda só metadados.

Calendários separados por tipo/publicação/hash usam estas rotas administrativas:

| Alvo          | Rota de revisão                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ |
| Padrão        | `/api/admin/catalogos/:catalogId/publicacoes/:publicationId/revisao`                       |
| Perfil físico | `/api/admin/personas/:personaId/fontes/:sourceId/perfis/:catalogId/:publicationId/revisao` |
| Skill privada | `/api/admin/personas/:personaId/skills/:skillId/publicacoes/:publicationId/revisao`        |

GET devolve estado, prazo, versão, tarefa e vinte decisões, com
`beforeVersion`/`nextVersion`. POST exige `expectedVersion` (zero inicialmente),
`dueAt` UTC futuro explícito, `decision: configurar|revisado` e justificativa.
Primeiro cadastro configura prazo; não registra revisão realizada. `revisado`
registra revisão humana e próximo prazo, sem aprovar significado ou republicar.
Histórico imutável registra autor, versão, decisão, justificativa e horário.

Padrões exigem curador/administrador no catálogo; perfis também exigem prova atual
da mesma base pelo hub/agente. Skills privadas usam o responsável autenticado.
Sessão, Origin/CSRF, CAS e revalidação continuam obrigatórios. Tokens não configuram
ou concluem revisões humanas.

`obter_revisoes_conhecimento({skillId})` mostra estado, prazo e versão da skill e
das origens expostas no snapshot concedido, sem autores/justificativas do catálogo.
Vencimento gera aviso/tarefa derivados do calendário persistente, sob demanda,
com `blocksExecution: false`. Não suspende, republica ou amplia concessões.
Revogação/incompatibilidade continuam bloqueando normalmente. Novas publicações
exigem prazo futuro vinculado à prévia; o worker separado cria tarefas e
notificações internas de forma persistente, sem duplicar por versão. Leitura é
reautorizada e não conclui revisão. [Contrato do worker](review-worker.md).

Exemplos sintéticos: substitua IDs pelos concedidos e escolha uma data futura
real. A data abaixo é somente ilustrativa, nunca preenchida como padrão.

```json docs:knowledge-feedback
{
  "skillId": "11111111-1111-4111-8111-111111111111",
  "publicationId": "22222222-2222-4222-8222-222222222222",
  "itemId": "skill",
  "type": "lacuna",
  "content": "Falta esclarecer o calendário comercial no treinamento sintético."
}
```

```json docs:knowledge-review
{
  "expectedVersion": 0,
  "dueAt": "2027-02-10T18:00:00.000Z",
  "decision": "configurar",
  "reason": "Prazo escolhido pelo curador para esta versão."
}
```

## Adoção por operações SQL

O [console](console.md#editor-de-skills-de-operação-sql) oferece edição visual de
relacionamentos e adoção explícita de padrão/perfil. Reutiliza endpoints e provas
existentes, sem migração ou novo portão de execução. A adoção só enriquece tabelas
e campos já declarados: mantém tipos, identidade, concorrência, chaves únicas,
escrita, parâmetros, etapas e limites. Recursos ausentes exigem edição explícita
do contrato. N:N conserva pares, IDs, intermediárias e elos; referências removidas
não são reparadas por inferência. Prova positiva não publica, executa ou amplia
tokens. O servidor continua conferindo apenas dependências efetivamente usadas
na publicação/execução, com identidade e estrutura na conexão executora.

### Prova de constraints SQL Anywhere 16

O agente comprova constraints locais declaradas no SQL Anywhere 16 usando views
públicas: `SYSCONSTRAINT`, `SYSIDX`, `SYSIDXCOL`, `SYSFKEY` e `SYSPHYSIDX`.
Exige tabela-base local, vínculo exato da constraint ao objeto e índice físico
correspondente. FK exige também constraint PK/UNIQUE e índice físico no pai.
Índices únicos comuns/virtuais não são promovidos a UNIQUE declarada; proxies,
temporárias, outras versões e prova incompleta não habilitam dependências.

Para FK, a própria consulta de metadados verifica `fire_triggers` e a propriedade
documentada `CommandLine`. `Off` ou `-gf` produz `disabled`; propriedade ausente
ou arquivo de opções `@` torna a prova `unknown`. A linha de comando permanece
no motor: somente o estado derivado é retornado. Não se usa `not_enforced`,
`VALIDATE`, inspeção de linhas ou tentativa de DML no runtime. As consultas
auxiliares continuam no orçamento vigente e na conexão executora.

A prova descreve a constraint e a configuração observadas, sem certificar todo
o histórico dos dados ou impedir alterações administrativas simultâneas. Novas
evidências exigem inspeção/publicação explícita; snapshots antigos permanecem
imutáveis. `unknown`, `disabled` e `unvalidated` continuam recusados. Ampliação
para outras versões ou tipos de índice depende de homologação específica.

Fundamento: [índices lógicos/físicos](https://help.sap.com/docs/SAP_SQL_Anywhere/e38b2f6217f24bdb90a3ff8ae57b1dd5/819066a26ce21014a2899cdf8e0a070a.html),
[associação física documentada](https://help.sap.com/docs/SAP_SQL_Anywhere/e38b2f6217f24bdb90a3ff8ae57b1dd5/81904b826ce21014889af106e5df616d.html),
[fire_triggers](https://infocenter.sybase.com/help/topic/com.sybase.help.sqlanywhere.12.0.1/dbadmin/fire-triggers-option.html)
e [CommandLine](https://infocenter.sybase.com/help/topic/com.sybase.help.sqlanywhere.12.0.1/dbadmin/server-properties-perfapp.html).
A implementação é limitada à versão 16 verificada em fixture, sem extrapolar
as referências gerais para habilitar outras versões automaticamente.

### Pacote e execução

O rascunho `operacao_sql` pode informar `sharedKnowledge` com `catalogId`,
`publicationId`, `evidenceId` e `profilePublicationId` opcional. Cada tabela
utilizada exige `grain` explícito e cada campo exige `classification: "livre"`.
Não se infere grão, significado, classificação ou tipo lógico dos metadados.
O contrato privado sem adoção continua separado; informar somente a referência
compartilhada não permite preparar ou executar um pacote não adotado.

Preview, publicação e runner compilam o mesmo pacote. Fixam hashes exatos do
padrão, perfil e evidência vigente, identidade física/nativa, campos e chaves
necessários. Significados, grão e regras precisam corresponder à versão adotada;
tipos lógicos devem corresponder aos parâmetros/colunas da operação. Perfil de
outra base, versão suspensa, associação revogada ou evidência obsoleta bloqueiam
a publicação. Atualizar um padrão/perfil não altera a operação ativa.

Operações aceitam `relationships` opcional, com o mesmo contrato de pares ordenados,
cardinalidade, significado, IDs e caminhos `via`/`path` das consultas. O pacote fixa
FKs na filha, inclusive na relação reversa 1:N, e prova de unicidade na filha em
1:1. Caminhos N:N preservam intermediárias e elos explícitos. Não autorizam JOIN
em DML nem escrita nas tabelas somente relacionadas. Pares duplicados, campos
ausentes e caminhos incompletos são recusados. Snapshots antigos permanecem
imutáveis; adoção exige nova publicação e concessões.

Dependências incluem tabelas efetivamente usadas por etapas, marcador e relacionamentos,
valores/WHERE/outputs/filtros adaptáveis, recortes, grão e identidade. Chaves
auxiliares de outputs SQL Anywhere são explícitas. Declarações sem uso e outras
chaves observadas ficam fora da prova. A identidade precisa de PK/UNIQUE publicada
e enforcement comprovado: `unknown` nunca habilita. SQL Anywhere 16 utiliza
a prova nativa limitada acima; casos fora desse alcance são recusados, sem fallback para
treinamento declarado ou mudança para operação privada automática.

O pacote exige novas capacidades `operation-knowledge:<hash>` e leitura das
dependências estruturais, concedidas explicitamente. `obter_skill` entrega o
recorte e proveniência do pacote autorizado. A preparação cifrada inclui
`expectedStructure` no fingerprint; aprovação humana vincula esse conteúdo e
não amplia autorização. Descoberta, preparação, aprovação, dispatch, commits
locais e entrega conferem catálogo/padrão/perfil vigentes.

O agente exige `sqlOperations.structureGuard:1`, identidade/estrutura e
constraints negociadas; verifica a estrutura na conexão executora antes de
BEGIN. Comandos auxiliares entram no teto de 32. Recusa comprovada
`SOURCE_STRUCTURE_MISMATCH` conserva o receipt e suspende somente a publicação
compartilhada utilizada. Não fabrica rollback nem autoriza repetição. A
conciliação por marcador fixa a prova pertinente à tabela lida na mesma conexão.

Runner sem guarda na conexão real da fixture não pode aprovar operação
compartilhada. A propriedade de adapter `supportsStructureGuard` não é entrada
do consumidor nem substitui essa execução. Matriz integral do runner genérico,
combinações relacionais adicionais de DML, matriz de perfis e aceite integral continuam
pendentes. [Contrato de operações](sql-operations.md).

### Comparação de versões físicas publicadas

POST `/api/admin/personas/:personaId/fontes/:sourceId/perfis/comparar` recebe
`catalogId`, `beforeId` e `afterId`. Com sessão Client e acesso remoto vigente,
compara snapshots imutáveis do mesmo perfil, catálogo e identidade física.
Confere hashes e disponibilidade das versões-base. Perfil suspenso permanece
identificado como suspenso; comparação não habilita seu uso. IDs inexistentes ou
de outra base não expõem conteúdo. Versões de perfis diferentes são recusadas.

Retorna versões/hashes e diferenças estruturadas por campo, usando IDs estáveis
de tabelas, relacionamentos e exemplos. O console apresenta nome/revisão e
diferenças das versões carregadas no histórico. Selecionar ou comparar não altera
rascunho, adoção, publicação ativa ou concessões. Troca de contexto/seleção
descarta resposta antiga. Não há data histórica inferida.

### Impacto de uma versão do padrão

GET `/api/admin/catalogos/:catalogId/publicacoes/:publicationId/impacto` exige
sessão Client e participação vigente no catálogo. Retorna dependências diretas
dos snapshots de consulta/operação e dependências transitivas das publicações,
somente nas personas do responsável autenticado. Ser curador ou administrador
do catálogo não revela personas de outros responsáveis, nem seus totais.
Paginação por `after` UUID, em ordem estável de publicação, até cinquenta itens.
`nextCursor` informa lista parcial; ausência de itens significa ausência de
dependências visíveis registradas, não ausência global de uso.

Nomes/revisões vêm do pacote publicado, com persona, fontes vinculadas e estados
locais ativo/histórico/suspenso. O mapa não confirma disponibilidade remota,
não reserva autorização nem altera adoção ou concessões. Console disponibiliza
essa leitura no histórico de versões do padrão.

GET `/api/admin/personas/:personaId/fontes/:sourceId/perfis/impacto` recebe
`catalogId`, `publicationId` do perfil e `after` opcional. Além da sessão e catálogo,
exige fonte ativa, acesso remoto vigente e identidade física/hash exatos do perfil.
Confere o padrão-base e filtra dependências pelo `profilePublicationId` publicado;
adotar apenas o padrão não conta como adotar a particularidade. Perfis suspensos
podem ter impacto histórico, sem reativação. Retorna apenas personas do responsável,
com a mesma paginação e estados locais. Console oferece a leitura no perfil
selecionado, antes da ação separada de suspensão. Nenhum SQL de negócio é enviado.
Ambas as leituras aceitam `table` (nome físico, opcionalmente `schema.tabela`) e
`column` opcional. Coluna exige tabela. O filtro usa apenas
`sharedKnowledge.expectedStructure.resources` e suas colunas, antes de expandir
dependentes transitivos e paginar. Não pesquisa textos, exemplos ou o conteúdo
integral do padrão. Nome sem schema exige schema nulo no snapshot, sem buscar
homônimos em outros schemas. Identificadores seguem a gramática física suportada
e correspondência exata; não há conversão por collation. Ausência de prova
estrutural antiga não é completada por inferência. O resultado é mapa de
dependências registradas, sem suspender skills ou confirmar execução.
Console descarta resultados ao alterar filtros; nova leitura revalida autoridade.

## Pendências da curadoria e execução compartilhada

O histórico do consumidor está disponível em `listar_historico_conhecimento`,
limitado a vínculos de versões do mesmo padrão adotadas por consultas ou operações SQL ativas
concedidas. Cada vínculo preserva sua fonte, publicação da skill e referências
de padrão/perfil. Não abre histórico integral, versões revogadas ou conteúdo.
Paginação, escopo e limites estão no [catálogo MCP](catalog.md). Comparação
editorial integral continua no console. `comparar_conhecimento({fromSkillId,toSkillId})` compara seções dos recortes adotados por duas skills de consulta ou operação SQL concedidas do mesmo padrão, na mesma transação autorizada, com referências exatas de fonte, publicação e perfil. As diferenças podem refletir recortes/perfis diferentes; não provam equivalência física ou mudança global do catálogo. Não adota, publica ou concede acesso. Comparação de consultas tem evidência OAuth na cadeia persistente dos três motores. Operações SQL têm evidências próprias Bearer e OAuth nos três motores, com consentimento e revogação. Comparação mista consulta/operação e paginação de 22 vínculos têm evidência Bearer nos três motores. OAuth misto, carga e matriz concorrente integral continuam pendentes. Outros tipos de skill e aceite operacional continuam pendentes; HTTPS/ChatGPT permanecem manuais.

Por OAuth, a leitura respeita fontes e skills consentidas, sem exigir `treinar`.
Conexões com as mesmas concessões podem ler os mesmos metadados publicados;
não se aplica o isolamento autoral das propostas editoriais. Revogar uma conexão
bloqueia sua leitura e continuação, preservando outras conexões. Revogar o token
originador bloqueia seus derivados.

Biblioteca editorial de templates/datasets e DDL estrutural estão disponíveis
no console, com versões imutáveis/cifradas, importação explícita de rascunhos e
proveniência sem autoridade herdada. Importação delegada limitada de versões
exatas também está disponível. [Contrato](knowledge-library.md). Gestão/leitura
delegadas gerais continuam limitadas às interfaces efetivamente disponíveis.
Runners genéricos de publicação estão implementados como CLIs de operador em
fixtures separadas; não são tools delegadas. Ver
[publicação genérica](homologation-chain.md#publicação-sql-genérica-em-fixtures-privadas).

Permanecem ampliação da prova SQL Anywhere além do alcance local da versão 16 e matriz adversarial completa de
constraints/relações/perfis, ampliação da adoção DML e histórico editorial ampliado de
perfis. Comparação de snapshots publicados está implementada; não representa
histórico de eventos que não foram registrados. Composição de páginas e adoção inicial de relações reversas/caminhos N:N
estão implementadas, sem encerrar essa matriz. Completar gestão/leitura delegadas
de templates/datasets,
homologação adversarial ampliada de grafo/busca, mapa de impacto e runners no
[trabalho restante](remaining-plan.md). A fila inicial e as tools acima não encerram esses itens.

O gate [shared-knowledge-and-compatibility](acceptance.md#shared-knowledge-and-compatibility)
permanece pendente. Todos os demais gates de release permanecem bloqueados.

Referências técnicas: [PostgreSQL 17](https://www.postgresql.org/docs/17/catalog-pg-constraint.html),
[SQL Server](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-foreign-keys-transact-sql?view=sql-server-ver16),
[Firebird](https://www.firebirdsql.org/docs/chunk/en/refdocs/fblangref50/fblangref-appx04-relconstr.html)
e [SYSIDX do SQL Anywhere](https://help.sap.com/docs/SAP_SQL_Anywhere/e38b2f6217f24bdb90a3ff8ae57b1dd5/3be8d99a6c5f10149158a1c4b55629f2.html?version=17.0).
