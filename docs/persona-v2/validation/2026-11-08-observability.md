# Diagnóstico HTTP e observabilidade — 8 de novembro de 2026

Implementação local posterior a `a35e8c5`; não comprova publicação ou deploy.
Node 24.21.0 e TypeScript 7.0.2, com fixtures HTTP e PostgreSQL 17 descartáveis.
Não foram executadas consultas em bancos operacionais.

## Cobertura

| Melhoria                  | Evidência automatizada                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 404 e correlação HTTP     | `http-diagnostics.test.ts`: logger Pino real, rota ausente versus recurso indisponível, parser, router montado, ID enviado pelo cliente ignorado e ausência de URL/corpo/segredos                             |
| Respostas administrativas | Mesmo teste: status/código preservados, supportId em corpo/cabeçalho e preservação do ID do subsistema; respostas de recursos inexistentes/inacessíveis mantêm o mesmo formato                                |
| Contrato das fixtures     | `hub-agent-fixture.test.ts`: resposta compartilhada passa pelo adapter real, identidade ausente ou trocada recusada; fixture persistente de operações reutiliza o helper                                      |
| Conferência pós-deploy    | `deployment-observation.test.ts` e `test-deployment.test.ts`: SHA/imagem, saúde, reinícios, ciclos, erros de runtime, limite de tentativas, logs truncados e nenhuma mutação/replay na observação             |
| Métricas por etapa        | `query-timings.test.ts` e `source-query.test.ts`: amostragem desligada, isolamento concorrente, fases integradas com logger real, preservação de resultado/erro quando logger falha e revalidações executadas |

Os testes unitários de HTTP são sintéticos e não identificam retroativamente a
origem dos nove 404 observados no deploy anterior. As novas categorias melhoram
o diagnóstico de próximas ocorrências sem deduzir versão do cliente ou atacante.
O verificador foi testado com respostas Docker controladas; isso não representa
um deploy desta revisão ou homologação integral para clientes.

## Rodadas

`vitest run tests/unit tests/contract`: 1.965 testes aprovados. Após os ajustes
finais, as quatro suítes de diagnóstico, métricas e consulta passaram em 79
cenários; as duas suítes de observação/deploy passaram em 37. São conjuntos
sobrepostos, não somar os totais. Typecheck, build, lint de src/tests, verificação
de sintaxe dos scripts MJS e docs:check aprovados. O lint tipado do projeto não
inclui scripts MJS; sua validação usa sintaxe Node e regressões executáveis.

`npm run test:persona-v2:postgres`: 338 testes aprovados em 22 arquivos,
usando PostgreSQL 17 isolado e descartável. A fixture foi removida após a rodada;
nenhum banco ou volume operacional foi utilizado.

Logs locais ignorados pelo Git: `test-results/observability-unit.log` e
`test-results/observability-persistent.log`. As métricas ficam desativadas por
padrão; a instrumentação não alega redução de latência. A conferência pós-deploy
trata warnings, linhas desconhecidas e truncamento como necessidade de revisão,
sem ocultar falhas nem repetir efeitos.
