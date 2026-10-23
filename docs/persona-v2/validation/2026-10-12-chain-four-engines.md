# Cadeia real isolada nos quatro motores

Rodada de 2026-10-12, Windows, nos checkouts locais ainda não publicados.
Os manifestos dos três projetos permanecem `ready:false`, `completedGates:[]`.
Esta evidência amplia a homologação, mas não conclui todos os casos da
[matriz de aceite](../acceptance.md) nem autoriza deploy.

## Ambiente e revisão

| Projeto | HEAD de referência                         |
| ------- | ------------------------------------------ |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` |
| Hub     | `0d2c6b488438a77be71b39e514cd06ab11fbb95e` |
| Agente  | `69513638f013039de3d93b34f17130b26ea6b38f` |

Todos continham alterações locais; HEAD sozinho não identifica a implementação
testada. Os hashes dos arquivos centrais estão abaixo. Runtime Node **24.21.0**,
TypeScript **7.0.2**, PostgreSQL de controle dedicado e credenciais sintéticas.

| Motor        | Versão      | Driver ODBC |
| ------------ | ----------- | ----------- |
| PostgreSQL   | 17.11       | 17.00.0010  |
| SQL Server   | 16.0.4236.2 | 18.06.0001  |
| SQL Anywhere | 16.0.0.2043 | 16.00.2043  |
| Firebird     | 5.0.4       | 02.00.0156  |

Containers, portas em loopback, DSN HKCU, engine SQL Anywhere e arquivo Firebird
foram criados exclusivamente para a rodada. SQL Anywhere recebeu marcador UUID
por provisionamento separado do operador na base nova, conforme DV2-007.
Nenhuma fonte cadastrada, credencial do usuário ou banco operacional foi usado.

## Cadeia exercitada

**15 testes passaram, sem skips**, incluindo a repetição após a última correção
do retorno de consultas. Usam composição MCP v2 sem overrides de gateway,
autorização ou transporte; HTTP/JWT/REST do hub; Socket.IO/RPC/policy do agente;
conexões ODBC reais; transações e journal SQLite durável.

- Persona inicialmente vazia recebe quatro fontes, com descoberta de motor e
  identidade. Consulta é treinada/publicada e o consumidor recebe concessões
  explícitas. SQL adaptado, resultado vazio e token restrito são verificados.
- Três cruzamentos combinam PostgreSQL com cada outro motor. Dependências
  publicadas, proveniência e recusa por concessão ausente são exercitadas.
- Nos quatro motores, casos obrigatórios executam na fixture vazia com rollback
  confirmado antes da publicação. Preparação, hash, aprovação Client e execução
  passam pelas interfaces reais. INSERT/UPDATE/DELETE encadeiam saídas tipadas;
  concorrência obsoleta produz rollback confirmado e preserva os dados originais.
- Aprovação ausente ou hash divergente, repetição, cancelamento anterior ao envio
  e token consumidor revogado após aprovação são recusados conforme contrato.
- Uma falha é injetada **após commit nativo bem-sucedido**. MCP e journal conservam
  `resultado_desconhecido` e contagem nula. Nova execução é recusada e a observação
  de metadados RPC comprova que não houve outro dispatch.
- Identidade divergente recusa uma consulta deliberadamente inválida antes do SQL
  de negócio. Revogação do token técnico do agente bloqueia a consulta no MCP.

O hub desta cadeia usa repositórios privados em memória; ClientAgentAccess é
semeado, com enforcement real nas rotas. Configuração e segredos do agente são
fronteiras de fixture; tokens e journal usam adapters Drift reais. O companion de
casos aceita apenas a tabela descartável fixa, não constitui runner genérico de
publicação para os quatro motores. Combinação é avaliada por runner sintético
separado; não é julgamento da IA sobre significado de negócio.

## Falhas encontradas e corrigidas

O schema de entrada `sql.execute` recusava `expectedSource` antes do handler,
impedindo consultas verificadas. A chave passou a ser aceita com validação estrita
do contrato v1; negociação, policy e prova na conexão continuam obrigatórias.

O agente omitia `truncated:false` em consultas verificadas completas, impedindo
cruzamentos que exigem prova explícita de completude. Respostas materializadas,
inclusive no transporte em chunks, agora informam o booleano nesses caminhos e
preservam truncamento verdadeiro informado upstream. Caminhos legados sem prova
mantêm a semântica opcional anterior.

Perfil remoto incompleto ou com tipos incorretos podia causar cast inválido no
callback Socket.IO. Agora retorna falha de validação tipada. A fixture também
passou a usar JWT de agent-login por agente, documentos distintos, inicialização
dos limiters antes de importar rotas e aliases SQL citados compatíveis com os
quatro motores; não houve relaxamento dos portões para fazer os testes passarem.

O primeiro removedor encontrou arquivos nativos somente leitura após remover
seus serviços. Foi corrigido para remover esses arquivos apenas dentro da raiz
absoluta validada e admitir recursos próprios já ausentes em limpeza parcial,
sem interpretar falha do Docker como ausência. A evidência da limpeza é registrada
ao final desta rodada.

O provisionador inicial também recriava a chave de exibição ODBC com `Force`,
apagando seus nomes de exibição preexistentes. A versão corrigida cria essa chave
somente quando ausente. As seis entradas foram reparadas a partir dos drivers
instalados e das subchaves DSN intactas, sem alterar parâmetros ou credenciais.

## Validações complementares

| Verificação                      | Resultado e alcance                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Matriz nativa dos quatro motores | 75 testes reais passaram, sem skips; executor, outputs, identidade, rollback e journal; não depende do transporte do hub                 |
| Regressões Dart afetadas         | 172 testes passaram, sem skips; schema RPC, mappers, streaming, dispatcher e perfil                                                      |
| Análise Dart                     | 13 arquivos de implementação, testes e companions sem diagnósticos após corrigir ordem de imports                                        |
| MCP `release:check`              | docs/training/lint/format/tipos/testes/build/frontend passaram; 1.119 backend passaram, 91 skips legados opcionais; 23 frontend passaram |
| Persona-v2 PostgreSQL            | 69 testes em cinco arquivos passaram, sem skips, com bancos descartáveis próprios                                                        |
| Hub                              | format/lint/tipos/contrato/build passaram; suíte completa: 2.160 passaram, 18 skips opcionais em ambiente memory com Redis desabilitado  |
| Migrations do hub                | 41 migrations aplicadas em banco PostgreSQL novo exclusivamente da fixture; não certifica bootstrap Prisma da cadeia acima               |
| Guards de publicação             | MCP, hub e agente recusaram publicação com exit 1 esperado; os três manifestos continuam bloqueados                                      |

As contagens se sobrepõem por responsabilidade e não devem ser somadas como uma
certificação única. Os skips opcionais da suíte geral não foram usados para
dispensar nenhum motor da matriz ou da cadeia. Chromium e avaliação da IA não
foram repetidos nesta rodada. Não havia app de depuração conectado ao DTD; nenhum
agente operacional foi iniciado para hot reload. Companions iniciaram processos
novos somente nas fixtures.

Reprodução: [procedimento e limites](../homologation-chain.md). Comandos principais:
`scripts/run-persona-chain-homologation.ps1`,
`scripts/run-four-engine-homologation.ps1`, `npm run release:check`,
`npm run test:persona-v2:postgres` e `npm test` no hub. Todos os runners de banco
receberam URLs/manifestos explícitos descartáveis, sem fallback operacional.

## Contratos e hashes

Hub: contrato aditivo **1.6.0**, base acima, SHA-256 do contrato
`8bf1a316f86241b5c234ccc853972897a265983840cc5b3b38a6c0ce102f94e0`;
snapshot/patch `4b246fc8a79eac0f2273eb9da2b1cf458cb2e6ec3ae46e6c81735a8c362b36fc`.
Snapshot não é commit upstream. Base comum v2 `persona-v2-source-identity-3`, hash
`b72e5744b95dc36011a1ba216507e1bc684ee75dcf5a86411a9a672e2ac16b33`.

| Arquivo local                                                                       | SHA-256                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| MCP `tests/homologation/persona-chain.test.ts`                                      | `70e10be69c541b02709b6fb532c3c3e0a05539816f3e32b543a8fe2c2a85e543` |
| MCP `scripts/homologation/chain-manifest.ts`                                        | `db927a8d5614dfa4bb379f54c9a85ee7bbf6c3ff5f178bda23c98e2905bfbfc3` |
| MCP `scripts/run-persona-chain-homologation.ps1`                                    | `c5ae3321891b0dde5c1b405c62c2bd1cd8c1e146c9f3065a7db3ca11cc7440cf` |
| MCP `scripts/new-persona-chain-fixture.ps1`                                         | `dceec2421481497c7c3f45796e5167b429ad4891ada573e143774cdf8d89075d` |
| MCP `scripts/remove-persona-chain-fixture.ps1`                                      | `de7c3d3c1f63a16da30ff87bfba43735d657a257bf6fcebc3a20585ebb2f6471` |
| Hub `tool/homologation/persona_chain_hub.cts`                                       | `99d3b9b61986d3535ea44ce702066a5a1e99ec3a7cf8eabefd026f109f99158a` |
| Agente `lib/infrastructure/validation/rpc_request_schema_sql_params_validator.dart` | `19aaf4a0b99733b274d1323b3a1adb40669e69d1eac0454541d4b6e55c08cf37` |
| Agente `lib/application/rpc/sql_execute_result_mapper.dart`                         | `5139a710b5e0900ef600c62842d0c535fe4bcd7e2a9d3fea7406d71766cba68a` |
| Agente `lib/application/rpc/sql_execute_handler.dart`                               | `90beac970c106eb04df0b30dddcc52cd4fc775c830051066b7ccb77683424ef7` |
| Agente `lib/application/rpc/sql_rpc_materialized_streaming_executor.dart`           | `561cfacf38c1daf0d058d6970b25019e255a007accd7787deae5e267a88fa592` |
| Agente `lib/domain/validation/agent_profile_schema.dart`                            | `b9f84bb43406bac2ddcf45e6a7f6e59f03256a09da889e228b368524847980fc` |
| Agente `tool/homologation/persona_chain_agent_test.dart`                            | `b861e7e870968905b27d85aed33dcaf8ac724d735f4028f12e035fed178bb785` |
| Agente `tool/homologation/persona_chain_cases.dart`                                 | `6ad9b7b3232a6dc4a2244ed74f99ee628a32f80c9c5d0eef0b9cf820a9e4eb4b` |
| Agente `tool/homologation/persona_chain_observer.dart`                              | `77f63b386ad1f44ce61cc40f43c9003560cce13aeeb376bf7370b0646daaab04` |
| Agente `tool/homologation/persona_chain_faults.dart`                                | `8f8d47b90a06a3a88066d68b1d45483f8e8c2eb248d6ad0a0d0315a40f199fd9` |

## Pendências preservadas

Continuam exigidos bootstrap persistente completo, vault desktop, aprovação
inicial dos vínculos, TLS público/Redis distribuído, quedas reais dos processos
durante commit, timeout tardio, tipos/triggers adicionais, mínimos privilégios de
todos os motores e runners genéricos de publicação. A falha após commit desta
rodada não representa queda real do processo. Restauração/reenrolamento DBA
precisa seguir o procedimento, sem promessa de detectar clones idênticos.

Retenção, demais jornadas do console, OAuth v2, adapters externos, avaliação da
IA e corte coordenado continuam na matriz. Nenhum gate integral foi marcado;
não houve commit, push, deploy ou mudança de banco operacional.

## Limpeza verificada

O ciclo completo do provisionador/removedor corrigido passou em novas fixtures.
Um ciclo adicional comprovou preservação das seis entradas ODBC reparadas.
Testes negativos recusaram raiz inválida e um container preexistente alheio,
antes de qualquer remoção. Sintaxe dos três scripts PowerShell foi validada.

Ao final foram removidos os containers, DSNs, processos, bancos/arquivos e
credenciais sintéticas temporárias desta rodada, inclusive restos da primeira
limpeza parcial. Containers preexistentes, os dois processos SQL Anywhere
anteriores e as configurações DSN permaneceram. O arquivo de análise preexistente
do workspace foi preservado; scripts exploratórios e ponteiros de fixture foram
removidos. Nenhum manifesto privado ou log com conteúdo foi anexado ao relatório.
