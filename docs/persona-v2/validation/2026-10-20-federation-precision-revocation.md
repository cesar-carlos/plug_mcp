# Precisão e revogação no cruzamento — 2026-10-20

## Correção

Entradas locais recusam inteiros numéricos fora do intervalo seguro de JavaScript.
Antes da correção, o teste com dois IDs grandes distintos resolvia como JOIN
válido, pois o segundo número era arredondado ao primeiro. Agora retorna
INVALID_PLAN antes da segunda consulta. IDs recebidos como texto exato continuam
distintos; não há conversão silenciosa ou tentativa de recuperar precisão perdida.

## Autoridade

Ampliado o teste do orquestrador publicado para revogar a fonte já lida:
antes da segunda consulta e antes da entrega final. Ambos recusam a execução,
com uma e duas consultas respectivamente. Não alteram publicação nem tentam
novamente; são testes com gateways controlados, não revogação remota real.

## Resultados

53 testes passaram em três arquivos, em 1,98 segundos. Tipos, lint dirigido
e formatação passaram. A regressão inicial de precisão falhou antes da mudança
e passou depois, preservadas as asserções.

Cadeia persistente: dois testes passaram em 23,69 segundos; início 10:19:16.
Filtro cruza PostgreSQL, 77 casos não selecionados. PostgreSQL/SQL Server e
PostgreSQL/SQL Anywhere com hub Prisma e agentes reais de fixture. Limpeza
confirmada. training:check aprovou o hub 0dc94d6990167f65e093b1fb68a8150630e2057c.

SHA-256 de src/application/persona-v2/federation.ts:
19F2F72C5F91BA96EA67245C020F27D2778C1426119272094E2C8CDED4BD08CD.

## Limites

A cadeia confirma regressão do fluxo com inteiros seguros; não certifica tipos
BIGINT nativos de todos os drivers ou toda janela de revogação. Precisão extrema
e revogação após leitura foram exercitadas nos testes controlados descritos acima.
Instruções v2 orientam representação exata treinada; não foram avaliadas por IA.
Imagem anterior não contém a correção. Deploy e aceite integral seguem bloqueados.
