# Tools MCP

Toda tool devolve JSON (`success` + payload ou `error`). A IA deve ler `error.hint` antes de improvisar.

A base de conhecimento deste `agentId` (fontes, anotações, relacionamentos, glossário, consultas aprovadas) evolui a cada turno útil: depois de uma resposta certa, `salvar_consulta`; depois de correção ou dicionário, `anotar_fonte`; depois de um join ensinado pelo usuário, `adicionar_relacionamento`. Não inventar significado.

## Onboarding

### `listar_ambientes`

Sem parâmetros. Lista ambientes da conta autenticada: `id`, `nomeAmigavel`, `agentId`, `dialeto`, `statusAcesso`, `hasClientToken`.

### `conectar_ambiente`

Parâmetros: `agentId` (uuid), `dialeto`, `nomeAmigavel`.

- Cria `ambiente` local.
- Chama `POST /api/v1/client/me/agents` no plug-server.
- Se faltar `agentId`, elicita um formulário explicando onde obter o UUID (admin Se7e / ERP).

### `configurar_client_token`

Parâmetros: `ambienteId`, `clientToken` (elicited se ausente).

- Criptografa e persiste.
- `PUT /api/v1/client/me/agents/{agentId}/client-token`.

### `verificar_status_ambiente`

Parâmetros: `ambienteId`.

- `GET /api/v1/client/me/agents/{agentId}`.
- Atualiza `status_acesso` e `hasClientToken`.
- Se pendente: hint para aguardar aprovação do dono do agente.
- Se o hub devolver 403, consulta `GET /api/v1/client/me/agent-access-requests` e mapeia `rejected`/`revoked`/`expired` para `statusAcesso=revoked`. `unknown` preserva o status local.

### `desconectar_ambiente`

Parâmetros: `ambienteId`.

- Confirme com o usuário antes de chamar (não há elicitation formal nesta fase).
- Tenta `PUT .../client-token` com `null` no hub (melhor esforço: falha do plug-server não impede a remoção local).
- Apaga o `ambiente` da conta. O `audit_log` permanece (`ambiente_id` vira null nas linhas antigas).

## Catálogo

### `listar_fontes`

Parâmetros: `ambienteId`. Retorna slug, nome, descrição curta e `origem` (`seed` | `minha`) das fontes ativas visíveis neste ambiente (seed global + as da conta neste `agentId`). Em conflito de slug, a da conta ganha. Se o assunto pedido não estiver na lista, o fluxo é `explorar_tabelas` → `descrever_tabela` → `testar_sql` (ler amostra e códigos) → `registrar_fonte`.

### `obter_fonte`

Parâmetros: `ambienteId`, `fonteId` (slug).

Retorna `sql_base` da variante do dialeto, colunas, relacionamentos (fonte ou tabela crua), regras `{ nome, descricao, expressao }`, sinônimos `{ termo, descricao }`, anotações deste `agentId` e `orientacoes_ia` (notas tipo `uso`/`preferencia` + dicas estáticas):

- Usar o SQL como subquery/CTE; acrescentar `WHERE` / `GROUP BY`.
- Totais: agregar no SQL (`SUM`/`COUNT`), não puxar todas as linhas.
- Listagens: `options.page` + `page_size` e `ORDER BY` explícito.
- Dicas específicas do dialeto (`FIRST N`, `TOP`, `LIMIT`, funções de data).
- Respeitar dicionários em `regras` / `colunas[].regra` (ex. Status A=Aberto).

### `buscar_contexto`

Parâmetros: `ambienteId`, `pergunta`, `limite?` (default 10, teto 20).

Primeira tool numa pergunta de dados. Ranqueia fontes, anotações e consultas já aprovadas **só deste `agentId`**. Depois: `obter_fonte` nas candidatas. O modelo deve persistir o que o usuário ensinar neste turno (`anotar_fonte` / `salvar_consulta`) para a base evoluir.

### `anotar_fonte`

Parâmetros: `ambienteId`, `fonteId?` (slug; omitir = glossário daquele agente), `tipo?` (`uso|codigo|alerta|glossario|preferencia`), `titulo?`, `texto`.

- Texto vem do usuário, nunca inventado. Sem dry run no ERP. Use em todo turno em que o usuário ensinar regra, código ou filtro.
- Isolado por conta + `agentId`. A mesma conta em outro agente não vê a nota.

### `adicionar_relacionamento`

Parâmetros: `ambienteId`, `fonteId` (slug da origem), `relacionamento` com `tabelaDestino` ou `fonteDestinoSlug` (não os dois).

- Só em fonte `origem=minha`. Seed: `FONTE_READONLY` — registre uma sombra com `registrar_fonte`.
- `tabelaDestino` precisa ser identificador (`schema.tabela`); não concatene SQL.

### `remover_anotacao`

Parâmetros: `ambienteId`, `anotacaoId`. Confirme com o usuário.

### `listar_anotacoes`

Parâmetros: `ambienteId`, `fonteId?` (slug), `limite?` (default 50, teto 200).

Browse direto do glossário e das notas deste `agentId`, sem precisar de um texto de busca (diferente de `buscar_contexto`, que exige `pergunta` e ranqueia por relevância).

- Com `fonteId`: só as notas daquela fonte (não inclui o glossário). `fonteId` inexistente → `FONTE_NOT_FOUND`.
- Sem `fonteId`: tudo deste agente — glossário (`escopo: "agente"`, `fonte: null`) e notas de qualquer fonte (`escopo: "fonte"`, `fonte: <slug>`).
- Use antes de perguntar de novo ao usuário algo que ele já pode ter ensinado.

### `salvar_consulta`

Parâmetros: `ambienteId`, `pergunta`, `sql`, `fonteId?`, `observacao?`.

Só depois de o usuário confirmar a resposta. Grava pergunta + SQL (sem linhas de resultado) neste `agentId`. Reaparece em `buscar_contexto`.

### `explorar_tabelas`

Parâmetros: `ambienteId`, `filtro?`. Lista até 200 tabelas/views do catálogo de sistema. Use quando a consulta pedida não existe em `listar_fontes`. Se o `client_token` não autorizar o catálogo de sistema, peça os nomes ao usuário.

### `descrever_tabela`

Parâmetros: `ambienteId`, `tabela` (identificador, opcionalmente `schema.tabela`). Colunas, tipos e nulabilidade. O significado de negócio vem do usuário, não do tipo.

### `testar_sql`

Parâmetros: `ambienteId`, `sql`. Executa o SQL no ERP com até 20 linhas (`TESTAR_SQL_MAX_ROWS`).

- Exige `FROM` de tabela real (senão o agente recusa).
- Sucesso: `valido=true`, `estrutura` (nome, `tipoInferido`, `pareceCodigo`, valores vistos), `colunasCodigo`, `sampleRows` — mostre ao usuário.
- Se `colunasCodigo` listar um campo (ex. `Status=A`): pergunte o dicionário; não chute. Grave em `regraNegocio` / `regras`. Domínio incompleto → `SELECT DISTINCT` via `testar_sql`.
- Falha: o `error.hint` pede para ajustar o SQL e **não** chamar `registrar_fonte`.
- Não substitui `consultar_dados` (isso responde a pergunta de negócio).
- O dry run de `registrar_fonte` continua com `max_rows=1` (só confere colunas).

### `registrar_fonte`

Parâmetros: `ambienteId`, `slug`, `nome`, `descricao`, `sqlBase`, `colunas[]` (obrigatórios no caso de uso), mais `observacoesDialeto`, `regras`, `sinonimos`, `relacionamentos` opcionais.

- Dialeto sai do ambiente, nunca da IA.
- Dry run (`max_rows=1`) obrigatório; colunas declaradas precisam existir no resultado.
- Sem `confirmado=true` a tool não grava: devolve um resumo para mostrar ao usuário. Teste o SQL com `testar_sql` antes; códigos (Status etc.) vão em `colunas[].regraNegocio` ou `regras[]` com o dicionário **dito pelo usuário**.
- Slug já da conta neste agente → `FONTE_JA_EXISTE` (use `atualizar_fonte`). Slug só no seed → sombra permitida.

### `atualizar_fonte`

Mesmo contrato de `registrar_fonte` (substituição total + `confirmado=true`). Exige fonte `origem=minha`. Fonte só do seed → `FONTE_READONLY` (registre uma sombra). Chame `obter_fonte` e `testar_sql` se o SQL mudou.

### `remover_fonte`

Parâmetros: `ambienteId`, `slug`. Apaga fonte `origem=minha`. Confirme com o usuário. Se havia sombra, `seedVoltouAValer=true`.

## Consulta

### `consultar_dados`

Parâmetros: `ambienteId`, `sql`, `params?`, `options?` (`max_rows`, `page`, `page_size`, `timeout_ms`).

- Encaminha `sql.execute` com o `client_token` do ambiente (nunca exposto).
- Default `max_rows` = 500 (`QUERY_DEFAULT_MAX_ROWS`). Teto absoluto conservador: 5_000 (`QUERY_ABSOLUTE_MAX_ROWS`) — o MCP monta a resposta inteira em memória antes de devolver ao cliente, então o teto não deve depender só do limite do plug-server.
- `truncated: true` quando `rows.length === max_rows` aplicado.
- Sem checagem de verbo SQL no MCP.
- Depois da resposta: se o usuário confirmar, `salvar_consulta`; se ensinar regra, `anotar_fonte`; se ensinar join, `adicionar_relacionamento`.

A descrição da tool instrui a IA a preferir agregação, paginação e `params` nomeados, e a persistir o que o usuário ensinar neste `agentId`.
