# Cruzamentos publicados — desenvolvimento

A entrada `dev:persona-v2` disponibiliza `validar_cruzamento` e
`executar_cruzamento`. Deploy, imagem e aceite integral permanecem bloqueados.
O MCP combina resultados de SELECTs; a IA do cliente prepara SQL e parâmetros.
Não há scripts, escrita distribuída ou snapshot transacional entre fontes.
Inteiros numéricos fora do intervalo seguro de JavaScript são recusados na
entrada local, antes de consultar a próxima fonte ou combinar registros.
Identificadores grandes devem chegar como texto exato, conforme SQL treinado
e compatibilidade dos dois lados; não são convertidos silenciosamente.
Converter um número já arredondado em texto não recupera sua precisão.
O prazo global é conferido também após a revalidação de autoridade e antes
de cada envio local. Se essa revalidação consumir o orçamento restante,
nenhuma consulta seguinte é enviada, mesmo se o callback do timer ainda estiver
na fila. Isso não promete cancelar SQL que já tenha chegado ao agente.

## Autoridade e publicação

Primeiro publique skills de consulta em cada fonte. Depois crie uma skill
`kind: cruzamento`, vinculada aos IDs **exatos das publicações** de consulta da
mesma persona. A compilação recusa dependência suspensa, substituída, de outra
persona, com fonte/credencial alterada ou hash inválido.

O pacote `persona-federation-v2` fixa etapas, projeções locais, chaves, cardinalidade,
saída, limites, regras semânticas, hashes das dependências e base comum. Armazena
vínculos imutáveis em `publicacao_fonte` e `publicacao_dependencia`; as tabelas já
fazem parte das migrations `0001`/`0002`, que não foram alteradas nesta etapa.

Exemplo de `training` após publicar consultas nas duas fontes (substitua IDs):

```json docs:federation-training
{
  "purpose": "Comparar pedidos de duas bases com IDs compartilhados",
  "semantics": {
    "matching": "Igualdade exata do ID compartilhado",
    "normalization": "IDs inteiros, sem conversão implícita",
    "missing": "Preservar pedidos da primeira base com null na segunda",
    "duplicates": "Uma linha por ID em cada fonte; recusar duplicidade",
    "units": "Valores monetários",
    "currency": "BRL nas duas fontes; sem conversão",
    "calendar": "Mesmo calendário comercial"
  },
  "steps": [
    {
      "kind": "local",
      "id": "a",
      "sourceId": "11111111-1111-4111-8111-111111111111",
      "publicationId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "columns": ["id", "amount"]
    },
    {
      "kind": "local",
      "id": "b",
      "sourceId": "22222222-2222-4222-8222-222222222222",
      "publicationId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "columns": ["id", "amount"]
    },
    {
      "kind": "join",
      "id": "combined",
      "left": "a",
      "right": "b",
      "join": "left",
      "keys": [{ "left": "id", "right": "id" }],
      "cardinality": "one_to_one",
      "columns": [
        { "side": "left", "column": "id", "as": "id" },
        { "side": "left", "column": "amount", "as": "amount_a" },
        { "side": "right", "column": "amount", "as": "amount_b" }
      ]
    }
  ],
  "output": "combined",
  "budget": {}
}
```

O token precisa de concessão para a skill de cruzamento e sua capability
`federation-contract:<hash>`, para **cada skill de consulta dependente** e suas
capabilities, e para todas as fontes. Listagem, leitura, resource e chamada direta
usam esse controle. Nova skill ou contrato alterado não amplia tokens existentes.

Republicar uma dependência torna indisponíveis somente os cruzamentos que a fixam,
mesmo que o novo pacote tenha o mesmo conteúdo. Atualize seus rascunhos para o novo
ID, execute novamente os casos e publique. Edição de rascunho mantém o pacote ativo.

## Casos obrigatórios e runner

Cruzamentos exigem casos obrigatórios aprovados. Um operador executa separadamente:

```sh
npm run persona:test-federation -- <personaId> <skillId>
```

O comando verifica a geração/migrations do banco MCP configurado em `DATABASE_URL`,
recusa produção e usa transação/lock da persona. Não cria migrations nem consulta
bases de negócio. Não existe endpoint MCP ou administrativo para marcar um
relatório como aprovado. Configure as credenciais do runner fora da conversa.

Cadastre casos pela rota administrativa `/:skillId/casos`, com `required: true`.
`content` contém `name`, `input: {plan, fixtures}` e `expected`. O `plan` segue o
contrato abaixo; seu `publicationId` pode ser um UUID de fixture antes da primeira
publicação. Cada fixture corresponde exatamente a uma etapa local:

```json
{
  "stepId": "a",
  "columns": ["id", "amount"],
  "rows": [{ "id": 1, "amount": "10.25" }],
  "truncated": false
}
```

`expected` é `{rows, columns, totalRows}` ou `{errorCode}` para erros esperados
`INVALID_PLAN`, `INCOMPLETE_INPUT` ou `BUDGET_EXCEEDED`. Inclua casos de ausência,
duplicidade/cardinalidade, nulos, filtros e incompletude conforme a especialidade.
Fixtures faltantes, repetidas ou projeções divergentes reprovam o caso.

O runner reaproveita o preflight real de SELECT com um gateway vazio em memória:
verifica SQL, parâmetros, recortes e projeção sem despachar ao hub. Depois executa
a combinação tipada com fixtures e compara o resultado esperado. **Isso não
homologa SQL em motores reais, não comprova correspondência de negócio nas bases
e não avalia a IA.** Os resultados esperados precisam de curadoria responsável.
Relatórios guardam somente IDs/resultados booleanos e hashes; revisão, pacote ou
casos alterados exigem nova execução antes do preview/publicação.

## Contrato MCP

Ambas as tools recebem `{plan, budget?}`. `plan` contém:

- `publicationId`: publicação ativa de cruzamento.
- `steps`: mesmas identidades, ordem, fontes/publicações e combinações publicadas.
  Cada etapa `local` substitui `columns` por `sql` e `params` separados.
- `output`: saída publicada.
- `page` e `pageSize`: paginação final, obrigatórios.

Exemplo de etapa local enviada pela IA:

```json docs:federation-local
{
  "kind": "local",
  "id": "a",
  "sourceId": "11111111-1111-4111-8111-111111111111",
  "publicationId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "sql": "SELECT p.id,p.amount FROM orders p WHERE p.id > :minimum ORDER BY p.id",
  "params": { "minimum": 0 }
}
```

SQL pode adaptar filtros e agregações dentro do pacote da dependência, preservando
a projeção local declarada. Alterar combinação, chaves, cardinalidade, saída ou
dependências exige novo treinamento/publicação. Projeção divergente é recusada
antes do dispatch, inclusive na validação. Cada consulta conserva dialeto, policy,
recortes físicos e permissões; não há união de pacotes entre fontes.

`validar_cruzamento` executa somente envelopes vazios de SQL local e verifica a
estrutura da combinação. Retorna `valid: true`, `semanticApproval: false` e
proveniência, sem dados. Não executa os casos obrigatórios nem aprova semântica,
cardinalidade de dados reais ou completude de uma execução futura.

`executar_cruzamento` devolve `rows`, `columns`, `totalRows`, `complete: true`,
paginação final, ID/hash do cruzamento e proveniência por leitura com fonte,
publicação/hash e horário. `totalRows` conta a saída combinada antes da paginação.
As fontes são lidas em horários independentes; não há garantia de consistência
temporal distribuída.

## Combinação, limites e entrega

Operações suportadas: `inner/left join` por igualdade de chaves simples/compostas,
`union` compatível (preserva duplicatas), projeção, agregação `count/sum/min/max`
e ordenação. JOIN exige cardinalidade `one_to_one`, `many_to_one` ou `one_to_many`;
muitos-para-muitos não é aceito. Chaves são tipadas; null nunca corresponde a null.
Não há coerção ou normalização implícita. Treine normalização no SQL local.
Decimais monetários devem chegar como strings exatas; não usar floats imprecisos.

| Limite                        | Teto da plataforma                             |
| ----------------------------- | ---------------------------------------------- |
| Fontes                        | 4                                              |
| Etapas                        | 8                                              |
| Consultas simultâneas         | Até 2; implementação atual executa uma por vez |
| Linhas acumuladas por fonte   | 5.000                                          |
| Linhas intermediárias retidas | 10.000                                         |
| Memória intermediária retida  | 16 MiB                                         |
| Prazo total                   | 60 segundos, incluindo autorização             |

Skill (`training.budget`), token (`permissions.federationLimits`), eventual concessão
e requisição (`budget`) só reduzem esses tetos. Delegação não pode removê-los ou
ampliá-los. Limites têm chaves `sources`, `steps`, `concurrency`, `rowsPerSource`,
`intermediateRows`, `intermediateBytes` e `timeoutMs`.

Entrada truncada, paginada, com LIMIT/TOP ou sem confirmação de completude é
recusada com `INCOMPLETE_INPUT`; não se apresenta soma parcial como total. Exceder
limites/tempo produz `BUDGET_EXCEEDED`. Consultas já enviadas podem terminar no
motor; abortar o plano não promete cancelamento físico do SELECT.

Antes de cada dispatch e da entrega, verificam-se cruzamento, todas as publicações,
token/concessão, fonte/credencial e portões do hub. Leases das fontes já lidas são
revalidadas novamente antes da entrega; mudança de policy bloqueia o resultado.
Não há cache, anexos ou retry automático. Auditoria guarda apenas IDs, contagens,
duração e número de etapas; SQL, parâmetros e resultados não entram em logs.

O aceite continua condicionado a testes reais nos três motores vigentes, console,
operações SQL, integrações, OAuth e corte coordenado. [Evidências](validation.md).

A [cadeia real isolada](homologation-chain.md) cobre cruzamentos publicados de
PostgreSQL com SQL Server, SQL Anywhere e Firebird, proveniência e concessões de
todas as dependências. Cardinalidades/unidades adversariais, revogação em trânsito,
truncamento distribuído e avaliação da IA ainda exigem aceite específico.

## Tetos por concessão

Além do orçamento publicado e do limite global `federationLimits`, a concessão
`skills[].federationLimits` e seu consentimento OAuth podem reduzir todos os
tetos. Prevalece o menor valor; delegação não pode ampliá-lo. Cada consulta local
também aplica seus limites publicados e concedidos de linhas, bytes, prazo e
paginação. Um teto local não torna uma entrada truncada completa nem amplia o
orçamento global. [Contrato local](source-queries.md#limites-redutíveis).

## Editor e casos administrativos

O [editor de cruzamentos](console.md#editor-de-skills-de-cruzamento) usa os
schemas estritos de treinamento/plano/casos em `src/domain/persona-v2/federation-training.ts`.
Compiladores e runners os reutilizam; a extração não altera os snapshots existentes.
Não há nova migration: casos e relatórios usam as tabelas v2 existentes.

`GET /api/admin/personas/:personaId/skills/:skillId/testes-cruzamento` retorna
revisão, hashes atuais, casos, aprovação obrigatória e até vinte relatórios.
`after` é UUID, com cursor restrito à mesma persona/skill. Dependência obsoleta
produz pacote não comprovado e relatórios sem aprovação atual, preservando a edição.
Não retorna payload de execução ou evidência privada do runner.

`POST .../:skillId/casos-cruzamento` recebe `expectedRevision`, `required`,
`content` e, para edição/remoção, `id` e `remove`. O formato sintético e o formato
`federationPublicationCaseSchema` do runner de transporte são aceitos sem conversão.
Validação estrita recusa flags de aprovação. CAS incrementa revisão e registra
somente metadados na mesma transação; referências de outra persona são recusadas.
Os serviços reaproveitam autoridade administrativa e visibilidade da skill.
Sessão Client, CSRF e Origin permanecem obrigatórios nas rotas do console.

Esses endpoints não executam casos, não gravam relatórios e não publicam.
Preview/publicação continuam nos serviços de catálogo vigentes, fixando conteúdo,
autoridade, prazo e dependências. Relatório antigo, incompatível ou reprovado não
habilita publicação; nova concessão aos tokens é ação separada.
