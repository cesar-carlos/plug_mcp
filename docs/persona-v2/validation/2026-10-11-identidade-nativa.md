# Identidade nativa na conexão executora

> Relatório histórico extraído do registro consolidado em 2026-10-11.
> Data registrada: 2026-10-11 (registro). Datas, contagens e limitações não foram reavaliadas
> nesta reorganização. [Índice](../validation.md) · [Estado atual](../README.md).

## Rodada atual: identidade nativa na conexão que executa SQL

Fluxo obrigatório preservado: MCP → plug_server → plug_agente → banco. O MCP
não recebe DSN nem abre banco de negócio. O cadastro descobre motor/identidade
pelo RPC `sql.describeSource` v1; consultas e operações enviam `expectedSource`
e exigem `sourceIdentity:1` negociado. O hub valida e revalida o transporte vivo,
sem interpretar SQL. O agente verifica a prova nativa na conexão dedicada que
executa o SELECT, antes/depois da leitura, e antes de abrir a transação DML.
Não há reconexão, replay, retry ou fallback para o executor legado nesse fluxo.

Prova incompatível impede SQL de negócio; mudança após SELECT impede entrega.
O MCP suspende vínculos/dependências quando recebe a falha de identidade exata,
sem confundir falha de rede com troca de base. Namespace/conteúdo do journal
incluem a prova; duplicatas não executam novamente mesmo após correção do destino.
Erros normais de SQL preservam classificação/origem para correção no pacote.
Migração `0005` suspende fontes anteriores sem prova e dependências transitivas,
sem limpar dados, reescrever publicações ou associar automaticamente outra base.

Evidências locais desta rodada:

- MCP `release:check`: Node **24.21.0**, TypeScript **7.0.2**, contrato/base, lint,
  formatação, tipos, builds e **1.096 testes backend** aprovados; **91 skips
  legados** preservados. Console: **23 testes** aprovados. Após acrescentar duas
  regressões de suspensão/origem, os **40 testes afetados**, lint, tipos e build
  passaram; esses testes novos não estão incluídos no total anterior.
- PostgreSQL persona-v2: **69 testes**, cinco arquivos, sem skips; banco novo,
  migrations, isolamento, fontes, publicação/dependências, consultas, cruzamentos,
  operações e invalidação de identidade. Banco de controle e fontes são fixtures.
- Chromium: **3 testes**, sem skips, incluindo persona vazia, duas fontes com
  dados distintos, treinamento/publicação/token explícito, consultas e navegação
  móvel. Hub/autenticação/prova são sintéticos; não é E2E operacional.
- Matriz ODBC obrigatória: **75 testes reais**, sem skips — 17 PostgreSQL 16.13
  (psqlODBC 17.00.0010), 17 SQL Server 16.0.4236.2 (driver 18.06.0001),
  17 SQL Anywhere 16.0.0.2043 (driver 16.00.2043), 24 Firebird 5.0.4
  (driver 02.00.0156). Inclui prova na conexão, divergência antes do SELECT/DML,
  contagens/rollback/IDs, journal/duplicatas e commit sem confirmação. Autoridade
  é sintética. SQL Anywhere nesse caminho recusa locator; DML legado do runner
  não homologa identidade durável desse motor no produto v2.
- Agente: **412 regressões** de RPC, autorização, protocolo, operação e schemas
  passaram. Complemento final: **17 testes** de consulta verificada/transação,
  incluindo preservação de erro SQL, mudança após SELECT e timeout tardio sem
  dispatch. Há sobreposição com a suíte ampla; não somar esses totais. Análise
  estática e formatação dos arquivos Dart alterados passaram sem diagnósticos.
- Hub: tipos pelo compilador próprio TS7, contrato **1.5.0** e build aprovados.
  Suíte ampla em banco PostgreSQL/Redis descartáveis: **2.173 testes passaram**,
  com **cinco casos opcionais omitidos**. Omitidos são registrados separadamente
  da homologação obrigatória; transporte Dart e projeções Prisma têm execução
  explícita complementar: **cinco testes passaram**, três arquivos, sem skips,
  com transporte Dart simulado/produção e projeções Prisma reais no banco de
  teste. A variante extra de transporte torna esse total distinto dos omitidos
  da execução padrão; não somar como se fossem cinco casos novos. Lint aprovado;
  seis arquivos preexistentes exigiram somente formatação para fechar esse gate;
  a conferência global de formatação do hub passou depois do ajuste.

O contrato do hub é fixado pelo commit-base
`0d2c6b488438a77be71b39e514cd06ab11fbb95e` + patch revisado reproduzível.
Contrato SHA-256 `90127cb8b20700a9fda2f21483fc41e31ac8f9a6842cb62a673bd7a40fe2d752`;
patch SHA-256 `e4245b0ca6df05364f0c118362e24c9a752538b4f131bbf0481c23a457f63ef8`.
Isso não afirma que o commit upstream contém alterações ainda locais.
Base comum v2: `persona-v2-source-identity-2`; publicações/relatórios anteriores
precisam ser revalidados conforme o novo hash, sem ampliar concessões existentes.

Teste autorizado no P2P real: login Client, vínculo aprovado e agente conectado
foram confirmados; a policy ativa não tinha banco obrigatório. O teste parou
nesse portão antes de discovery/SQL de negócio. Nenhum DML ou alteração de policy
foi realizado e as credenciais não foram persistidas. Esse bloqueio não deve ser
resolvido adivinhando a base ou afrouxando a autorização.

Os três verificadores reais de publicação recusaram o release como esperado;
manifestos permanecem `ready:false`, com `completedGates:[]`. Não houve deploy,
push, commit, reset operacional ou alteração de policy de usuário.
Contêineres PostgreSQL/SQL Server/Redis próprios, processo SQL Anywhere,
registros ODBC temporários, manifesto privado, bases/journals e staging da rodada
foram removidos. O PostgreSQL local preexistente foi preservado.

Uma conferência global posterior do MCP encontrou arquivos novos em edição
paralela fora desta implementação: `scripts/docs/check.ts`, `examples.ts`,
`markdown.ts` nessa pasta e `tests/unit/docs-check.test.ts` precisavam de
formatação. Foram preservados. O `release:check` aprovado acima descreve o
checkout validado naquela execução; não certifica alterações concorrentes novas.

Não havia app/DTD ativo para hot reload; nenhum agente operacional foi iniciado.
Ainda bloqueiam o aceite: identidade nativa durável do SQL Anywhere, permissões
mínimas e substituição homônima na cadeia completa real, clones/restaurações,
curadoria/grafo, OAuth/administração/delegação/console completos, integrações,
retenção/cache e corte coordenado. Veja o [estado atual](../README.md) e os
[limites da prova](../source-identity.md#limitações-que-ainda-bloqueiam-aceite).
