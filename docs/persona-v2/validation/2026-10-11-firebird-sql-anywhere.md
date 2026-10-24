# SELECT Firebird e saídas SQL Anywhere

> Relatório histórico extraído do registro consolidado em 2026-10-11.
> Data registrada: 2026-10-11 (registro). Datas, contagens e limitações não foram reavaliadas
> nesta reorganização. [Índice](../validation.md) · [Estado atual](../README.md).

## Rodada anterior: SELECT Firebird e saídas SQL Anywhere

**55 testes reais ODBC passaram, sem skips:** 12 em PostgreSQL 17.11,
12 em SQL Server 16.0.4236.2, 12 em SQL Anywhere 16.0.0.2043 e 19 em Firebird
5.0.4. Drivers e arquitetura do runner são os mesmos descritos na rodada anterior.

Firebird tem parser próprio na entrada nova, ligado ao treinamento/publicação,
consulta e cruzamentos. Todas as referências físicas de projeção, expressões,
JOIN, filtro, GROUP/HAVING/ORDER entram no mesmo allowlist e recortes dominantes.
Sete SELECTs foram compilados/validados pelo MCP e executados no driver real:
modelo, FIRST/SKIP, ROWS, agregação, CONTAINING/CAST, LEFT JOIN e envelope vazio.
Foi corrigido o alias `_validacao`, inválido sem aspas no motor. A agregação real
usa CAST explícito para DECIMAL(18,2): SUM ampliado do Firebird 4/5 excede a
materialização desse driver. O servidor não insere conversões sem treinamento.
Gramática e limites: [Firebird](../firebird-sql.md).

SQL Anywhere agora compila outputs de INSERT/UPDATE em leituras auxiliares por
chave UNIQUE física treinada/identidade, com uma linha e na mesma transação.
Os planos reais do MCP retornam o ID gerado no INSERT, usam esse ID no UPDATE,
retornam a revisão no UPDATE e a usam no DELETE. Há também rollback real após
conflito de concorrência. Não se usa MAX(id), @@identity ou interpolação de saída.
O SELECT auxiliar reaplica recortes, requer concessão de tabela/colunas/efeito
select e entra no hash preparado e no teto nativo. O consumidor não adapta helpers.

Base comum persona-v2: `persona-v2-dialect-queries-2`; casos/preview de nova
publicação precisam refletir o hash atual. O campo `uniqueKeys` fica no JSON de
treinamento; não há DDL ou migração de cadastros para essa evolução.

A autoridade do runner ODBC continua sintética. Esses resultados não certificam
o fluxo operacional inteiro JWT/ClientAgentAccess/policy/hub, toda a gramática
nativa, todas as conversões/triggers, os runners de publicação dos outros motores,
integrações externas, OAuth/console v2, retenção ou corte. Os três manifestos
permanecem `ready:false`, com nenhum gate integral liberado.

Gates locais desta rodada: Node **24.21.0**, TypeScript **7.0.2**, referência do
contrato do hub **1.3.0**, lint, formatação, tipos e build aprovados. Backend:
**1.076 testes passaram**, com os 91 skips legados previamente existentes; nenhum
dos 55 testes ODBC foi omitido. Console legado: **19 testes**, lint/tipos/build.
PostgreSQL persona-v2: **63 testes passaram**, quatro arquivos, sem skips.
Runner Dart com análise estática sem diagnósticos e formatação aprovada.

Os três bloqueios de publicação foram executados e recusaram o release como
esperado. Ao terminar, foram removidos os dois contêineres dedicados, processo
SQL Anywhere, registros ODBC temporários, manifesto privado e arquivos das quatro
bases/journals. O PostgreSQL local preexistente permaneceu ativo. A descoberta
DTD não encontrou aplicativo de teste ativo; nenhum agente operacional foi iniciado.
