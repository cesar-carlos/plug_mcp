# Casos e relatórios de consultas por consumidor — 2026-10-19

## Entrega

`obter_testes_skill` e GET administrativo do consumidor aceitam `kind: consulta`.
Reutilizam autorização e compilação do catálogo: treinar, delegação atual,
consentimento OAuth e fontes concedidas. Retornam casos, revisão/hash e relatórios
paginados, marcando evidência obsoleta após mudança de conteúdo ou casos.
Não executam consulta/runner, gravam relatório ou aprovam publicação.
Edição CAS dessa ferramenta continua exclusiva de operação SQL/cruzamento.
[Contrato](../catalog.md#casos-e-relatórios-por-administração-delegada).

## Verificação

- Suíte completa de setup/delegação: 72 testes passaram, sem omissões, em
  47,62 segundos. Node 24.21.0, PostgreSQL 17 Alpine dedicado e autoridade sintética.
- Novos casos cobrem MCP/HTTP, cursor inválido, tipo divergente, fonte oculta,
  outra persona, consentimento OAuth sem fonte e revogação remota.
- Vinte relatórios por página, sem repetição entre páginas; mudança de casos
  marca relatórios anteriores como obsoletos. Relatórios de fixture são metadata
  deliberadamente reprovada, sem alegar execução SQL ou aprovação de evidência.
- Lint dirigido, tipos, formatação e build passaram.

A primeira rodada passou em 71 testes e falhou na expectativa de status para
tipo divergente: o contrato existente usa INVALID_PLAN/409, não 400. Corrigida
a expectativa, a suíte inteira foi repetida, incluindo isolamento/revogação.

## Identificação e limites

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
SHA-256 do catálogo:
`356a46b93c2f5e36bda2922a03b3d7ad1c39bdbc1d0db86ed9f50a895c09fe35`.
SHA-256 da suíte:
`03a66aa89df73de5b33d53865c3f6a27ceeba97ef98d1fcf9ea37bcb94830ee7`.

Sem migration ou mudança pública no hub. Nenhuma fonte operacional foi usada.
Bancos temporários removidos pela suíte; contêiner e volume próprios removidos
após conferência do identificador e rótulo da fixture.
Não certifica runner real, cadeia instalada dos três motores, console, HTTPS,
ChatGPT ou IA. Aceite integral continua pendente; ready:false e gates abertos.
