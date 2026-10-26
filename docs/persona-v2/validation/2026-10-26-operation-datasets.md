# Sementes editoriais de operações SQL — 2026-10-26

## Revisão e escopo

Implementação local ainda não commitada sobre a base
`f521585d40e9a844984b143101b928676614d519`, no Windows com Node 24.21.0.
Contrato: [biblioteca editorial](../knowledge-library.md#sementes-editoriais-para-casos-de-operação-sql).

O console permite selecionar uma consulta importada da mesma persona/fonte,
preparar as sementes de seu dataset e aplicá-las a um caso SQL. A gravação fixa
origem própria, revalida acesso/revisões e recalcula hashes. Parâmetros, resultado
esperado, publicação e aprovação de efeitos não são herdados. Não há nova migration.

## Evidências locais

- `shared-knowledge.postgres.test.ts`: 22 testes aprovados em banco aleatório
  próprio, dentro de PostgreSQL 17 descartável. O cenário editorial passou a
  incluir operação SQL: recusa de outro responsável, CSRF inválido, revisão
  antiga, consulta inexistente, origem falsa, hashes recalculados e origem
  preservada ao editar sementes sem reenviar a referência. Prévia não salva
  casos e gravação não cria relatório aprovado.
- `operation-dataset.test.ts` e `dataset-case-seeds.test.ts`: 14 testes aprovados,
  incluindo nomes físicos por dialeto, coluna removida, view e recusa de tipos
  ou classificação incompatíveis mesmo com dataset vazio/colunas só com nulos.
  Essas verificações de contrato não são execução nos três motores.
- Testes unitários da interface: 87 aprovados em 23 arquivos.
- Suíte rápida Chromium: 22 testes aprovados sobre o build final. O novo cenário verifica preparação sem gravação, aplicação sem mudar
  nome/resultado esperado e envio explícito da origem com as sementes.
  APIs da suíte rápida são simuladas; a persistência é verificada separadamente.
- `sql-operations.test.ts` e `operation-training.test.ts`: 54 testes aprovados.
- Build, typecheck de servidor/interface, lint e formatação dos arquivos afetados
  aprovados. Validação documental sem problemas.

As primeiras tentativas do cenário Chromium usavam seletores exatos de label
que incluíam o texto das opções. Foram corrigidos para selecionar os comboboxes
pelo nome acessível; não se aumentou timeout nem se removeu a verificação.

## Limites e continuidade

O recorte exige consulta importada como origem editorial. Importação direta e
datasets por fonte em cruzamentos continuam pendentes. A continuação abaixo
entregou a escolha de outra versão no editor; a API conserva o vínculo com a
versão exata do template.

### Continuação: escolha de versões no editor SQL

O seletor reutiliza a listagem paginada da consulta de origem. Usuário escolhe
original ou versão explícita, prepara prévia e aplica separadamente. Mudanças de
seleção/contexto e falhas invalidam a prévia, preservando o caso. Não há atualização
automática para a versão mais recente nem requisição automática de retry.

Chromium: 23 testes aprovados na suíte rápida, incluindo original, outra versão,
paginação, falhas de lista/leitura, recuperação explícita e preservação de
nome/resultado esperado. Esse total substitui, não soma, a rodada de 22 acima.
Typecheck do servidor/interface e build da interface passaram novamente.
Persistência: 22 testes aprovados novamente, agora incluindo seleção explícita
da versão 2, recusa de hash incorreto e conservação da versão original quando
nenhuma opção é enviada. A fixture negativa passou a usar versão 999 inexistente,
pois a versão 2 deixou de ser inexistente nessa rodada. Lint, formatação e
validação documental também passaram. PostgreSQL descartável removido após os testes.

Não houve commit, push ou deploy. Não certifica imagem Docker nova, instalação
no ChatGPT, fixtures reais dos três motores ou aceite integral. O runner continua
separado do console e não busca linhas da biblioteca durante a execução dos casos.
