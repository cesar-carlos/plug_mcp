# Consentimento de gestão de integrações — 2026-10-20

Suíte `tests/persona-v2/oauth.postgres.test.ts`: 32 testes aprovados,
sem omissões, em 7,25 segundos, início 11:10:26 (America/Cuiaba).
Execução pelo wrapper Node 24 e configuração vitest.persona-v2.

PostgreSQL 17 em contêiner próprio com nome aleatório, porta loopback e senha
efêmera. Cada suíte utiliza banco próprio; contêiner e volume removidos ao final,
com restauração da variável de conexão. Nenhuma fonte do usuário utilizada.

O caso novo passa por autenticação, consentimento, emissão, resolução do access
token e leitura da concessão persistida. Confirma:

- Permissão administrativa selecionada sem IDs concede lista vazia.
- ID selecionado sem permissão administrativa concede lista vazia.
- Permissão e ID autorizado selecionados conservam somente esse ID.
- ID forjado fora do escopo oferecido não amplia a concessão.

O formulário OAuth oferece caixas desmarcadas separadas das operações
executáveis. A oferta depende da permissão administrativa vigente; a concessão
persiste a interseção, sem herança automática.

## Limites

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` com alterações locais.
Autoridade administrativa controlada na fixture; não certifica delegação real
do hub, seletores de emissão/edição no console, HTTPS público ou ChatGPT.
Não fecha gates nem autoriza deploy; ready:false permanece obrigatório.
