# Editor de skills de cruzamento — 2026-10-17

Evidência parcial de desenvolvimento, sem aceite de produção. Revisões-base:
MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub
`76950497dc386130e13b7d6afc0678e50208e985`, agente
`7d00ae8a8f822605d76e775fb5659f27e29df539`. Alterações locais preservadas;
snapshot não é commit. [Inventário SHA-256](2026-10-17-console-federation-editor-files.json)
identifica os arquivos desta frente. Sem branch, commit, push, publicação de imagem ou deploy.

## Entrega

Console tem editor de cruzamentos separado da execução pelo consumidor. Seleção
de consultas usa nome/revisão do snapshot publicado e fonte/dialeto. Dependência
antiga não é substituída automaticamente. Finalidade e sete regras semânticas,
etapas ordenadas, chaves compostas, cardinalidade, projeção, união, agregação,
ordenação, saída e limites são editáveis sem JSON. Remoção/reordenação conserva
referências pendentes; servidor valida o grafo completo. JSON avançado usa schema
estrito compartilhado com o backend, sem importar compiladores no navegador.

Casos têm dois formatos preservados: combinação sintética com linhas por etapa,
e SQL pelo transporte com sementes por fonte e resultados tipados. Casos antigos
não são convertidos. Plano/entradas só são refeitos mediante confirmação explícita;
decimais/inteiros tipados permanecem textuais e nulo é distinto de vazio.
Não há execução ou aprovação de relatório pelo console.

Casos usam CAS e relatórios paginados somente leitura, com revisão/hashes exatos.
Os novos endpoints reutilizam os serviços de autoridade e repositórios existentes,
sem migrations. A extração dos schemas preserva formatos de treinamento e dos
runners. Preview/publicação existentes revalidam conteúdo, dependências,
autoridade, prazo humano e hash. Edição posterior conserva snapshot ativo;
publicação não concede fontes/consultas dependentes aos tokens.

## Ambiente e verificações

Node 24.21.0, TypeScript real 7.0.2, Chromium 153.0.8010.12 e PostgreSQL 17.11 em contêiner próprio
`se7e-federation-editor-99d3db4fdfd9`, somente loopback, label e bancos `_test`.
Nenhuma fonte ou credencial do usuário. Backend de teste usa PostgreSQL nativo
com hub sintético. Navegador usa duas bases sintéticas independentes e composição
MCP real; o runner separado de combinação não comprova SELECT pela cadeia real.

Verificações desta frente:

- Duas consultas publicadas escolhidas visualmente, caso sintético estruturado,
  runner separado, relatório atual, prazo e confirmação humana para publicar.
- Novo nome de rascunho e edição de casos preservam publicação ativa; relatórios
  antigos tornam-se obsoletos, sem reativação ou concessão automática.
- Caso de transporte cadastrado visualmente com fontes/sementes e resultado
  tipado, sem converter o formato ou disparar testes.
- Token precisa de todas as dependências; execução combina consultas da fixture,
  pagina no final e recusa token revogado. Não certifica instalação do hub/agente.
- PostgreSQL: validação estrita, recusa de aprovação via HTTP, CAS concorrente,
  isolamento de persona/tipo/cursor, relatórios obsoletos e paginação estável.
- Edição protegida na navegação e layout em 360/390/768/1280px. Sem equivalência
  automática a leitor de tela ou zoom real de 200%.

| Verificação                                                       | Resultado                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Chromium, suíte completa                                          | **36/36**, sem skips, **3,4 min**                             |
| Chromium, ajuste final de casos antigos e percurso completo       | **1/1**, **16,0 s**                                           |
| PostgreSQL nativo, consultas/casos de cruzamento e publicação SQL | **58/58**, sem skips, **24,29 s**                             |
| Frontend nativo                                                   | **58/58**, **1,07 s**                                         |
| Regressão geral nativa                                            | **1.471 aprovados, 91 não executados**, **77,02 s**           |
| Checks locais                                                     | Node/compiler, training:check, lint, tipos e builds aprovados |

A primeira execução do frontend isolado falhou por remoção de arquivos temporários
SSR pelo sandbox; repetição nativa passou. Os primeiros testes dirigidos de UI
usavam igualdade exata do texto do label que incluía as opções; passaram com
seletores pelo nome acessível do combobox. A verificação negativa PostgreSQL
esperava 400 para tipo incompatível; o contrato vigente retorna 409. Ajustada e
repetida a suíte, sem mudar o contrato de erro para atender o teste.

Após a suíte Chromium completa, a leitura de `generated` opcional de casos antigos
recebeu fallback visual vazio, sem reescrever o registro. O teste dirigido foi
ampliado e repetido no bundle final para cobrir esse formato e o percurso inteiro.
Os checks afetados foram repetidos. Os 91 não executados são anteriores e não
certificam infraestrutura obrigatória. Avisos PURE do Zod são do empacotador.
O novo editor carrega sob demanda; bundle principal permanece abaixo de 500 kB.

## Limpeza

Nome, label, lista de bases e caminho absoluto foram conferidos antes da remoção.
Dezoito bases de navegador/dados das rodadas e o banco raiz da fixture foram
descartados com o contêiner próprio e seu volume anônimo; ausência do volume foi
confirmada. Os testes PostgreSQL removeram suas bases privadas. Diretório temporário
com a credencial sintética removido; nenhuma escuta permaneceu na porta 5188.
Uma primeira conferência de limpeza recusou o prefixo `persona_data_*`; os nomes
foram cotejados com o helper antes de concluir a remoção. Nenhum recurso operacional
ou configuração do usuário foi alterado.

## Limites e liberação

Não homologa a cadeia persistente dos três motores, instalação operacional,
avaliação da IA, acessibilidade assistiva, HTTPS público ou ChatGPT real.
HTTPS/ChatGPT continuam para validação manual. Runners genéricos e suas evidências
históricas não certificam automaticamente este candidato.

Os três manifestos permanecem `ready: false`, com zero gates concluídos.
Não substitui entrada/worker legados, não publica imagens e não autoriza deploy.
