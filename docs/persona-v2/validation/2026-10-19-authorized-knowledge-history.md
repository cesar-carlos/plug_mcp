# Histórico autorizado de versões compartilhadas — 2026-10-19

## Entrega

`listar_historico_conhecimento({skillId,afterSkillId?})` lista vínculos de versões
do mesmo padrão ainda adotadas por consultas ativas e concedidas. Cada vínculo
retorna skill/publicação, fonte, versão/hash/data do padrão e referências de
perfil quando existentes, sem conteúdo. A âncora também exige autorização.

O histórico integral já existe no console para membros autorizados do catálogo.
Esta tool não o delega: uma versão antiga só aparece se ainda houver uma skill
ativa concedida que a utilize. Publicação nova não é adotada automaticamente.
Comparação delegada e outros tipos de skill permanecem pendentes.

Locks de catálogos em ordem estável precedem as verificações. Autorização de
cada vínculo e paginação ocorrem na mesma transação. Até vinte vínculos, revisão
decrescente e desempate por ID da skill. Cursor oculto/revogado é recusado;
não há total global nem snapshot entre páginas. Nenhuma migration necessária.

## Validação

**14 testes aprovados em 9,30 segundos** nas suítes
`structure-composition.postgres.test.ts` e `knowledge-context.postgres.test.ts`.
PostgreSQL 17 efêmero; identidade e inspeção remotas simuladas. Não certifica
cadeia persistente, três motores, OAuth, console ou IA consumidora.

Cobertura adicionada: duas versões adotadas e 21 skills; duas páginas sem
duplicação; token concedido somente à versão anterior; âncora/cursor não
concedidos recusados; terceira versão publicada sem adoção permanece oculta;
suspensão remove vínculos e invalida cursor; token revogado perde acesso.
A tool também foi chamada pelo transporte MCP. Nenhum exemplo ou SQL de
negócio foi executado.

Tipos, lint dirigido, build e formatação passaram. Documentação, regras,
instruções do runtime e plano restante foram sincronizados. Banco de controle
e contêiner isolados removidos no finally; nenhuma fonte operacional usada.

## Candidato e limites

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` mais alterações locais.
Node 24 pelo wrapper e TypeScript 7. Hub/agente não alterados. Não foi executada
homologação de carga ou revogação concorrente nesta rodada. HTTPS/ChatGPT seguem
manuais; sem commit, push, publicação ou deploy. ready:false e gates abertos.

| Arquivo                                                 | SHA-256                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| src/application/persona-v2/consumer-catalog.ts          | 334a152bb15b11d90f0d9380b95cdc38a97800065a661d1eb97c4b9f878c12de |
| src/infrastructure/mcp/persona-v2-http.ts               | dde1be9fde63ee9ed2648c0dceec6d98b8642a2f6c13b4dd33551470a95c945b |
| tests/persona-v2/structure-composition.postgres.test.ts | 38208e29b0f6dc60214cbd2af88aa7d375541fc7271f7cb5bf46c8b7f5ab3bfd |
