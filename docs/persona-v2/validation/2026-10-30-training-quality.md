# Qualidade do treinamento — 2026-10-30

Rodada local sobre `61a15aa47e2744074d012d3e6882fd4194394496` com alterações
não commitadas. O workspace também recebeu alterações simultâneas de transporte
HTTP/RPC; os totais da suíte descrevem o workspace executado, não uma revisão
publicada nem evidência de deploy. Nenhum gate integral foi aprovado.

## Escopo implementado

- Avaliador consumidor: até dez tentativas independentes, perguntas de
  acompanhamento, histórico sem referências esperadas, evidência própria por
  turno e diagnóstico por categoria sem conteúdo privado. Harness nunca aprova IA.
- Bateria sintética: universo de 501 produtos, empates com cortes explícitos,
  total zero, fanout, conciliação, nulos/devoluções, vazio, permissões,
  instruções externas, parcialidade e falha de transporte.
- Novos previews/publicações analíticos exigem casos obrigatórios e relatório
  atual. A checagem não altera snapshots existentes e não aprova SQL adaptado
  ou semântica automaticamente.
- Métricas/sinônimos opcionais v1: schema, referências executáveis, hash de
  contrato, editor de rascunho, contexto concedido e índice lexical. Definições
  comerciais não são executadas como fórmulas nem ampliam autoridade.
- Guias técnicos/administrativos por tópico, com hashes de conteúdo. Redução
  do arquivo de instruções principal de aproximadamente 48 KB para 24 KB;
  detalhes permanecem nos guias. Teste limita o texto expandido a 36 KB UTF-8,
  sem confundir bytes com tokens. Restrições essenciais permanecem no núcleo.
- Contratos atualizados e remoção de afirmações atuais incorretas sobre runtime
  legado/deploy, preservando relatórios históricos.

## Verificações

Node 24.21.0 oficial executado em diretório temporário, checksum SHA-256
conferido no manifesto do distribuidor, sem mudar a instalação global.
Compilador TypeScript 7.0.2; requisitos do projeto preservados.

| Verificação                          | Resultado e alcance                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Node e compilador                    | Compatíveis                                                                                                          |
| Lint, typecheck e build backend      | Aprovados                                                                                                            |
| Suíte geral                          | 201 arquivos aprovados; 1.829 testes aprovados; 6 arquivos/91 testes condicionais omitidos                           |
| Console: lint, tipos, testes e build | Aprovados; 68 arquivos/285 testes                                                                                    |
| Chromium local                       | 1 cenário aprovado: digitação, edição/recolhimento, envio explícito e preservação após conflito, com APIs sintéticas |
| Busca lexical sintética              | Recall@3 e posição recíproca iguais a 1 no conjunto pequeno testado; termo ausente e ambiguidade preservados         |
| Contrato do hub                      | Checkout temporário no commit fixado, sem alterar o checkout ativo ou relaxar o pin                                  |
| Documentação e formatação            | Checagens locais executadas; ver relatório do comando na rodada                                                      |

A primeira execução ampla encontrou restrições de sandbox para sockets e
links; a rodada final permitiu esses recursos locais. Uma fixture nova de
resposta parcial foi corrigida para fornecer evidência parcial, preservando a
validação do avaliador. O seletor do navegador foi corrigido para usar o papel
acessível. Nenhuma dessas tentativas anteriores é registrada como aprovação.

## Limites

Por solicitação do responsável, não houve avaliação com IA real. Adaptador e
transporte concretos, dataset revisado e rodada identificada continuam pendentes.
O oracle sintético verifica o avaliador, não a qualidade de respostas de um modelo.
Não houve consulta ao ERP, ensaio nos três motores, publicação de skills,
migration, alteração de concessões, push ou deploy nesta tarefa. A política de
casos exige um mínimo técnico; a cobertura comercial deve ser revisada pelo
responsável. Os testes condicionais omitidos não são considerados aprovados.
