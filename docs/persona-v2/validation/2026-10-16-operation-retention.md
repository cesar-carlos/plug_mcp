# Retenção de operações — 2026-10-16

Evidência de desenvolvimento. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais preservadas.
O [inventário parcial](2026-10-16-operation-retention-files.json) fixa os arquivos
desta frente; não é snapshot integral nem release. `ready: false`, treze gates
obrigatórios e nenhum concluído permanecem inalterados.

## Implementação

Migration aditiva `0029_operation_retention.sql`, port/caso de uso e adapter
próprios, compostos no worker v2 de desenvolvimento. Não altera migrations
anteriores, armazenamento do hub/agente ou entrada legada.

- Desfecho conhecido fixa `terminal_at` pelo relógio do PostgreSQL. Payloads e
  resultados externos expiram juntos após 24h; comprovantes após 90 dias, quando
  já não há conteúdo operacional. O lote não usa data do receipt upstream.
- Registros históricos sem relógio imutável recebem prazo conservador a partir
  do upgrade. Conteúdo é preservado; CAS muda nos terminais antigos. Desconhecidos
  mantêm todos os campos anteriores e não recebem relógio de conclusão.
- Estado desconhecido, execução/cancelamento em andamento e preparação pendente
  não entram na limpeza. Conciliação comercial não habilita retenção. Resolução
  técnica do journal SQL inicia novo prazo na transição local.
- IDs, fingerprints, estados e vínculos permanecem para impedir reutilização.
  Triggers vedam DELETE, antecipação dos marcadores/prazos e restauração do conteúdo
  removido. Remoções incrementam versão, preservando estado e `updated_at`.
- Lease independente de 30s, lotes de até cem por categoria/tabela, locks e
  `SKIP LOCKED`. Validade é revalidada antes do commit; falha desfaz o lote.
- API e console distinguem `retention` e `dataAvailability`. Revisão externa com
  payload removido retorna contrato/input/limites nulos; não recupera conteúdo
  pela rede. Leitura ainda exige autoridade vigente. Instruções v2 não inferem
  resultado vazio, rollback ou permissão de retry da ausência de conteúdo.

Contrato: [worker](../review-worker.md#retenção-de-operações),
[SQL](../sql-operations.md) e [integrações](../external-integrations.md).
Rotação de chaves, outbox externa e homologação operacional ampliada seguem no
[plano restante](../remaining-plan.md).

## Fixture e resultados

Container próprio `se7e_retention_e45161969e4f_test`, PostgreSQL 17.11 da imagem `postgres:17-alpine`,
loopback com porta aleatória 51794. Bancos aleatórios `_test` por suíte, sem
extensão vetorial, volumes compartilhados ou credenciais/fontes operacionais.
Node 24.21.0 e TypeScript 7.0.2 reais pelo wrapper do projeto.

| Rodada                                                              | Resultado                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Retenção inicial, baseline e journal                                | 29 aprovados e quatro casos não executados por erro de slug na preparação da nova fixture; nome foi corrigido sem relaxar constraint  |
| Retenção/upgrade corrigidos                                         | **5/5**, 3,28 s                                                                                                                       |
| Primeira integração v2 completa                                     | **235/235**, 74,20 s                                                                                                                  |
| Unitários v2                                                        | **512/512**, 45,43 s na rodada final                                                                                                  |
| Serviços externos, retenção e reinício/revisão                      | **70/70**, 36,72 s                                                                                                                    |
| Integração v2 completa após leitura com conteúdo removido           | **236/236**, 81,06 s                                                                                                                  |
| Retenção final, incluindo processo/instância concorrente e reinício | **6/6**, 4,82 s                                                                                                                       |
| Console                                                             | **36/36** testes, incluindo dois casos de renderização dos avisos; lint/tipos/build aprovados                                         |
| Chromium dirigido                                                   | **1/1**, 8,5 s, viewport 390px; aprovação, desconhecido sem reenvio e revisão sem payload após cancelamento de preparação não enviada |

Rodadas se sobrepõem e não devem ser somadas. O sexto caso de retenção foi
acrescentado após a rodada completa e validado separadamente; não altera código
do produto. Os testes cobrem upgrade/reaplicação, prazos, relógio futuro da
aplicação sem remoção antecipada, conteúdo externo atômico, receipt precoce
recusado, desconhecido preservado, resolução com novo prazo, tombstone permanente,
CAS, lotes, linha bloqueada, lease abandonado, rollback antes do commit e processo
real concorrente/reiniciado sem repetir remoção.

Fixture SQL/externa do teste de storage contém somente contrato sintético e
metadados; não executa DML ou efeitos externos. O teste de serviço externo usa
transporte de fixture e verifica `dataAvailability: purged`, revisão nula,
recusa de execução e revogação de leitura. Chromium cancela uma preparação
não enviada e envelhece metadados somente na fixture; não fabrica efeito externo.
Envelhecimento ocorre por operador de teste sob lock exclusivo, desabilitando
apenas o trigger de relógio durante a alteração e reativando no mesmo commit.
O runtime não tem API ou configuração para envelhecer registros.

Tipos, lint, build servidor, formatação dos arquivos afetados e `docs:check`
aprovados. O primeiro lint apontou tipo não seguro na leitura de datas de teste;
foi corrigido com row tipado e revalidado, sem relaxar regras. O build do console
emitia avisos de comentários da dependência Zod, sem falha. Manifesto/guard
continuam recusando release. Não houve alteração de contrato ou pin do hub.

## Limites e limpeza

São testes do controle MCP persistente em PostgreSQL e do worker/console com
autoridades/transportes de fixture. Não certificam a cadeia dos três motores,
instalador do agente, Redis distribuído, rotação de chaves, outbox, acessibilidade
integral, IA consumidora ou produção. Os dois processos no teste pertencem à
fixture; lease/rollback são reais no PostgreSQL.

Bancos/conexões/processos de suíte foram encerrados e o container próprio com
seus volumes anônimos foi removido após conferência da etiqueta de propriedade.
Nenhum recurso operacional ou compartilhado foi removido. HTTPS público e
ChatGPT permanecem para validação manual. Deploy e publicação de imagens seguem
bloqueados; nenhum gate foi encerrado.
