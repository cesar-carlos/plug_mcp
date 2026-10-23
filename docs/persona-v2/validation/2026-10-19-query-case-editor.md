# Editor visual de casos de consulta — 2026-10-19

## Entrega

O console cria, edita e remove casos declarativos de consulta por revisão/CAS.
Parâmetros, sementes, colunas geradas e resultados esperados têm controles tipados.
Conflito preserva a edição; remoção exige confirmação. Casos antigos fora do
schema vigente são recusados sem conversão. Edição pendente protege navegação e
o treinamento principal. Carregamento bloqueia edição concorrente local.

O console não executa os casos nem aprova relatórios. O runner de operador
continua separado e usa fixtures próprias. Snapshot publicado não é alterado.

## Evidência

- Suíte Chromium completa: 48 testes aprovados em 4,5 minutos.
- Depois dessa rodada, o bloqueio de edição durante a leitura foi acrescentado.
  Após novo build, os dois testes afetados passaram em 9,3 segundos, incluindo
  resposta retida por barreira, conflito de revisão, preservação e remoção.
- Tipos da interface, lint da interface/teste e build passaram. O build mantém
  avisos de anotações de dependência Zod; não houve erro de compilação.
- A rodada completa anterior não certifica automaticamente o ajuste posterior;
  o ajuste tem a repetição dirigida acima, não uma segunda rodada integral.

Ambiente: Node 24 pelo wrapper do projeto, Chromium, PostgreSQL 17 de fixture
e hub sintético. Não certifica os três motores, agente instalado, HTTPS público,
ChatGPT, leitor de tela ou zoom real. Nenhum gate foi encerrado.

O teardown removeu bancos temporários e o arquivo de estado do navegador.
Inspeção confirmou apenas postgres e persona_query_editor_test no contêiner
se7e-query-editor-20261019, rotulado se7e.fixture=query-editor-20261019.

## Código observado

SHA-256 dos arquivos finais, com alterações locais sobre a base MCP
136b5bfc8f7104b753bbd3703c9ffda196fdd51f:

| Arquivo                                  | SHA-256                                                          |
| ---------------------------------------- | ---------------------------------------------------------------- |
| web/src/persona-v2/QueryCaseEditor.vue   | 9017e2fc41dac8e6f0cce8b0d449d3bdfd458507f081d37ce01dbb7977c2f6c8 |
| web/src/persona-v2/QueryTestsPanel.vue   | 193124639d069aa035cefe024979e60d4570d0b10f53ca7cc69978a942665558 |
| web/src/persona-v2/PersonaConsole.vue    | 9f6d132f31320c9d3a81631ee4198f6546a6eb02ccfcac28350eee26cb37efb9 |
| tests/persona-v2-browser/persona.spec.ts | 8ee8b8cae6f0a8f3d9eb42cc3619ebc5591fb9a142b9cb9ec249c023c70bd415 |

Produção permanece bloqueada. HTTPS e ChatGPT continuam para validação manual.
