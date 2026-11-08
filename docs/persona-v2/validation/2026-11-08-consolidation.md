# Consolidação de treinamento, diagnóstico e desempenho — 8 de novembro de 2026

Revisão consolidada: `711aa21d841b9c250ce25bc7e4673b6e3e18d86e`, enviada à
`main` do GitHub. O SHA remoto foi comparado ao local após o push, com checkout
limpo. Isso comprova envio do código, não implantação ou aceite de clientes.

## Escopo

- Treinamento comum/v2, tópicos, descoberta de dialetos, hashes, orçamento de
  conteúdo e compatibilidade dos pacotes privados.
- Avaliador sintético com vínculos de publicação/fonte, evidência por turno,
  pré-requisitos, limites de chamadas e recusa de repetição após falhas.
- Diagnóstico seguro de erros HTTP/RPC e integrações externas, correlação por
  supportId, precedência dos códigos explícitos e preservação de efeitos incertos.
- Transporte, autenticação e anexos, preservando isolamento, limites e revogação.
- Otimizações de catálogo, grafo, serialização e cópias de binários.
- Regras de comprovação de melhorias e regressões. Fixture opcional de prazos
  MSSQL com geração tipada e seis testes, sem homologação nativa dessa modalidade.

## Validação conjunta

`npm run release:check` terminou com código zero em Windows, Node 24.21.0 e
TypeScript 7.0.2. O treinamento usou checkout isolado do contrato upstream fixado,
sem alterar o repositório de trabalho do hub.

| Verificação                                  | Resultado da rodada                                               |
| -------------------------------------------- | ----------------------------------------------------------------- |
| Node, compilador, documentação e treinamento | Aprovados                                                         |
| Lint, formatação e typecheck                 | Aprovados                                                         |
| Suíte principal                              | 2.115 aprovados; 91 ignorados, sem contabilizá-los como aprovados |
| Console                                      | 285 testes aprovados; lint, typecheck e build aprovados           |
| Build do servidor                            | Aprovado                                                          |

O log local da execução é `test-results/coordinated-release-check.log`, ignorado
pelo Git. A medição de desempenho e a rodada PostgreSQL isolada têm relatório
próprio no índice de validação; seus totais não devem ser somados aos desta rodada.

## Limites e estado remoto

O CI foi disparado para o mesmo SHA. Na conferência imediatamente após o push,
estava em andamento na [rodada 42529172237](https://github.com/cesar-carlos/plug_mcp/actions/runs/42529172237).
Este registro não afirma o resultado posterior do CI nem versão instalada de
servidor/worker. Nenhum deploy foi comprovado nesta consolidação.

### Revisão posterior ao envio

O job `verify` dessa rodada falhou na preparação de
`operation-publication.postgres.test.ts`: a fixture HTTP omitia `agentId`,
exigido pela validação de identidade do adapter, e o cadastro retornava 503.
A falha foi reproduzida em PostgreSQL descartável. A fixture foi corrigida para
devolver o ID exato da rota consultada, sem afrouxar a guarda do adapter ou trocar
a expectativa 201. Os nove testes dessa suíte passaram após a correção.
Essa correção posterior não integra o SHA `711aa21`; exige novo CI e artefato.

Na validação posterior, `release:check` passou com 2.135 testes principais,
91 ignorados e 285 testes do console. A suíte PostgreSQL descartável passou em
337 cenários; o cenário de reset recusou a configuração local sem senha porque
verifica ausência da senha na saída. Reexecutado com senha sintética não vazia,
passou sem alterar assertions. Os 338 cenários ficam cobertos por essas rodadas,
não por uma execução integral verde. Timeout também teve a regressão antiga
alinhada ao contrato sem retry, verificando ausência de prazo inventado e de
garantia de cancelamento. Logs locais: `documentation-release-check-final.log`,
`documentation-persistent.log` e `documentation-reset-fixture.log` em `test-results/`.

Avaliação com IA real permanece adiada. Checks offline, exemplos sintéticos e
testes de geração de fixtures não certificam os três motores, conversas reais,
instalação do plugin ou gates integrais para clientes. Testes ignorados permanecem
fora da evidência, e nenhum ensaio foi executado em banco operacional.
