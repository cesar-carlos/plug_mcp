# Diagnóstico HTTP e observabilidade — 8 de novembro de 2026

Rodada local posterior a `a35e8c5`; sua evidência técnica é separada da
publicação de `37829b5`, registrada ao final deste relatório.
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

A observação remota posterior está registrada abaixo; não altera o alcance
dos testes sintéticos nem aprova gates integrais.

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

## Publicação e observação remota

Revisão publicada: `37829b5612fc29bb3e7cd0b0d3ef17a7e456fc09`.
[CI 42534304688](https://github.com/cesar-carlos/plug_mcp/actions/runs/42534304688)
e [deploy 42535629396](https://github.com/cesar-carlos/plug_mcp/actions/runs/42535629396)
concluídos com sucesso. O checkout limpo em `/root/plug_mcp` recebeu
`git pull --ff-only origin main`; a substituição dos serviços ocorreu pelo
workflow, com a imagem validada pelo CI, não por build nesse checkout.

Imagem carregada em ambos os serviços:
`sha256:b56cd574a1756b7d30f6b6d48b995df63cd51bd52d4e9b416fd1d32cf6526372`.
Servidor e worker iniciaram em **2026-11-08 às 23:33:20 UTC**
(19:33:20 em America/Cuiaba), com SHA exato, saúde positiva, zero reinícios
e sem OOM. O worker concluiu os ciclos review, ephemeral, retention e outbox.

A observação SSH posterior executou o verificador e GETs locais em `/health`
e `/ready`: `status: ok` e `ready: true`, ambos com `complete: false`.
O resumo desde a subida registrou zero warnings, erros e linhas não JSON,
sem truncamento, sem supportIds e com `logReviewRequired: false`.
A janela é limitada à observação pós-deploy, não é monitoramento contínuo
nem demonstra ausência de falhas futuras nas conversas.

Local, origin/main, checkout remoto e serviços coincidiam nessa revisão.
Bancos e volumes operacionais foram preservados; não foram executados testes
PostgreSQL ou SQL Anywhere nas fontes operacionais. O destino continua
`test-server`, conforme DV2-017; essa publicação não libera o aceite integral
para clientes nem certifica conversa real no ChatGPT.
