# Lista delegada de propostas físicas próprias — 2026-10-19

## Entrega

listar_minhas_propostas_particularidade recebe skillId e before opcional. Lista
até vinte referências por página no perfil publicado concedido. Filtros no
PostgreSQL incluem catálogo, identidade/base física, perfil, persona, fonte,
skill, token e conexão. A concessão é lida do payload imutável já existente;
não modifica migrations aplicadas ou propostas anteriores.

Cada página revalida autoridade editorial e acesso remoto à mesma base, além
do hash das propostas. Retorna estado/hash/datas, sem conteúdo, identidade
interna ou revisão do curador. Cursor pertence ao mesmo escopo. Ordem por ID
não promete cronologia ou snapshot. Não lista a fila geral, incorpora ou publica.

## Validação

**6 testes aprovados em 110,82 segundos**, modo Prisma, nas inspeções e adoções
publicadas de PostgreSQL, SQL Server e SQL Anywhere. 73 demais casos excluídos
pelo filtro explícito; não é aceite integral da matriz.

Para cada skill, envia 21 propostas físicas e compara as duas páginas com todos
os IDs enviados. Verifica campos permitidos, outro token equivalente com lista
vazia, cursor de outro token recusado, cursor da lista de padrão recusado e
continuação bloqueada após revogação diretamente no hub, ainda com registro
local ativo. Autoridade Client/delegação, hub Prisma e agentes são reais.
SQL/inspeção passam exclusivamente por MCP → hub → agente.

Tipos, lint, formatação, build, training:check e documentação passaram.
O recorte é Bearer; isolamento entre conexões OAuth desta nova lista ainda exige
homologação específica. Não mede carga de catálogo grande, imagem final ou IA.

## Candidato e limpeza

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
Hub 0dc94d6990167f65e093b1fb68a8150630e2057c; agente
3b4f099e64a319a100cd93e00667ffca4afef732. Node 24 pelo wrapper. Provisionador usa
PostgreSQL 17, SQL Server 2022 Developer e SQL Anywhere 16; versões exatas dos
drivers não foram transcritas antes da limpeza.

Teardown encerrou processos e confirmou remoção somente dos recursos próprios,
incluindo contêineres, SQL Anywhere e DSN privado. Material sintético, sem fontes
operacionais. Sem migrations, alterações do hub/agente, commit, push ou deploy.
HTTPS/ChatGPT manuais; ready:false e gates abertos.

| Arquivo                                                        | SHA-256                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| src/domain/persona-v2/physical-curation.ts                     | 99353ff7a686b6b37966590af4fe8b7df932c679a0ba11b9d6b3213aae859787 |
| src/application/persona-v2/physical-curation.ts                | 19eaf28157fa97f9bb33a77bffcc0eb21e450e3bd9cc33b69b55bd7c6331a83f |
| src/infrastructure/persistence/persona-v2/physical-curation.ts | d0b52d79765646cb7e024fb7e43dd02b96d45847ad78cbebe49408ed93b5eaab |
| src/infrastructure/mcp/persona-v2-administration-tools.ts      | a39d521e59461ea87b0fb9c784bf46dbde960a33374fe38354a15bb3cfc2f53d |
| tests/homologation/persona-chain.test.ts                       | 1123e8f4bfa52ea2b4ba5fdceae0b35f3f1e947e6d14f81b0aad0204c20207a1 |
