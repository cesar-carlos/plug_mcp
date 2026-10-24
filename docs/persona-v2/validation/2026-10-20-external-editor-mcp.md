# Treinamento externo delegado por MCP — 2026-10-20

Suíte setup-delegation.postgres: 79 testes aprovados em 34,63 segundos,
início 11:30:37. Após ampliar o caso para revisão/publicação pelo MCP, rodada
dirigida passou em 5,27 segundos, início 11:31:41, com outros 78 filtrados.

O caso cria pelo HTTP, lista/lê/edita pelo MCP e acrescenta caso ao rascunho
externo não publicado por editar_caso_skill. Serviços aplicam escopo editorial
em todas as camadas. Runner separado produz relatório sintético; prazo é
definido pelo responsável. MCP revisa/publica sem herdar execução; prévias de
outra autoridade são recusadas. Os casos publicados existentes continuam
exigindo concessão exata, preservados pela regressão completa.

PostgreSQL 17 em contêiner próprio, senha efêmera, porta loopback, bancos isolados;
fixtures removidas e variável restaurada. Não utiliza fontes operacionais.
MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.

Autoridade remota e provedor controlados. Não certifica todos os schemas MCP,
criação pelo MCP, editor por OAuth ou hub persistente, provedor real ou imagem
final. A lista de ferramentas não equivale a validação de todas elas.
HTTPS/ChatGPT permanecem manuais; ready:false e gates sem aceite preservados.
