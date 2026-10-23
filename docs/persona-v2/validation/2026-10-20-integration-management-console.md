# Concessões administrativas de integrações no console — 2026-10-20

Chromium: um cenário dirigido aprovado em 4,0 segundos, sem retry.
Execução pelo wrapper Node 24, configuração playwright.persona-v2 e filtro
`gestão de integrações no token`.

O navegador cria persona e emite token pelo console. Uma integração de fixture
é previamente cadastrada no PostgreSQL de controle isolado. O teste confirma
que a integração começa desmarcada, seleciona explicitamente seu ID e verifica
a concessão persistida. Em seguida, edita o token pelo console, retira o ID e
confere a persistência da lista vazia. Skills e operações executáveis permanecem
vazias em ambos os momentos.

Contêiner PostgreSQL 17 próprio, porta loopback e credencial efêmera. Servidor
e bancos de fixture removidos ao terminar; variável de conexão restaurada.
Nenhuma fonte operacional utilizada.

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
SHA-256 de `tests/persona-v2-browser/persona.spec.ts`:
`4346E8FDBBAA0F253BF930977EA7A68510858AAC993523D4439D63B10DB4E1C4`.

Autoridade do hub sintética nesta rodada; não certifica delegação persistente,
OAuth no navegador, provedor externo ou imagem final. HTTPS/ChatGPT permanecem
manuais. Deploy bloqueado; nenhum gate encerrado.
