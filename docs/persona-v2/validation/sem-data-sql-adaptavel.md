# SQL adaptável e conciliação treinada

> Relatório histórico extraído do registro consolidado em 2026-10-11.
> Data registrada: Não individualizada. Datas, contagens e limitações não foram reavaliadas
> nesta reorganização. [Índice](../validation.md) · [Estado atual](../README.md).

## Evidências históricas anteriores

Esta rodada verifica fundação, catálogo, consultas por fonte, cruzamentos publicados
e componentes de lançamentos em desenvolvimento. Não constitui aceite da
refatoração integral, homologação de escrita, teste de uma instalação operacional
do hub/agente ou avaliação de IA.

## Rodada atual: SQL adaptável e conciliação treinada

Operações publicadas admitem reordenar SET/AND e acrescentar filtros restritivos
explicitamente treinados. A gramática fechada preserva efeito, tabela, valores,
outputs, identidade, concorrência e recortes; não aceita scripts, literais, OR,
expressões ou referências a outra fonte. Publicar exige casos obrigatórios de SQL
adaptado aceito/recusado. Alteração de conteúdo exige preparação/aprovação nova.

`conciliar_operacao` lê exclusivamente o marcador UUID único inserido na mesma
transação, sob garantia append-only treinada. A ausência, duplicidade ou resposta
incompleta mantém evidência inconclusiva. Evidência de aplicação é separada do
comprovante técnico do agente: não inventa commit/rollback ou linhas alteradas,
nem torna a operação novamente executável. Policy exige banco e recurso exatos;
token/publicação/credencial/policy são revalidados durante o fluxo.

- **MCP: 1.040 passaram, 91 skips legados**, 120 arquivos aprovados e seis omitidos.
- **PostgreSQL persona-v2: 63 passaram**, quatro arquivos, sem skips. Inclui
  upgrade 0003→0004/reaplicação preservando preparações, evidências imutáveis,
  ordenação por versão com horários empatados, publicação com casos positivos e
  negativos, SQL adaptado real e exemplo documentado executável em fixture.
- O adaptador REST real foi testado contra hub sintético com leitura de marcador
  em PostgreSQL dedicado; a escrita incerta nesse fluxo é simulada. Isso não
  comprova journal/commit nativos ODBC ou homologação dos quatro motores.
- Testes unitários verificam gramática/quoting dos quatro dialetos, bindings,
  outputs, recortes, tentativa de ampliação, revogação durante conciliação e
  precedência de comprovante concorrente. Parser não substitui motor real.
- Lint, formatação global, tipos, build e TypeScript **7.0.2** aprovados.
- Nova migration **0004_operation_reconciliation.sql**, apenas no schema v2;
  nenhum banco operacional ou cadastro de usuário foi migrado/resetado.

Base comum versionada como `persona-v2-operation-adaptation-1`; rules,
instruções runtime, guias, contratos de uso e exemplos foram sincronizados.
Os três manifestos seguem `ready:false`, sem gates integrais marcados.
`persona:release-check` recusa publicação. `node:check` recusa Node 24.18.0
(exige >=24.21.0 <25). `training:check` mantém bloqueio pela referência fixada
do hub divergente; ela não foi atualizada artificialmente nesta rodada.

Continuam pendentes: homologação ODBC e runners dos demais motores, conciliação
sem marcador exclusivo, retenção, console/OAuth v2, integrações, contrato/ref
imutável coordenado e corte. As falhas do ensaio Prisma do hub registradas abaixo
não foram reavaliadas nesta rodada, que não altera o hub/agente. O PostgreSQL
descartável exclusivo foi removido; o contêiner existente do usuário foi preservado.
