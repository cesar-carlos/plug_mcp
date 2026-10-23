# Impacto por recurso estrutural — 2026-10-19

## Implementação

Mapa de padrões e perfis aceita filtro físico de tabela/schema e coluna.
Predicado consulta somente `expectedStructure.resources` publicado antes de
expandir dependências indiretas, filtrar/paginar o resultado autorizado. Não
consulta texto ou conteúdo inteiro para inferir dependências. Schema nulo não
é wildcard; coluna exige tabela. SQL utiliza parâmetros separados.

Console limpa resultado ao alterar filtros e usa nova leitura autorizada; não
altera rascunhos, adoção, suspensão, concessões ou contratos públicos do hub.
Publicações antigas sem estrutura fixada não recebem dependências inventadas.

## Verificação

- Duas suítes PostgreSQL: 32 testes aprovados em 22,84 segundos.
- Schemas homônimos, coluna não usada, tabela sem schema, coluna sem tabela,
  dependência indireta e versão física exata cobertos nas fixtures.
- Tipos, lint, 73 testes web, build e validação documental aprovados.
- Dois percursos Chromium (padrão e perfil) aprovados em 12,8 segundos; alteração
  do filtro descarta resultado e nova leitura funciona. Teardown automático
  confirmado sem bancos da rodada ou arquivo de estado remanescentes.

Fixtures PostgreSQL 17 isoladas com autoridade sintética. O mapa consulta o
controle MCP; não executa SQL em bases de negócio. Evidência não homologa cadeia
dos três motores, IA, HTTPS ou ChatGPT. Nenhum gate encerrado.

## Identificação

Checkout local alterado; SHA-256:

- `knowledge-impact.ts`: `6068841f5084ef28761e4a2ee6316f3e3ba7fc79fa4f4b655876132467cf259f`.
- Persistência `shared-knowledge.ts`: `b18171be263cd1024c542676950aa41688345919bd7196ee2527dcf29e5b2c08`.
- `KnowledgeImpact.vue`: `9dbb0119365fc771d0f9e77ed5cdd8cdd5db02ee4465762ff9b795dcd582da81`.

Matriz adversarial ampliada e aceite operacional permanecem pendentes.
`ready: false` preservado, sem imagem publicada, commit, push ou deploy.
