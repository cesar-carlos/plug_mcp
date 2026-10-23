# Editor externo delegado — 2026-10-20

Suíte setup-delegation.postgres: 79 testes aprovados em 35,44 segundos,
início 11:26:22. Após ligação das rotas, o caso `editor externo delegado`
passou novamente em 4,76 segundos, início 11:27:51; 78 demais casos filtrados.

PostgreSQL 17 próprio, senha efêmera, porta loopback, bancos de fixture.
Contêiner/volume removidos e variável restaurada em ambas as rodadas.
Autoridade remota e provedor são controlados; nenhuma base operacional usada.

O novo caso verifica negação sem managedIntegrationIds, criação HTTP após
concessão explícita, leitura/listagem limitadas, recusa de troca para integração
fora do escopo e edição por revisão. Runner separado produz relatório de
fixture. Consumidor não pode escolher prazo; responsável define prazo atual.
Prévia de sessão não publica por token e prévia de token não publica pela sessão.
Publicação pelo autor correto não concede execução. Revogação bloqueia leitura.

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
Não certifica todas as rotas, tools MCP, OAuth deste editor, hub persistente,
provedor real ou imagem final. Casos delegados de rascunho não publicado
continuam pendentes. Deploy bloqueado, nenhum gate encerrado.
