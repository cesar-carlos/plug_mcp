# Integrações PostgreSQL e manutenção temporária — 2026-10-16

Rodada de desenvolvimento, sem release ou aceite integral. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais preservadas.
O [inventário parcial](2026-10-16-ephemeral-worker-files.json) identifica os
arquivos desta frente por SHA-256; não representa snapshot de todo o checkout.
`ready: false`, treze gates obrigatórios e nenhum concluído permanecem inalterados.

## Fixture e isolamento

Container próprio `se7e_persona_5efeff910213_test`, sem volume compartilhado ou
credenciais operacionais, PostgreSQL 16.15 da imagem `pgvector/pgvector:pg16`, publicado
somente em loopback na porta aleatória 49315. A extensão vetorial não foi criada
nos bancos v2; a imagem permite executar separadamente as migrations legadas.

Banco legado `se7e_training_5efeff910213_ci` dedicado aos quatro testes pendentes;
bancos v2 com nomes aleatórios e sufixo `_test`, criados/removidos por cada suíte.
Nenhum schema, credencial ou cadastro foi transferido entre runtimes. A primeira
tentativa teve três aprovações e uma recusa do guard por nome de banco fora do
padrão `se7e_*ci`; o nome da fixture foi corrigido sem alterar o guard.

## Implementação

- Novo job de manutenção no worker de desenvolvimento, com port próprio,
  lease independente de trinta segundos, lote de cem por tabela e locks estáveis
  com `SKIP LOCKED`. Perda de validade antes do commit desfaz o lote inteiro;
  instância antiga não libera o lease de outra.
- Limpeza de setups e prévias expirados, inclusive curadoria comum/física,
  além de vínculos de prazo órfãos. Publicações, propostas, calendários, fontes,
  concessões, auditoria e journals permanecem preservados.
- OAuth vinculado exige expiração do registro **e da concessão** para remoção.
  Códigos consumidos continuam identificando a família após o prazo individual;
  sua remoção antecipada impediria a revogação por replay já contratada.
- Migration aditiva `0028_ephemeral_worker.sql` acrescenta lease e índices,
  sem reescrever migrations anteriores. Startup continua exigindo checksums
  atuais e recusando produção; não migra automaticamente.
- Corrigidas expectativas desatualizadas de baseline e versão do guia público
  encontradas na suíte PostgreSQL. Retenção de payloads/receipts de operações,
  rotação geral de chaves e outbox externa continuam pendentes na etapa 12.

## Resultados

Node 24.21.0 e TypeScript 7.0.2 reais pelo wrapper do projeto.

| Rodada                                     | Resultado e alcance                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curadoria legada pendente                  | **4/4**, 2,16 s; deduplicação/CAS, publicação concorrente, revisão imutável, relatório obsoleto, runner PostgreSQL com decimal exato e recusa adversarial     |
| Primeira suíte v2                          | **223 aprovados / 2 reprovados**, 81,59 s; identificou expectativas antigas de migrations e versão do guia, sem falha convertida em aprovação                 |
| Job, baseline, OAuth e processo de revisão | **61/61**, 22,41 s; inclui cinco casos novos de manutenção                                                                                                    |
| Suíte v2 completa corrigida                | **230/230**, 83,10 s, catorze arquivos; autoridades e provedores de fixture, sem skip                                                                         |
| Regressão unitária v2                      | **512/512**, 22,24 s                                                                                                                                          |
| Rodada final afetada                       | **52/52**, 22,79 s; manutenção, OAuth, journal SQL e curadoria física/reinício após acrescentar verificações de preservação de replay e operação desconhecida |

Rodadas se sobrepõem e não devem ser somadas. Os cinco testes novos demonstram
expiração versus vigência, idempotência, vínculos órfãos, preservação da família
OAuth, lotes/linhas bloqueadas, disputa/retomada de lease e rollback integral.
O teste de journal compara a linha desconhecida antes/depois da manutenção;
continua recusando a transição de volta para preparada. OAuth conserva revogação
da família por código consumido sem afetar outra conexão. O teste existente de
processo inicia/reinicia o worker real e verifica ausência de notificação duplicada.

Tipos, lint, build, formatação dos arquivos afetados e `docs:check` aprovados.
Um erro inicial de lint no total genérico dos contadores foi corrigido usando
contagens tipadas explícitas e revalidado. Não houve alteração de gate para passar.
`persona:release-check` continua recusando liberação.

`training:check` passou com `PLUG_SERVER_CHECKOUT` apontando para cópia temporária
local no commit aprovado `e8f56db8e0205b94b99b5ac7dabd41655f4fd2c0`, como o CI
fixado. O hub avançou independentemente durante a rodada; essa nova revisão não
foi adotada. O check continua exigindo HEAD exato, ancestralidade, snapshot e
bytes commitados. A cópia foi removida; checkout do hub e pin não foram alterados.

## Limites e limpeza

São testes persistentes do controle MCP em PostgreSQL, com autoridades remotas
de fixture; não certificam a cadeia MCP/hub/agente nos três motores, instalador,
Redis, TLS público, ChatGPT real, acessibilidade integral ou avaliação da IA.
O runner legado usa exclusivamente SQL sintético no banco privado; não constitui
caminho de execução de negócio da v2. Nenhuma fonte cadastrada pelo usuário foi usada.

Após os testes, o container criado foi removido mediante conferência da etiqueta
de propriedade. Nenhum outro container, banco ou volume foi removido. As suítes
fecharam conexões e processos de fixture. HTTPS público e ChatGPT permanecem para
validação manual; publicação de imagens e deploy continuam bloqueados.

Continuidade: [worker](../review-worker.md), [plano restante](../remaining-plan.md)
e [matriz de aceite](../acceptance.md).
