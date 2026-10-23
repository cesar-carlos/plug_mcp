# Integração PostgreSQL persona-v2 — 2026-10-20

## Candidato

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, alterações locais.
Inventário local após a rodada, antes deste relatório:
`sourceSha256=e1c4f1f2c43eee3b6b647a237589905eeef86a31c680ed53689a37a2c10c359b`,
1075 arquivos, `authorizesRelease:false`.

## Execução

`npm run test:persona-v2:postgres`, pelo wrapper Node 24.
**321 testes passaram em 19 arquivos, sem omissões, em 203,49 segundos.**

Suítes: anexos, manutenção temporária, contexto de conhecimento, manutenção,
outbox, OAuth, publicação SQL, retenção de operações, curadoria física,
fundação PostgreSQL, reset de desenvolvimento, setup/delegação, conhecimento
compartilhado, identidade, ciclo/migrations de fontes, consultas, operações SQL,
composição estrutural e rotação do cofre.

## Ambiente e limpeza

PostgreSQL 17 e Redis 7 Alpine em containers próprios, nomes aleatórios,
portas exclusivamente locais e banco explícito se7e_v2_gate_test.
PERSONA_V2_TEST_DATABASE_URL e PERSONA_V2_TEST_REDIS_URL apontaram somente
para essas fixtures. Nenhum fallback para DATABASE_URL operacional.
Migrations v2 foram aplicadas pelas fixtures; o banco legado da outra rodada
ficou em outro container. Ao final, ambos os containers v2 foram removidos e
as variáveis de teste descartadas.

A suíte contém fixtures locais e autoridades/provedores sintéticos onde indicado
pelos testes. PostgreSQL real de controle não certifica transporte hub/agente,
SQL Server/SQL Anywhere, instalação desktop, imagem final, HTTPS/ChatGPT ou IA.
Não houve publicação, deploy, commit ou alteração do manifesto de aceite.

## Continuidade

Fecha a regressão PostgreSQL v2 desta revisão, não os gates integrais.
Repetição da cadeia persistente e candidato empacotado permanecem separados.
HTTPS/ChatGPT seguem manuais; ready:false permanece obrigatório.
