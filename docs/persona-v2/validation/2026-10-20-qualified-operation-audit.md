# Alcance dos nomes qualificados nas operações — 2026-10-20

## Constatação

O contrato ativo continha duas afirmações incompatíveis: a seção de nomes
físicos documentava schema.tabela, mas um parágrafo posterior o declarava
pendente. Corrigida a documentação, sem ampliar gramática ou autorização.
Também removida a afirmação antiga de ausência dos runners e da prova limitada
de constraints SQL Anywhere 16, já entregues e documentados nos seus subsistemas.

Código conferido:

- operation-identifiers.ts cita segmentos separadamente e recupera alvo exato.
- operation-training.ts recusa recortes simples ambíguos.
- Testes de identifiers, transport e shared-operation-adoption cobrem
  capabilities, policy, SQL adaptável, conciliação, saídas e rejeição de homônimos.
- operationFixtureTable no cenário persistente usa public.operation_fixture,
  dbo.operation_fixture e dba.operation_fixture. As rodadas anteriores da
  cadeia não usaram apenas nomes simples.

## Validação

63 testes passaram em três arquivos, em 2,17 segundos, Node 24 do projeto.
A primeira tentativa no sandbox teve dois erros ENOENT em arquivos temporários
do Vitest; repetição fora do sandbox passou integralmente. Não houve mudança
de asserção, gramática ou runtime.

A [rodada mista OAuth](2026-10-20-mixed-knowledge-oauth.md) também executou os
cenários nativos nos três motores usando os alvos qualificados acima. Essa
evidência não equivale a testar todas as combinações de schemas homônimos,
recortes, collations, Unicode ou extensões nativas.

## Pendências preservadas

Matriz ampliada na cadeia real, configuração instalada, imagem final e aceite.
Recursos de três/quatro partes e identificadores fora da gramática continuam
recusados. ready:false e bloqueio de deploy permanecem.
