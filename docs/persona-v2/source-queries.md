# Consultas por fonte — contrato implementado

Paginação gerenciada exige nomes ou aliases simples projetados no `ORDER BY`.
Prefira aliases sem prefixo de tabela, especialmente em agregações, DISTINCT e
CTEs. Expressões, posições numéricas e NULLS FIRST/LAST são recusados antes da
autorização remota. Ordenação qualificada só é admitida com projeção simples e
correspondência única. Sem paginação, essas restrições adicionais não se aplicam.
O MCP não reescreve SQL nem repete chamadas; o consumidor revisa explicitamente
a consulta. O schema e os guias descrevem o mesmo contrato.

`obter_capacidades` descreve a composição do endpoint atual. `authentication`
é `bearer` em `/mcp` ou `oauth2` em `/mcp/chatgpt`; `oauth` é falso no endpoint
manual e informa scope/limitação pelo originador no endpoint OAuth. Isso não
declara que o OAuth está indisponível em outro endpoint do mesmo servidor.
`externalQueries` e `externalActions` são falsos quando os respectivos serviços
não estão ligados; quando presentes, anunciam requisitos de publicação, concessão,
preparação e ausência de replay automático. Nenhum anúncio amplia autoridade.
`complete` e os indicadores de aceite permanecem falsos nesta etapa.

Disponível no `/mcp` da entrada **de desenvolvimento** persona-v2. A aplicação
principal ainda é legada. Deploy e publicação da imagem continuam bloqueados;
este contrato não constitui aceite integral dos três motores.

## Interfaces

O [recorte de views regulares](validation/2026-10-23-native-view-chain.md) foi
executado pela cadeia persistente nos três motores: tipo explícito na publicação,
paginação e policy por recurso. Selecionar view no treinamento não concede leitura
técnica. A inspeção exige schema físico exato; na fixture SQL Anywhere o catálogo
retorna `DBA`. Resultado inconclusivo não é normalizado para habilitar o recurso.

| Tool                | Entrada                                                | Comportamento                                                                                 |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `consultar_dados`   | `fonteId?`, `skillIds?`, `sql?`, `params?`, `options?` | SELECT no pacote publicado e concedido de uma única fonte                                     |
| `validar_consulta`  | Mesma entrada                                          | Mesmo preflight; executa somente envelope vazio, sem aprovação semântica                      |
| `verificar_fonte`   | `fonteId`                                              | Credencial, vínculo, policy e prova física pelo agente; somente metadados, sem SQL de negócio |
| `obter_capacidades` | `{}`                                                   | Versão, limites, interfaces implementadas e pendências; não concede permissão                 |

Todas exigem Bearer de uma persona. `fonteId` pode ser omitido se as publicações
selecionadas determinarem uma única fonte. [Identidade física](source-identity.md)
é revalidada pelo hub/agente antes do dispatch e da entrega. MCP não abre conexão
com o banco de negócio. `verificar_fonte` retorna `sqlExecuted: false` e
`metadataSqlExecuted: true`; sucesso não concede licença de consulta. Com várias origens, retorna
`SOURCE_AMBIGUOUS`, sem escolher pela coincidência dos nomes das tabelas.
`skillIds` omitido seleciona as publicações visíveis dessa fonte. Sem `sql`, é
necessária uma única skill, cujo `sqlModel` será executado. SQL adaptado pode unir
pacotes apenas da mesma fonte e dialeto; grãos, tipos de recurso, classificações,
parâmetros e relacionamentos conflitantes são recusados.

```json docs:source-query
{
  "fonteId": "11111111-1111-4111-8111-111111111111",
  "skillIds": ["22222222-2222-4222-8222-222222222222"],
  "sql": "SELECT p.id, p.amount FROM orders p WHERE p.id > :minimum ORDER BY p.id",
  "params": { "minimum": 0 },
  "options": { "page": 1, "pageSize": 100, "maxRows": 100, "timeoutMs": 30000 }
}
```

`params` aceita valores escalares separados do SQL, com contrato publicado
`string`, `number`, `integer`, `decimal`, `boolean`, `date` ou `datetime`.
Parâmetros desconhecidos, extras ou incompatíveis são recusados. Arrays e
scripts não são aceitos. `tables[].resourceType` é `table` por padrão ou `view`
explicitamente; integra o contrato publicado e a verificação da policy.

## Portões e execução

1. Recarregar persona/token/concessão e publicações ativas em transação local com
   locks estáveis; conferir versões, hashes, fonte e credencial.
2. Validar toda a AST somente leitura, escopo, JOIN composto, fanout, recortes,
   projeção explícita, aliases únicos e finalidades por campo. Nunca usar grafo
   ou rascunho como autoridade. Consulte a matriz abaixo.
3. Fora da transação MCP, autenticar o **Client da credencial da fonte**, conferir
   ClientAgentAccess e policy completa, não revogada, compatível com o banco.
   Regras read deny prevalecem quando o escopo é por recurso; escopo global segue
   a semântica do agente e a distinção entre tabela/view.
4. Revalidar permissões locais e policy antes do dispatch. Encaminhar ao hub uma
   única execução com `agentId`, `client_token`, `database` explícito, SQL,
   parâmetros e `expectedSource`. Exigir `sourceIdentity` v1 negociado: o agente
   confere a prova admitida na própria conexão antes do SELECT e da entrega:
   nativa ou, somente no SQL Anywhere, UUID provisionado conforme DV2-007.
   [Contrato da conexão](source-identity.md#prova-na-própria-conexão-executora).
   O hub não interpreta SQL nem reescreve dialetos. Não há retry.
5. Conferir projeção, tipos, quantidade de linhas e bytes retornados. Revalidar
   credencial, ClientAgentAccess, policy, token e publicações antes da entrega.
   Registrar apenas IDs, evento, duração e contagem em auditoria transacional.

JWTs ficam somente em memória, isolados por persona/credencial/versão. Nenhum
resultado usa o cache legado. A operação inteira tem prazo máximo de 60 segundos;
o consumidor pode reduzi-lo. Timeout encerra a espera e impede entrega tardia;
não promete cancelar trabalho que já chegou ao agente.

[Cache e singleflight v2](query-cache.md) podem ser habilitados explicitamente
para consultas locais elegíveis, com isolamento, cifras e revalidação de cada
consumidor. `reuse.kind` informa reuso sem alterar o horário original. Guardas
estruturais, validação e cruzamentos continuam executando o caminho completo.

Limites: 5.000 linhas, 16 MiB por resposta, SQL de 30.000 caracteres. Paginação
exige `page` e `pageSize`, ORDER BY e ausência de TOP/LIMIT/FIRST. Filtros e
agregações acontecem no banco. `completeness` indica truncamento e se o resultado
é completo; páginas e limites explícitos não equivalem ao total. Ausência de
informação explícita de truncamento também impede afirmar completude, mesmo
quando vierem poucas linhas. O agente informa `truncated:false` nas respostas
materializadas verificadas (inclusive em chunks) quando completas, preservando
truncamento anterior. O MCP não preenche esse campo por inferência. `provenance`
inclui fonte, dialeto, horário de leitura e IDs/hashes das publicações utilizadas.

`validar_consulta` aplica os mesmos portões e só executa um envelope vazio:
`SELECT * FROM (...) AS _validacao WHERE FALSE` no PostgreSQL; nos outros dialetos,
usa `WHERE 1 = 0`. Firebird não é suportado na v2.
Exige resposta sem linhas. Retorna `valid: true` e
`semanticApproval: false`; não captura aprendizado nem aprova treinamento.

Relacionamentos com intermediárias N:N conservam IDs e caminho no contrato
publicado. A AST pode usar somente os elos diretos treinados, nunca um atalho
entre as extremidades conceituais. Adoção compartilhada verifica FKs na tabela
filha mesmo em navegação reversa `1:N`; prova insuficiente impede a publicação.
[Direção, unicidade e limites](shared-knowledge.md#relacionamentos-reversos-e-caminhos-executáveis).

## Campos e finalidades

`columns[].uses` no treinamento de consulta delimita cada campo:

| Uso           | Comportamento                                                    |
| ------------- | ---------------------------------------------------------------- |
| `projecao`    | Exibir a coluna ou utilizá-la numa expressão de saída            |
| `filtro`      | WHERE, HAVING e condições de CASE                                |
| `join`        | Condições ON e chaves das combinações multifonte                 |
| `agrupamento` | GROUP BY, entradas de agregação, DISTINCT e partições de janela  |
| `ordenacao`   | ORDER BY local/de janela e ordenação multifonte                  |
| `exportacao`  | Exportar com contrato próprio JSON/binário publicado e concedido |

Campos `pessoal` e `sensivel` precisam de `uses` explícitos não vazios e
`usePurpose` revisado. Sem isso ficam fora do escopo executável. `segredo` e
`inferido` nunca recebem finalidades executáveis. `livre` sem `uses` conserva
os usos de consulta anteriores, sem exportação; também pode ser restringido.
Dados pessoais/sensíveis autorizados para projeção são entregues ao consumidor
concedido, sem mascaramento implícito. Não conceda projeção esperando anonimização.

Exemplo de campo usado somente para filtrar, sem aparecer nas linhas:

```json
{
  "table": "orders",
  "name": "amount",
  "meaning": "Valor sintético",
  "classification": "pessoal",
  "uses": ["filtro"],
  "usePurpose": "Selecionar pedidos sintéticos autorizados"
}
```

Cada finalidade explícita gera uma capacidade
`field-use:<fonteId>:<schema.tabela.coluna>:<uso>`; nomes sem schema continuam
canônicos conforme o treinamento. A publicação fixa classificação, usos e
justificativa no hash `query-contract`. Token manual e consentimento OAuth
precisam cobrir **todo o conjunto exigido pela publicação**. Remover uma
finalidade bloqueia/oculta a skill inteira: esta entrega não oferece contextos
ou modelos parcialmente concedidos. Para consumidores com necessidades
diferentes, publique skills com recortes/finalidades distintos. Nova versão
exige concessão explícita; não amplia tokens anteriores.

A validação ocorre antes de autorizar transporte, tanto em `validar_consulta`
quanto em `consultar_dados`. União de pacotes recusa políticas de campo
conflitantes. Aliases, posições de ordenação, CTEs, derivadas, UNION e expressões
preservam a origem física. Cruzamentos conferem usos adicionais na linhagem das
saídas locais, incluindo renomeações. Contexto, busca e grafo usam o snapshot
integral concedido, sem navegação por recursos ocultos.

Limites conservadores: projeções internas também exigem `projecao`, mesmo quando
a consulta externa só filtra; CASE exige filtro e projeção dos campos da expressão.
Subconsultas escalares em projeções/filtros/ON/agrupamento/ordenação e janelas nomeadas
são recusadas quando há finalidades explícitas, pois a linhagem por uso ainda
não é comprovada nesses formatos. Aliases de saída continuam sujeitos à
gramática estrutural existente. Não há conversão silenciosa nem fallback.
DDL, scripts e construções não suportadas permanecem recusados.
HAVING/ORDER BY com agregados exigem também `agrupamento` para os argumentos.
Por conservação da linhagem, UNION sem ALL exige `agrupamento` de todos os
campos projetados; ordenar o conjunto UNION exige `ordenacao` de todos eles.

Adoção compartilhada de consultas conserva a classificação exata do padrão ou
perfil, acrescentando as finalidades no treinamento privado da skill. Padrão
não concede autorização. DML, datasets e exemplos estruturais compartilhados
continuam sujeitos aos seus contratos próprios; esta mudança não libera
campos pessoais/sensíveis para lançamentos. Exportação JSON exige contrato e concessão próprios, descritos em [anexos](attachments.md).
Não há migration: treinamento e capacidades usam os documentos v2 já
persistidos; snapshots aplicados permanecem imutáveis.

## Recortes físicos obrigatórios

Ao cadastrar a fonte pela API administrativa, configure `rowRestrictions`
(o console inicial ainda não tem editor de recortes):

```json docs:source-restrictions
[{ "table": "orders", "column": "company_id", "parameter": "__scope_company", "value": 7 }]
```

O SQL deve garantir `p.company_id = :__scope_company` em **cada ocorrência física**
da tabela, inclusive aliases repetidos, CTEs, subconsultas e ramos UNION. Em OR,
o predicado deve dominar ambos os caminhos. Filtro só na consulta externa não
substitui o recorte físico interno. Literal com o mesmo valor também não substitui
o binding controlado pelo servidor. A coluna deve estar classificada e publicada.

O servidor injeta o valor; o consumidor não pode fornecer parâmetros `__scope_`,
nem o treinamento declará-los como parâmetros editáveis. `obter_skill` informa
`requiredFilters` com tabela/coluna/parâmetro, sem os valores internos. Formato
arbitrário, recorte duplicado ou valores conflitantes para um binding recusam o
cadastro. Mudanças na configuração invalidam a dependência publicada e exigem
nova publicação e, quando o contrato muda, nova concessão.

## Limites deste contrato

Consultas que adotam uma versão compartilhada publicam referências e hashes
exatos, além da expectativa das colunas utilizadas. `expectedStructure` é gerado
pelo servidor e exige `sourceSchema` v1: confere estrutura na mesma conexão antes
e depois do SELECT. Revogação/suspensão da versão bloqueia uso; drift confirmado
descarta resultados e suspende os pacotes utilizados. Alterar padrão não atualiza
skills nem concessões. Alcance e pendências em [conhecimento](shared-knowledge.md).

PostgreSQL, SQL Server e SQL Anywhere usam o parser e a gramática restrita
existentes. Firebird não é suportado na v2.
Origens `schema.tabela AS alias` são aceitas no SELECT v2 dos três motores acima,
com partes simples em minúsculas e colunas por alias. O schema exato integra
allowlist e recortes; qualificação de três ou quatro partes é recusada. A policy
exige recurso exato e banco obrigatório. O cadastro está no [fluxo inicial](onboarding.md).
Consulta comum/JSON recusa coluna declarada binária e demais resultados com
metadados binários; objetos/arrays não são arquivos inferidos. [Anexos](attachments.md)
usam contrato JSON ou binário e consulta fresca explicitamente concedida. Binário
exige coluna física, metadados positivos e um registro completo; bytes somente
por leitura/download autorizado. Cache/singleflight estão em [desenvolvimento](query-cache.md); visão parcialmente concedida de uma skill permanece
no [trabalho restante](remaining-plan.md).

`test:persona-v2:postgres` executa SELECT em PostgreSQL descartável com hub
simulado. A [cadeia isolada](homologation-chain.md) acrescenta REST, Socket.IO e
ODBC nos três motores suportados, com limites de fixture. O aceite integral continua na
[matriz](acceptance.md).

## Limites redutíveis

`training.limits` publica limites opcionais de consulta. `permissions.queryLimits`
limita todo o token e `permissions.skills[].queryLimits` limita a concessão daquela
skill. OAuth conserva essas camadas e permite consentimento global mais restrito.
`options` pode reduzir novamente. Vale o menor teto entre plataforma, todas as
publicações selecionadas, token, concessões vigentes e requisição. Valores são
inteiros positivos; zero, fração e valores acima dos tetos de entrada são recusados.

| Campo       | Teto da plataforma | Aplicação                                                            |
| ----------- | ------------------ | -------------------------------------------------------------------- |
| `maxRows`   | 5.000              | Linhas retornadas pela consulta                                      |
| `pageSize`  | 5.000              | Também limitado por `maxRows`; exige `page` e `pageSize` juntos      |
| `maxBytes`  | 16 MiB             | JSON completo da resposta da tool, após materialização               |
| `timeoutMs` | 60.000             | Prazo contado desde o início da chamada local, incluindo autorização |

O resultado informa `limits` com os tetos efetivos. O transporte recebe somente
os limites de linhas, prazo e paginação já admitidos pelo contrato do hub.
`maxBytes` não é um limite nativo de memória do driver nem de tráfego entre agente
e hub: excesso descarta a resposta no MCP. O envelope HTTP/MCP fica fora dessa
contagem. Timeout impede SQL ainda não enviado e entrega tardia; não garante o
cancelamento de SQL já enviado. Limites do hub/agente continuam obrigatórios.

Paginação informa o tamanho efetivamente enviado. Divergência na paginação
retornada pelo transporte é recusada. Reduzir a página não prova o total.
No agente, ordenar por coluna qualificada exige projeção simples comprovada:
o wrapper usa o nome de saída, inclusive alias explícito, e o cursor procura esse
mesmo nome. Projeções qualificadas ambíguas ou não comprováveis são recusadas,
sem reescrita de SQL no MCP/hub.

Ausência dos campos preserva os tetos anteriores; snapshots antigos não são
reescritos. Alterar limite publicado altera o contrato/hash e exige republicação
e concessão compatível. Delegação compara os tetos efetivos por skill e nunca os
amplia. Revalidação antes do dispatch e da entrega impede usar orçamento antigo.
