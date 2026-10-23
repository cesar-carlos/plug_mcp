# Constraints e perfis físicos — avanço parcial

Rodada de 2026-10-13, America/Cuiaba. Etapa 4 do [plano restante](../remaining-plan.md),
sem encerramento de gate, publicação de imagem ou deploy. A entrada principal
permanece legada; persona-v2 continua exclusiva de desenvolvimento.

## Candidato

Checkouts com alterações locais preservadas. Os [hashes de 78 arquivos centrais](2026-10-13-constraints-physical-profiles-files.json)
identificam o recorte validado, não o checkout completo nem um commit upstream.

| Projeto | HEAD de referência                         |
| ------- | ------------------------------------------ |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` |
| Hub     | `0d2c6b488438a77be71b39e514cd06ab11fbb95e` |
| Agente  | `570e797b728eafa1cdc950be5e446ab7dd1c497c` |

Contrato REST aditivo **1.12.0**, SHA-256
`45589c3da2f94639c097893abf73e91360f0cbe2a3c48399ee36444be39f1092`.
Patch de contratos contra o commit-base do hub:
`4a46ee3db954130fafa74736824678ed7e66efccf72928def5345d19f7122493`.
Node **24.21.0**, TypeScript **7.0.2** real. Nenhum commit, push ou publicação.

## Ambiente e resultados

Fixture final `se7e_persona_7e858d3b79c1_test`: PostgreSQL de controle MCP e
PostgreSQL/Prisma do hub separados, autenticação/aprovação ClientAgentAccess reais,
processos MCP/hub/agente independentes, configuração Drift, cofre Windows DPAPI
e journals SQLite exclusivos. SQL sempre por MCP → REST hub → Socket.IO agente
→ ODBC. Somente bancos, credenciais e dados sintéticos da fixture.

| Motor        | Versão observada               | Constraints executáveis neste recorte                                 |
| ------------ | ------------------------------ | --------------------------------------------------------------------- |
| PostgreSQL   | `17.0.11`                      | PK, índice único simples não parcial, FK composta validada            |
| SQL Server   | `16.00.4236`                   | PK, índice único não filtrado, FK composta habilitada/confiável       |
| SQL Anywhere | `16.00.0000`                   | Chaves observadas; enforcement desconhecido, dependências recusadas   |
| Firebird     | `06.03.1812 WI-V Firebird 5.0` | PK, índice único simples não parcial e FK composta com índices ativos |

Strings preservadas como recebidas, sem inferir patches. Drivers e SHA-256 no
inventário; os binários dedicados são os mesmos da rodada anterior. Redis reservado
não certifica infraestrutura distribuída.

| Verificação                                                    | Resultado                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Cadeia persistente completa dos quatro motores                 | **30/30**, sem filtro ou skip                                            |
| Unitários v2, contrato fixado, adapter REST e guard de release | **301/301**, 29 arquivos                                                 |
| Regressão PostgreSQL v2                                        | **154/154**, dez arquivos                                                |
| Regressão completa do hub                                      | **2.171 aprovados**, zero falhas, **18 pendentes** de 2.189              |
| Agente: conexão verificada e descoberta                        | **14/14**, incluindo drift de constraint antes/depois do SELECT          |
| MCP                                                            | Tipos, build, lint afetado, Node/compilador, training:check e docs:check |
| Hub                                                            | Lint completo, tipos, geração/baseline/check de contrato                 |
| Agente                                                         | Análise Dart afetada sem issues; processos novos/reinícios na cadeia     |

Contagens não são somadas para declarar cobertura integral. Os 18 cenários da
suíte geral do hub dependem de Redis/múltiplas réplicas, projeções persistentes ou
companions Dart opcionais: agent_dart_socket_bridge, agent_event_stream_backlog,
agent_hub_presence_redis, client_socket_events_redis, redis_chaos,
rest_profile_multi_replica, rest_rate_limit_redis, socket_io_redis_adapter,
socket_rate_limit_redis, socket_relay_multi_replica, sql_operation_dart_transport
e rest_read_projections. Não contam como evidência de aceite. A matriz persona-v2
persistente dos quatro bancos acima executou todos os seus casos, sem exclusões.

## Comportamento comprovado

Inspeção fixa por motor preserva todos os pares ordenados de chaves e oculta FKs
fora do escopo. Estados habilitado, desabilitado, não validado e desconhecido
permanecem distintos. Dependências exigem prova compatível; constraints desconhecidas
não são promovidas a habilitadas. SELECT com constraints exige sourceConstraints v1
negociada no hub e agente, sem fallback para agentes anteriores.

Nos três motores com prova suficiente, o runner publica/adota um perfil físico
com PK, índice único e FK composta, e executa JOIN treinado sob essa expectativa
na conexão executora. SQL Anywhere publica/adota perfil de colunas e executa
consulta sem depender de enforcement não comprovado. Isso não certifica paridade
completa das constraints dos quatro motores.

Perfis exigem curador/administrador autenticado, catálogo concedido e acesso
remoto vigente à mesma fonte. O pacote preserva campos/restrições comuns;
substituições precisam ser explícitas e classificações não podem ser reduzidas.
Rascunho usa CAS; preview vincula revisão, autor, catálogo, evidência e prazo.
Confirmação reutilizada, revisão obsoleta, CAS concorrente e outra base são
recusados. Publicação é imutável; edição posterior não altera a versão adotada.
Suspensão bloqueia contexto e consulta sem worker ou ampliação de tokens.

Migrations 0014–0015 preservam conteúdo v2. A correção aditiva diferencia o hash
físico interno, que inclui origem do hub, da prova nativa, com associação restrita
no banco MCP. Nenhuma migration aplicada foi alterada. O teste de upgrade usa
schema histórico real 0004, sem remover colunas do schema atual, e verifica
quarentena de fontes sem prova, preservação de snapshots e reaplicação idempotente.

Falhas corrigidas nesta rodada: associação entre identidades interna/nativa,
comparação do nome de destino de FK no Firebird, teste histórico incompatível
com novas dependências e referência de sql.describeSchema ausente no OpenAPI
ativo. A correção pública exigiu nova versão menor conforme o gate do hub.

## Pendências e limpeza

Continuam pendentes enforcement comprovável SQL Anywhere, relações físicas reversas
e N:N, CHECKs e demais construções fora da gramática, matriz adversarial completa
de constraints/drift real, mínimos privilégios, duas personas/responsáveis com
versões independentes e revogação em trânsito. Perfis ainda precisam de listagem,
histórico e editores completos; adoção em DML, evidências de múltiplas páginas,
curadoria e demais gates da plataforma continuam abertos.

Não certifica instalador desktop, TLS/DNS público, Redis distribuído, plugin no
ChatGPT real, acessibilidade ou comportamento da IA consumidora. DTD não encontrou
app ativo para hot reload; a cadeia executou processos novos e reinícios reais do
companion isolado, sem abrir cofre ou aplicativo operacional.

Os três manifestos mantêm **ready: false**, 14 gates exigidos e zero concluídos.
Processos da fixture encerrados pelo runner; remoção dos recursos temporários
pelo manifesto de propriedade, sem atingir bancos/configurações operacionais.
Logs privados e payloads não integram o inventário ou o repositório.
