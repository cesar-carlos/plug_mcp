# SQL Anywhere: UUID provisionado e validações

Rodada de 2026-10-11, em alterações locais ainda não publicadas. Estado e
pendências na [matriz de aceite](../acceptance.md). Os três manifestos continuam
`ready:false`, `completedGates:[]`; nenhum gate foi aprovado por esta rodada.

## Decisão e implementação

O responsável aprovou explicitamente [DV2-007](../decisions.md#dv2-007--uuid-provisionado-no-sql-anywhere):
SQL Anywhere admite UUID provisionado manualmente pelo DBA, com acesso mínimo
e procedimento para cópias/restaurações. Não é identidade nativa. Outros motores
continuam exigindo `native`; locator e proof kinds incompatíveis são recusados.

O agente lê UUID/versão/nome pela conexão executora, antes/depois do SELECT e
antes da transação DML, sem reconnect ou fallback. Runtime nunca cria/repara
`DBA.se7e_source_identity`; script separado de manutenção DBA cria o singleton
com UUID v4 e trigger contra INSERT/UPDATE/DELETE. Principal técnico tem somente
SELECT no marcador. MCP e guard do agente reservam essa tabela fora das skills.
Metadados incompletos, versão inválida e falta de permissão bloqueiam uso.

Uma divergência DML antes de abrir transação agora conserva o código tipado
`SOURCE_IDENTITY_MISMATCH` na factory, em vez de classificá-la como falha nativa
genérica. Journal conserva cancelamento sem reexecução; isso não fabrica receipt
de rollback nem transforma erro de transporte em prova de substituição.

Contrato e procedimentos: [identidade da fonte](../source-identity.md#sql-anywhere-uuid-provisionado-pelo-dba).
Migrations MCP aplicadas não foram alteradas. Não houve migração, provisionamento,
consulta de negócio ou escrita em fonte cadastrada pelo usuário.

## SQL Anywhere real e limites

Ambiente: SQL Anywhere **16.0.0.2043**, driver SAP **16.00.2043**, Windows,
`odbc_fast` do agente. Runner explicitamente invocado em base temporária própria,
sem `.env`/DSN operacional. Conexões, verificação e factory transacional são reais;
essa suíte não passa pela autenticação/roteamento do hub.

**10 testes reais passaram, sem skips**, na rodada final, nas fases sem marcador,
provisionamento, reinício, restore e reenrolamento da cópia como fonte distinta.
Incluem recusa sem criar tabela, identidade estável em conexões novas, SELECT com
prova vigente, recusa antes de SQL com UUID antigo, proteção INSERT/UPDATE/DELETE
do marcador, principal SELECT-only e recusa sem grant, bloqueio de DML com
identidade antiga, INSERT com commit e INSERT com rollback confirmado.

O arquivo de banco/log foi copiado com servidor parado. O restore manteve UUID,
nome e endpoint: a prova continuou igual, demonstrando o limite documentado. Após
o reenrolamento DBA explícito apenas nessa cópia isolada, o UUID/hash mudou e a
prova anterior foi recusada antes do SQL de negócio. Essa intervenção de fixture
não faz parte de nenhum fluxo automático do produto.

Houve uma tentativa de iniciar a fixture numa porta dinâmica indisponível no
Windows. O runner passou a selecionar uma porta privada explicitamente testada
e encerrar somente seu próprio processo quando o startup nativo deixa janela de
erro sem listener. A rodada final com esse ajuste passou integralmente.

O runner reproduzível está em
[run-sql-anywhere-identity-homologation.ps1](../../../scripts/run-sql-anywhere-identity-homologation.ps1).
Exige raiz temporária **nova** `se7e_persona_<12 hex>_test`. Não recebe uma fonte
existente como alvo. O script de provisionamento e o teste Dart ficam no agente,
respectivamente `tool/sql_anywhere_source_identity.sql` e
`tool/homologation/sql_anywhere_source_identity_test.dart`.

## Gates executados

| Verificação            | Resultado e alcance                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP release:check      | Node 24.21.0, TS 7.0.2, docs/training/lint/format/tipos/build/frontend passaram; 1.115 backend e 23 frontend passaram; 91 skips legados                                                               |
| Persona-v2 PostgreSQL  | 69 testes, cinco arquivos, sem skips; controle, migrations, catálogo, consultas, cruzamentos e operações em bases descartáveis                                                                        |
| Console Chromium       | Três testes sem skips; PostgreSQL real e autoridade do hub sintética; persona vazia, duas fontes, publicação, token restrito, troca de contexto, teclado e móvel                                      |
| Agente                 | 51 regressões de identidade, query, transação, journal e RPC passaram; análise dos oito arquivos alterados sem diagnósticos                                                                           |
| Hub                    | Tipos TS7, lint, format, build e contrato passaram; 2.174 testes passaram, quatro skips opcionais; PostgreSQL/Redis próprios, SMTP noop, Socket.IO Dart de produção habilitado com transação simulada |
| Snapshot do hub        | Aplicação do patch ao commit-base em cópia temporária e contract:check passaram                                                                                                                       |
| Bloqueio de publicação | Os três guards recusaram publicação com exit 1; manifestos sem mudança                                                                                                                                |

A primeira rodada do hub teve seis falhas por uma variável extra do ambiente de
teste que interferia nos casos de configuração de produção; corrigida apenas a
fixture, a suíte completa passou. O teste do guia público PostgreSQL ainda
esperava a versão anterior; atualizado para a base comum v3, os 69 testes passaram.
Essas falhas não foram ocultadas por skips ou redução dos requisitos.

Hub: commit-base `0d2c6b488438a77be71b39e514cd06ab11fbb95e`, contrato aditivo **1.6.0**.
SHA-256 contrato `8bf1a316f86241b5c234ccc853972897a265983840cc5b3b38a6c0ce102f94e0`;
patch `4b246fc8a79eac0f2273eb9da2b1cf458cb2e6ec3ae46e6c81735a8c362b36fc`.
O commit upstream não é anunciado como portador dessas alterações locais.
Base comum v2: `persona-v2-source-identity-3`, hash
`b72e5744b95dc36011a1ba216507e1bc684ee75dcf5a86411a9a672e2ac16b33`.

Hashes SHA-256 dos arquivos locais do agente testados:

| Arquivo                                                                  | SHA-256                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| lib/infrastructure/external_services/odbc_source_discovery.dart          | 7f26a398856cb8a7588ed2612b34d49c8e60a018538e8e24517c6c34c809058d |
| lib/domain/entities/expected_source.dart                                 | 507964997320d452c7b9760b238da58d89c871edf0456d8e1e7f144771507759 |
| lib/infrastructure/external_services/odbc_sql_operation_transaction.dart | 4edc52a818c94c67d3f081dee8de6f2a81fc4e65556e17665ffd48cb31a3ab09 |
| tool/sql_anywhere_source_identity.sql                                    | f36a6816dfe38361e6be632320ebaad33ae225d7d58da167e487890c246bde23 |

## Pendências preservadas

Homologação completa MCP → hub → agente nos quatro motores, autoridade real,
runner de publicação por motor, tipos/triggers fora das fixtures e procedimentos
operacionais de restauração continuam exigidos. A matriz histórica dos quatro
motores não foi recontada como uma execução nesta revisão. OAuth v2, integrações,
retenção e jornadas administrativas restantes continuam na matriz de aceite.

Uma cópia pode conservar todos os identificadores observáveis; o procedimento DBA
é obrigatório, sem promessa de detecção byte a byte. Restore não desfaz lançamentos
nem autoriza apagar journal ou repetir operação desconhecida.

DTD não encontrou app de depuração ativo; hot reload não foi possível. Nenhum
agente operacional foi iniciado para esse fim. O P2P do usuário não foi repetido:
a rodada anterior encontrou policy sem banco obrigatório, e não há evidência de
correção dessa condição. Deploy, commit e push não foram executados.

Após os testes, dez diretórios temporários próprios, os contêineres dedicados,
os servidores SQL Anywhere de fixture, o cache de conexão incidental e os scripts
de preparação locais foram removidos. Preservados o PostgreSQL e os dois processos
SQL Anywhere preexistentes, além do arquivo de análise já existente no workspace.
Documentação final passou em docs:check e formatação; a limpeza não altera as bases
ou credenciais cadastradas.
