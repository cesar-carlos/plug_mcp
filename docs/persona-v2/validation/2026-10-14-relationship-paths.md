# Templates e caminhos de relacionamento — 2026-10-14

Avanço da etapa 4 do [plano restante](../remaining-plan.md), complementando a
[biblioteca editorial](../knowledge-library.md). Não conclui o plano ou qualquer
gate de release. Os três manifestos permanecem bloqueados, sem gates aceitos.

## Implementação

Importação de template, adoção no console e snapshot de consulta conservam IDs
dos relacionamentos, intermediárias físicas qualificadas e sequência dos elos
N:N. O compilador exige caminho explícito e licencia somente JOINs dos elos
diretos, excluindo a relação conceitual do allowlist SQL. Caminho integra o
contrato concedido; grafo/contexto preservam referências e proveniência.
Snapshots compartilhados sem esses metadados exigem revisão/republicação, sem
reescrita de hashes ou ampliação automática de tokens.

Relação reversa 1:N fixa a FK na filha, com pares compostos ordenados. 1:1 exige
também PK/UNIQUE habilitada com cobertura suficiente; duas direções físicas
exigem nome de constraint inequívoco. Caminho físico exige todos os elos físicos
comprovados. Declaração editorial não substitui enforcement nativo.

Template continua criando somente rascunho privado, sem adoção compartilhada,
casos, publicação ou autoridade herdados; exemplos copiados ficam candidatos.
Dataset mantém versão/hash/proveniência e validação de tipos/decimais. DDL usa
gramática fechada, preserva declarações/unknown e nunca é executado.

## Cadeia real e isolamento

Fixture `se7e_persona_fe7347c348ea_test`, hub PostgreSQL/Prisma e aprovação real
de ClientAgentAccess, processo MCP separado, agente companion com Drift/cofre
Windows DPAPI/Socket.IO/ODBC/journal reais. SQL de negócio passou exclusivamente
por MCP → hub → agente, em bases descartáveis em loopback.

Três tabelas sintéticas, sem material Data7: rel_left, rel_link e rel_right,
com chaves compostas e IDs distintos nas extremidades. Cada motor inspecionou
essas tabelas pela policy de leitura explícita, publicou/consultou a ponte,
retornou três associações e recusou o atalho direto. Grafo preservou intermediária
e IDs dos elos. O observer registrou somente contagens/estados.

PostgreSQL, SQL Server e Firebird comprovaram as duas FKs na filha. Ação fixa do
companion removeu somente fk_rel_right após conferir a base privada; consulta
posterior foi recusada, sem entregar dados, por divergência estrutural.
SQL Anywhere recusou publicação dependente de enforcement desconhecido. Um
padrão separado, explicitamente revisado como relações de negócio, permitiu
consultar a ponte sem afirmar prova física; não houve fallback automático ou
remoção de FK nesse motor.

Os demais cenários da suíte passaram, incluindo dezesseis recursos paginados,
view, drift, consultas, cruzamentos, operações, confirmação perdida, journals,
reinício e revogação, dentro do alcance de fixture já documentado.

## Verificações

| Verificação                             | Resultado                                                       |
| --------------------------------------- | --------------------------------------------------------------- |
| Cadeia persistente, quatro motores      | 38/38, nenhum skip; 258,17 segundos                             |
| Regressão MCP                           | 1.250 passaram; 91 opcionais não executados na suíte padrão     |
| Integração PostgreSQL v2                | 194/194, incluindo importação persistente de template N:N       |
| Console, testes e build                 | 32/32; lint, tipos e build passaram                             |
| Chromium, console v2                    | 22/22, incluindo biblioteca/dataset/DDL e fluxo com duas fontes |
| Node/compilador                         | Node 24.21.0 e TypeScript 7.0.2 real                            |
| MCP estático                            | Lint, tipos, build e contrato/base fixados passaram             |
| Agente, arquivos do companion alterados | Análise estática sem problemas; execução nativa na cadeia acima |

Documentação, exemplos e formatação dos arquivos alterados foram conferidos.
Guard de release recusou publicação; os três manifestos mantêm ready false e
nenhum dos quatorze gates aceito.

Os 91 testes opcionais da suíte padrão não representam skip dos motores:
a cadeia nativa e a suíte PostgreSQL foram executadas separadamente. Não foram
executadas todas as famílias opcionais de aceite integral.

Uma repetição do web check sem TEMP privado falhou no cache SSR do sandbox antes
de carregar quatro suítes. Repetida com TEMP/TMP exclusivos do workspace, passou
integralmente; não houve alteração do produto ou flexibilização dos testes.

Motores reportados: PostgreSQL 17.0.11; SQL Server 16.00.4236; SQL Anywhere
16.00.0000; Firebird 06.03.1812 WI-V Firebird 5.0. Drivers: psqlODBC 18.00.0000,
SQL Server ODBC 2018.0186.0001.01, SQL Anywhere 16.0.0.2043 64-bit, Firebird ODBC
WI_T2.0.5.156 e fbclient WI-V5.0.4.1812. Hashes e contagens no
[inventário do candidato](2026-10-14-relationship-paths-files.json).

## Revisão e limites

Inventário fixa fontes, testes, contratos e entradas de build dos três projetos,
não apenas commits-base, no fechamento da rodada. Os checkouts contêm outras
alterações locais preexistentes/concomitantes; inventariá-las não certifica suas
jornadas, instalador ou interface desktop. MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f;
hub base bfb40becd42c5452b19b0df13698d212a0238ddc; agente base
37e36d86f1cf9e65438d4f60c48fa8ce6dc1e405. Contrato do hub permanece no snapshot
1.13.0 fixado; não foi alterado nem confundido com commit upstream.

Não houve alteração de migration aplicada, entrada principal ou runtime legado;
nenhum commit, push, publicação de imagem ou deploy. A fixture foi removida
especificamente após as validações, incluindo bancos, volumes, arquivos e DSN.
Nenhuma fonte cadastrada pelo usuário ou cofre operacional foi utilizada.

Ainda faltam enforcement SQL Anywhere, matriz integral de relações/constraints/
perfis, mínimos privilégios nativos, revogação/drift concorrentes, adoção em DML
e runners genéricos. 1:1 e ambiguidade foram testadas em unidades, sem homologar
todas as variantes físicas. Contas DBA de fixture não provam mínimos privilégios.
Chromium usou autoridade sintética própria: não comprova toda a jornada N:N no
navegador contra hub persistente, leitor de tela ou zoom real de 200%.
Companion não certifica instalador desktop, TLS/Redis distribuídos, quedas reais
durante commit, plugin privado ou avaliação da IA. Esses limites conservam todos
os gates pendentes de aceite integral e `ready: false`.
