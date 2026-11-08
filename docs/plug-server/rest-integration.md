# Adapter REST neste MCP

> Este adapter descreve o runtime legado. Adapters v2 por credencial, prova nativa
> e operações: [identidade](../persona-v2/source-identity.md),
> [consultas](../persona-v2/source-queries.md) e [operações](../persona-v2/sql-operations.md).

Canal do MCP: **somente REST**. Contrato do hub: [communication.md](communication.md). Autenticação Client / aprovação / `client_token`: [auth.md](auth.md).

Fonte normativa no hub: `plug_server/docs/api/api_rest_bridge.md` e OpenAPI `GET /docs`. Base URL: `PLUG_SERVER_BASE_URL`. Prefixo: `/api/v1`.

## Endpoints que o adapter chama

| Método | Caminho                                                         | Port                                                                                                                                                            |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/client-auth/login`                                            | `login` via `UsuarioTokenManager`                                                                                                                               |
| POST   | `/client-auth/refresh`                                          | `refresh` via `UsuarioTokenManager`                                                                                                                             |
| POST   | `/client/me/agents`                                             | `requestAgentAccess`                                                                                                                                            |
| GET    | `/client/me/agents/{agentId}`                                   | `getAgentAccessStatus`                                                                                                                                          |
| GET    | `/client/me/agent-access-requests?search={agentId}&pageSize=20` | resolução de 403 (pending vs rejected/revoked)                                                                                                                  |
| PUT    | `/client/me/agents/{agentId}/client-token`                      | `putClientToken` após gravar o acesso e quando o hub passa a `approved`. Best-effort: falha não desfaz o cofre. O RPC ainda envia o token.                      |
| POST   | `/agents/commands` (`sql.execute`)                              | `executeSql` — sem página: `execution_mode: preserve`; com `page`+`page_size`: omite o campo (`managed`). Resultado normaliza `column_metadata` e `pagination`. |
| POST   | `/agents/commands` (`client_token.getPolicy`)                   | `getClientTokenPolicy` (cache por hash)                                                                                                                         |

O MCP não lê o `client_token` de volta do hub — a cópia cifrada no cofre é a autoridade.

Cada `sql.execute` usa `command.id` UUID novo (replay no hub ~2 min). HTTP 200 com `response.item.error` é falha (`mapPlugServerFailure`). Mapa RPC → `code`/`source`: [communication.md](communication.md) e [error-mapping.md](../mcp/error-mapping.md).

## Timeouts e keep-alive

### Orientação compartilhada de falhas

Prazos RPC/HTTP de espera são aceitos somente como milissegundos inteiros,
seguros e não negativos. `Retry-After` numérico usa segundos inteiros; datas
HTTP válidas e `reset_at` são convertidos para o tempo restante, com zero para
prazo vencido. Valor inválido permite consultar o próximo metadado válido;
não propaga NaN/Infinity. Timeout local não inventa espera de três segundos nem
autoriza retry: parar de aguardar não comprova cancelamento no banco.

Texto semelhante a SQL Server 1033/4104 não prevalece sobre código RPC conhecido
de autenticação, protocolo, rate limit ou infraestrutura, nem sobre falha HTTP.
A compatibilidade com erros SQL legados sem código continua restrita ao sucesso
HTTP do bridge. Erros de protocolo pedem revisão da requisição, sem retry automático.

Replay (`-32014`) não autoriza nova chamada ou troca de ID para contornar a
recusa. Diagnósticos v2 distinguem pool esgotado (`-32104`), falha de conexão
ao banco (`-32106`), configuração recusada (`-32108`), execução ausente
(`-32109`) e cancelamento (`-32110`), sem copiar texto remoto. Ausência e
cancelamento não comprovam rollback. Em dispatch de operação com resultado
incerto, a orientação de consultar o estado original prevalece sobre esses
diagnósticos; não reenviar o efeito.

O diagnóstico v2 conserva `details.httpStatus` observado, inclusive HTTP 200
com erro RPC. Somente inteiros entre 100 e 599 são aceitos no diagnóstico seguro.
Sem código RPC específico, 400 orienta revisão do contrato da requisição e 503
informa indisponibilidade sem atribuir causa ao agente, proxy ou fila.
O status não substitui o código RPC nem autoriza retry ou alteração de SQL.

Revisão da documentação local do hub (`docs/api/api_rest_bridge.md`, seções de
erros HTTP/RPC e Retry-After): HTTP 200 pode carregar erro RPC `-32013` com
`Retry-After`. Essa indicação upstream não autoriza retry automático pela IA
neste MCP. Um 404 do bridge não prova revogação; `agent_offline` exige evidência
explícita, e `isHubConnected=false` isolado não comprova agente offline.
401 do hub não identifica expiração OAuth do MCP. Preservar somente os campos
seguros entregues pela tool; `requestId` e `correlation_id` remotos não substituem
o `supportId` de atendimento. Não copiar `technical_message` remoto.
Sem evidência suficiente, informar causa indeterminada e encaminhar o supportId
disponível ao responsável. O pin do contrato permanece inalterado: consultar
documentação mais recente não incorpora novas capacidades nem certifica o hub.

Na v2, consultas propagam o cancelamento MCP e o orçamento total ao HTTP,
incluindo autenticação e revalidações. O limite menor é contado desde o início,
sem reiniciar o prazo por etapa. Cancelar remove pedidos ainda na fila; após
envio, interromper a espera HTTP não comprova cancelamento SQL no agente.

Cada pool/destino admite no máximo duas vezes seu número de sockets em pedidos
pendentes. Consultas com contexto de persona admitem até metade dos sockets
(mínimo um) por persona; chamadas sem esse contexto continuam sob o teto global.
Os limites são locais por processo, não uma quota distribuída nem autorização.
Saturação recusa antes do envio; conclusão ou cancelamento libera a admissão.
Pools de autenticação e SQL permanecem separados, sem retry ou fallback.

Falhas de transporte registram fase `queue`, `connection` ou `response` no stage
e motivo enumerado `capacity`, `timeout` ou `network`, correlacionados ao supportId.
A fase response inclui espera pelo hub/agente; não permite atribuir tempo ao
banco sem evidência remota. Nenhum URL, segredo, SQL ou parâmetro entra nesses campos.

O transporte compartilhado com a v2 limita cada resposta a 32 MiB no wire e
após descompressão. Gzip é descomprimido de forma assíncrona com teto de saída;
esse limite técnico não amplia o orçamento de bytes do consumidor. Resposta
HTTP bem-sucedida com JSON inválido, login sem token ou SQL sem coleção de
linhas é falha do hub, nunca consulta vazia ou pedido de reconexão. O erro
preserva a etapa e recebe supportId no fluxo MCP, sem incluir o corpo recebido.
Não há reenvio automático. Corpos inválidos em HTTP de erro preservam o status.

A composição v2 aplica `PLUG_SERVER_HTTP_TIMEOUT_MS` ao adapter. Consultas e
operações da mesma instância compartilham apenas o cache de JWT, isolado por
persona/credencial/versão. O cache dura no máximo cinco minutos, limitado por
`exp` menos cinco segundos; tokens opacos continuam limitados a trinta segundos.
O campo exp apenas reduz o cache, não comprova autoridade. Rotação/invalidação
descarta sessões e logins em voo. ClientAgentAccess, policy e identidade continuam
revalidados; compartilhar JWT não compartilha uma decisão de autorização.

Recusa explícita do JWT no hub descarta somente a sessão que usou aquele token.
Uma recusa tardia não descarta JWT mais novo; 403 de acesso/policy e falhas
temporárias não invalidam o cache. Não há login ou replay dentro da chamada
recusada: uma nova chamada explícita pode obter outra sessão.
Resposta de acesso exige identidade do agente solicitado e flags booleanas do
contrato; envelope vazio ou de outro agente nunca indica aprovação.

O prazo HTTP vale também durante espera na fila do pool e descompressão. Um
pedido expirado na fila devolve timeout imediatamente e não é enviado depois.
Delegações têm teto próprio de 16 KiB já na leitura/descompressão do transporte.
Somente 401/403 representam recusa; 429/5xx, falhas de rede e respostas inválidas
ficam como falha do hub, com mensagem fixa, etapa e supportId, sem indicar revogação
ou solicitar reconexão. Não há repetição automática das mutações de delegação.

Na resposta RPC normalizada, `type: single`, flags `success` e o ID exato do
comando devem ser coerentes. Resultados acompanhados de erro, IDs divergentes
e sucesso contraditório são recusados antes de entregar dados. Formatos antigos
de resultado já suportados continuam legíveis; um ID explícito nunca é ignorado.
Erros RPC nos envelopes compatíveis raiz/response/data preservam o mapeamento
de erro, em vez de serem normalizados como resultado. Não repetir o comando.

Content-Length acima do teto é recusado antes de baixar o corpo. Somente
identity e gzip/x-gzip são aceitos; compressão truncada ou não suportada é erro
de transporte, sem interpretar bytes como JSON válido. HEAD e status sem corpo
não tentam descompressão nem confundem tamanho do recurso com bytes recebidos.

Normalização de SELECT preserva `rows` explícito, inclusive vazio, sem substituí-lo
por `data`. O formato alternativo `data` continua aceito quando `rows` está ausente.
Colunas duplicadas/inválidas, células posicionais excedentes ou ausentes e linhas
que não são objetos/arrays são recusadas, sem descartar valores ou fabricar linhas.
Nomes como `__proto__` viram propriedades próprias, sem alterar o protótipo do objeto.
Paginação presente exige inteiros positivos seguros e flags booleanas coerentes
com a página; metadados inválidos não são omitidos para aparentar completude.
`truncated` explícito exige booleano; limites efetivos de linhas exigem inteiro
positivo seguro e concordância entre aliases/metadados. Ausência de evidência de
completude continua ausência, não é preenchida automaticamente.

O adapter não corta o HTTP em 35s quando a skill pede mais tempo. `PLUG_SERVER_HTTP_TIMEOUT_MS` (default 35s, **máx. 60s**) é o **piso** de login/refresh/`getPolicy` — não o teto de `sql.execute`. Em `sql.execute`:

- `options.timeout_ms` no agente: teto **300s** (`api_rest_bridge.md` / contrato do `plug_agente`).
- `timeoutMs` no envelope: wait do **bridge** (`max(body, timeout_ms + 5s)`, teto **360s`).
- `AbortSignal` HTTP: esse wait + 5s para baixar o JSON materializado. Sem isso o MCP abortava enquanto o hub ainda esperava o agente.

O cliente HTTP reusa TCP/TLS em **dois** `http(s).Agent`: login/refresh/`getPolicy` (até 4 sockets) e `sql.execute` (até 16), para SQL longo não esgotar o JWT. `keepAliveMsecs: 30000` é **probe TCP keepalive**, não idle de 30s: o socket fica até o peer fechar (`keepalive_timeout` do Nginx do hub). O `fetch` global do Node (undici) fecha idle em ~4s — intervalo típico entre tools MCP — e refazia handshake a cada query. Não há retry automático de SQL (não idempotente; 429 só devolve `retryAfterMs`). JWT vai no `Authorization: Bearer` de cada request; não há cookie jar.

A borda Nginx do hub (`proxy_read_timeout`, ex. **180s** no example de produção) ainda corta o POST de commands **antes** do abort MCP (~310s no teto da skill). Skills ~≥175s falham na borda (504/503) mesmo com wait+download corretos neste repo. Skill com `timeout_ms` **120s** passa (wait ~125s) se o `location` de `/api/v1/agents/commands` com esse timeout estiver deployado. O ajuste é no Nginx do hub, não neste MCP.

Batch JSON-RPC (`command: []`, máx. 32, mesmo `agentId`) e `sql.executeBatch` existem no hub/agente; o MCP **não** agrupa `getPolicy` + `sql.execute` porque a policy entra no cache key e no recorte fail-closed **antes** do SELECT. O adapter REST ainda envia um `command` por POST. `enriquecer=completo` dispara até 16 `sql.execute` com concorrência `PERFIL_SQL_CONCURRENCY` (4) — falha isolada vira aviso.

## `UsuarioTokenManager`

JWT do hub **por `usuarioId`**, só em memória — regras em [auth.md](auth.md). Restart reloga com e-mail/senha cifrados. Rode **1 instância**. Logs: só `accessTokenLen`, nunca o valor.

## Por que não Socket/relay

Cada tool MCP é um request isolado — o caso que o hub recomenda para REST. O bridge já materializa `stream_id`. Socket/relay de consumer (`/consumers`) está **fora de escopo** (não é fase seguinte).

### Timeout de inspeção estrutural

O HTTP 503 SERVICE_UNAVAILABLE com a mensagem fixa do bridge indicando espera
expirada pela resposta do agente é PLUG_SERVER_TIMEOUT, sem retry automático.
Outros 503 mantêm o diagnóstico de indisponibilidade. As etapas sql.describeSchema
e sql.describeSource são preservadas. Resposta inválida ou sem correlação no
agente pode causar esse timeout; não inferir revogação a partir dele.
