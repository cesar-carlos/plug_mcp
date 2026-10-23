# Matriz completa da candidata — falhas abertas em 2026-10-20

Execução sem filtro com `Persistence prisma` e `CandidateImage`
`se7e-persona-v2-candidate:local`, ID
`sha256:7a7114587a37ecdb91577ec13d4122a87150931a2e6872a706c1e517bf4f8a21`.
Resultado: **71 testes passaram e oito falharam**, 476,40 segundos,
início 12:20:30. Fixture dos três motores removida pelo controlador.
Nenhuma fonte operacional usada.

Hub fixado `0dc94d6990167f65e093b1fb68a8150630e2057c`;
MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, alterações locais.
Inventário capturado durante a rodada: 1084 arquivos, SHA-256
`2511a4c520d128225104d61b4f23dbf44bd0a6b0c4afa98962ae08e5bd6e4bed`.
Não confundir inventário do checkout com imagem ou aceite.

## Falhas

- Delegação persistente: emissão administrativa esperava 201, recebeu 403.
- Propostas físicas/adoção nos três motores: leitura da delegação esperava 200,
  recebeu 403.
- DML nos três motores: executar operação retornou AGENT_UNAVAILABLE,
  source plug_server_http, stage sql.operation.get. Não há prova de efeito
  que autorize repetir esses lançamentos.
- Recuperação posterior esperava três operações incertas registradas pelo
  cenário anterior e recebeu zero; falha dependente, sem prova de recuperação.

## Diagnóstico e próxima ação

O controlador Docker converte a origem do hub para host.docker.internal;
helpers locais compõem outro runtime com origem 127.0.0.1. A identidade do
responsável inclui origem. Essa divergência é uma hipótese concreta para os
403, ainda sem correção homologada. Não alterar identidades persistidas ou
relaxar autorização para contorná-la.

A falha SQL exige reprodução dirigida e diagnóstico seguro de transporte/estado;
não foi atribuída à mesma causa dos 403. Preservar consulta pelo mesmo ID e
proibição de retry incerto. Helpers especializados continuam fora da imagem;
o modo CandidateImage não certifica automaticamente suas composições locais.

Bloqueio prioritário: corrigir a composição canônica da fixture e explicar as
recusas SQL antes de repetir a matriz integral. Percurso dirigido do navegador
e empacotamento aprovados anteriormente não substituem esta rodada.

Deploy permanece bloqueado. Nenhum gate encerrado.
