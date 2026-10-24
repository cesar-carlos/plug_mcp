# Candidata após importação delegada — 2026-10-20

Imagem local reconstruída com alvo `persona-v2-candidate`, sem push ou deploy.
MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais;
não apresentar o commit-base como inventário integral do candidato.

Identidade Docker observada e usada pela fixture:
`sha256:4c4711b17af0aaa4ae5c67096171353dd60e121a4c0832b3361fffca75981235`.
Manifesto da plataforma:
`sha256:1bfc5ea94a03fbb35f32a2133056f817a4681025f4e9c102f61102dd7abaf449`.
Config:
`sha256:5ae710990a7337a432dbe95d507108e4fd7e82d5d0140cb6b93f3b55417f5095`.

## Ensaios executados

`scripts/homologation/test-persona-candidate.ps1` passou:

- Recusa de produção, segredo ausente e comando desconhecido.
- Recusa de legado/checksum e ausência de DDL automático.
- Aplicação das 42 migrations, assets, quatro jobs e reinício.
- Backup/restauração em banco próprio, preservação do original e limpeza confirmada.

`run-persona-chain-homologation.ps1` com `Persistence prisma`, `CandidateImage`
explícita e filtro `Chromium cria persona` passou: um teste, 78 não executados
pelo filtro, início 12:01:10, duração de 37,96 segundos.

O percurso cria persona, cadastra fontes PostgreSQL/SQL Server/SQL Anywhere,
treina, publica, concede token e consulta dados sintéticos pelo navegador e
cadeia MCP da imagem → hub persistente → agentes de fixture. Confere vazio,
recusa de escrita pela ferramenta de consulta e armazenamento do navegador.
Hub fixado `0dc94d6990167f65e093b1fb68a8150630e2057c`.
Somente recursos próprios foram utilizados e removidos.

## Limites

A imagem incorpora a importação delegada recente. Os cenários OAuth de importação
e discovery foram comprovados no checkout em relatórios separados; este filtro
não os executa pela imagem. Não equivale à matriz integral, instalação desktop,
avaliação da IA ou teste manual do usuário. HTTPS público e ChatGPT permanecem
manuais. Avisos de build sobre tamanho do bundle e comentários de dependência
não impediram a montagem.

Nenhuma imagem publicada e nenhum gate encerrado. `ready: false` preservado.
