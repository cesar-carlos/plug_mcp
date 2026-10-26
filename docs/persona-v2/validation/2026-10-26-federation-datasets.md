# Datasets por fonte em cruzamentos — 2026-10-26

## Revisão e alcance

Árvore local ainda não commitada, baseada em
`f521585d40e9a844984b143101b928676614d519`, Windows e Node 24.21.0.
Contrato: [biblioteca editorial](../knowledge-library.md#datasets-por-fonte-em-casos-de-cruzamento).

Entregue preparação por consulta publicada e aplicação por fonte em casos de
transporte. Referências de consulta/revisão, publicação/hash e dataset/template
ficam separadas por fonte. Salvar exige Client, CAS, fontes e plano compatíveis,
dependências vigentes e papel editorial, sem herdar relatório ou executar SQL.
Não há nova migration.

## Verificação local

| Verificação                                                                                                                  | Resultado                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `shared-knowledge.postgres.test.ts`, configuração persona-v2                                                                 | 23 aprovados em PostgreSQL 17 descartável com banco aleatório próprio. |
| `federation.test.ts`, `federation-publication.test.ts`, `federation-publication-cases.test.ts`, `dataset-case-seeds.test.ts` | 62 unitários aprovados.                                                |
| Suíte rápida `playwright.persona-ui.config.ts`                                                                               | 24 aprovados sobre o build final, com APIs simuladas por contexto.     |
| Testes unitários da interface                                                                                                | 87 aprovados em 23 arquivos.                                           |
| Build da interface, tipos do servidor/interface e lint dos arquivos afetados                                                 | Aprovados.                                                             |

O cenário PostgreSQL cria duas fontes e consultas importadas/publicadas, prepara
datasets distintos e salva caso sem relatório aprovado. Verifica responsável
incorreto, publicação estranha ao cruzamento, origem duplicada, conservação de
referências omitidas, hashes de sementes modificadas por fonte, rascunho divergente
e publicação suspensa. Nenhuma consulta de negócio é executada nessa prova.

O cenário Chromium escolhe cada publicação e dataset, aplica em cada base e
confirma a preservação do SQL, resultado esperado e sementes independentes até
o salvamento explícito. Mudança/fechamento do caso descarta seleções e prévias.

Durante a preparação, a fixture precisou inativar explicitamente exemplos
importados ainda candidatos antes de publicar, conforme o contrato. A resposta
de publicação simulada no navegador foi completada com suas capabilities.
As correções foram nas fixtures; nenhum gate ou teste foi removido. Rodadas
dirigidas serviram ao diagnóstico; os totais acima são das suítes finais completas.

## Limites

Não comprova execução de datasets nos três motores, imagem Docker publicada,
instalação no ChatGPT ou aceite integral para clientes. Importação direta sem
consulta de origem e fusão de múltiplos datasets por fonte seguem abertas.
Casos sintéticos não recebem esse formato. Banco temporário removido após os testes.
Sem commit, push ou deploy nesta rodada.
