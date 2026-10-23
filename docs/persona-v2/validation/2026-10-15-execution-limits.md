# Limites redutíveis — 2026-10-15

Evidência parcial de desenvolvimento. `ready: false`, treze gates requeridos e
nenhum encerrado. Não autoriza deploy, imagem, plugin público ou corte.

## Entrega

Consulta combina limites publicados, globais do token, por concessão da skill,
OAuth e requisição pelo menor valor. União aplica todas as publicações escolhidas.
Limita linhas, paginação, prazo e JSON da resposta materializada; a contagem de
bytes não limita memória/tráfego nativos do driver. Timeout conta autorização e
impede entrega tardia, sem garantir cancelamento de SQL enviado. Valores inválidos
são recusados. Contexto, diagnóstico e resultado mostram os tetos aplicáveis.

DML combina treinamento, token/concessão, OAuth e preparação. Linhas diretamente
afetadas e prazo entram no fingerprint antes da aprovação. Teto menor que a soma
dos mínimos DML é recusado antes de preparar. Guardas por etapa e 32 comandos
permanecem. Cruzamentos incluem os limites por concessão além dos globais e dos
SELECTs locais. Delegação verifica tetos efetivos; não há ampliação automática.

Console edita limites publicados, globais, por skill e da delegação. OAuth permite
reduzir limites globais de consulta/DML e conserva as demais camadas. Ausência de
limites conserva tetos anteriores. Não houve migration, modificação de snapshot
antigo ou alteração de contrato hub/agente. Base técnica:
`persona-v2-execution-limits-1`. [Contrato](../source-queries.md#limites-redutíveis).

## Resultados

- Cadeia persistente final: **41/41 passaram**, **236,55 s**, fixture
  `se7e_persona_b94649f94fc7_test`. MCP HTTP → hub PostgreSQL/Prisma com
  autenticação/ClientAgentAccess reais da fixture → agente nativo com ODBC,
  configuração/cofre/journal duráveis → PostgreSQL, SQL Server e SQL Anywhere.
- Em cada motor: limites diferentes no pacote/token/concessão/requisição,
  paginação efetiva, linhas truncadas sem total presumido, bytes/prazo recusados
  sem dados e publicação nova indisponível ao token antigo. DML preparado com
  prazo reduzido; revisão humana confere o orçamento exato. Teto incompatível
  com mínimos DML é recusado antes do dispatch. Os cenários anteriores de
  conhecimento, cruzamentos, operações e reinício também passaram.
- Primeira rodada: **38/41 passaram**, **236,18 s**, fixture
  `se7e_persona_910a728cd830_test`. Os três novos testes paginados encontraram
  `INVALID_SQL`: wrapper do agente referenciava alias interno em ORDER BY.
  Corrigida a validação para mapear a projeção simples ao nome de saída, inclusive
  alias e lookup do cursor; projeções não comprováveis são recusadas. Não houve
  reescrita no MCP/hub. **74/74 regressões do agente** e análise dos dois arquivos
  alterados passaram, antes da rodada final.
- **424 unitários v2** e **195 integrações PostgreSQL** passaram. Incluem min de
  todas as camadas, valores inválidos, compatibilidade de snapshots, hash de
  orçamento, delegação, refresh OAuth e recusa de SQL após prazo. O helper de um
  teste SQL Anywhere tinha teto de uma linha para duas etapas DML obrigatórias;
  foi corrigido para duas, preservando a nova recusa de contrato impossível.
- **32 testes web**, lint/tipos/build web e **2 jornadas Chromium** passaram:
  limites publicados → token global → concessão menor → consulta com orçamento
  efetivo; regressão de finalidade pessoal preservada. A primeira tentativa
  Chromium em sandbox não conectou ao PostgreSQL local (`EACCES`); repetida com
  acesso à fixture. Hub do navegador é sintético, distinto da cadeia nativa.
- Node **24.21.0**, TypeScript **7.0.2**, tipos/build, lint, formatação e
  `docs:check` verificados. O verificador de release continua recusando publicação.
- As duas fixtures foram removidas pelo script de ownership, incluindo bancos,
  containers, DSNs e processo SQL Anywhere. Bancos do navegador e das integrações
  eram descartáveis próprios. Ajustada somente formatação em quatro arquivos
  preexistentes indicados pelo gate global; sem mudança de comportamento.

Versões nativas observadas por `sql.describeSchema`: PostgreSQL `17.0.11`,
SQL Server `16.00.4236` e SQL Anywhere `16.00.0000`.
O [inventário](2026-10-15-execution-limits-files.json) registra hashes após a
rodada, commits-base e drivers. É parcial: checkout sujo preservado, não snapshot
integral de release. Não foram coletados segredos, SQL executado ou resultados
de negócio para esse inventário. Trabalho concorrente de instalação não é
certificado por estes testes.

## Limites do aceite

Não homologa todos os formatos SQL paginados, cancelamento nativo por timeout,
limite de memória do driver, concessão parcial da mesma publicação, exportação,
cache/anexos, integração externa, plugin real, TLS público, instalador completo,
leitor de tela/zoom/móvel ou IA consumidora. As fixtures eram dedicadas;
não houve DML em fontes do usuário.
Nenhum gate da [matriz](../acceptance.md) foi encerrado. Sem commit, push ou deploy.
