# Paginação e concorrência PostgreSQL — 2026-10-29

## Diagnóstico e alteração

Logs remotos mostraram nove recusas RPC `-32602` com
`Pagination requires ORDER BY with simple column names or aliases` e aviso do
pg sobre chamadas concorrentes na mesma conexão. Os logs não preservam SQL;
não é possível atribuir uma expressão específica a cada ocorrência histórica.

A validação local verificava presença de ORDER BY e ausência de limite, mas não
validava a forma dos termos. O contrato do agente em
`lib/domain/validation/sql_validator.dart` exige termos simples; ordenação
qualificada também depende de projeção simples. O MCP agora recusa formas
incompatíveis antes da autorização remota e orienta aliases projetados.
Não reescreve SQL, modifica publicações existentes ou repete chamadas.
As restrições adicionais só se aplicam à paginação gerenciada v2.

O progresso carregava publicações com Promise.all na mesma transação/conexão
PostgreSQL. A leitura agora é sequencial; falha interrompe a sequência.
A regressão usa uma conexão simulada que recusa sobreposição, incluindo falha
na primeira leitura. A suíte persistente também exercita progresso com duas
publicações usando PostgreSQL real isolado.

## Validação local

Alterações no working tree, sem commit ou deploy nesta rodada.
Ambiente Windows, Node 24.18.0, TypeScript 7.0.2, PostgreSQL 16 em container
exclusivo descartável, porta loopback 55439. Nenhum banco operacional foi usado.

- Suíte `tests/unit/persona-v2`: 727 testes aprovados em 72 arquivos.
- `maintenance.postgres.test.ts` e `source-query.postgres.test.ts`: 77 aprovados.
- `sql-ast.test.ts`, `sql-security.test.ts` e `fanout-ast.test.ts`: 35 aprovados.
- Typecheck e build com `@typescript/native` 7.0.2: aprovados.
- ESLint nos arquivos TypeScript alterados: aprovado.
- Prettier nos arquivos alterados e `docs:check`: aprovados.

As primeiras execuções de suites com sockets falharam por EACCES do sandbox;
foram repetidas com acesso autorizado à rede local e passaram. Esses erros não
foram tratados como skips aprovados. Testes de dialeto usam parser/mocks; não
certificam execução real nos três motores nem reproduzem as consultas privadas.
Node 24.18 está abaixo do mínimo 24.21 do projeto: o gate de runtime/release
permanece pendente. Nenhum gate integral ou validação remota foi aprovado.
