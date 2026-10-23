# Publicação com prazo e manutenção pelo worker persona-v2

Disponível somente em desenvolvimento; não substitui o worker legado ou encerra
os gates de produção. [Calendários e autoridade](shared-knowledge.md#feedback-e-revisão-temporal).

## Prazo obrigatório na publicação

Novas publicações de padrão, perfil e skill exigem prazo futuro escolhido pelo
curador/responsável. Prévia administrativa aceita `reviewDueAt` em UTC, sem
default. A interface pede horário local e mostra a data da prévia. API de padrão
e skill usa o corpo `{reviewDueAt}` em `/preview`; perfil acrescenta esse campo
ao contrato com catálogo, perfil e evidência existentes. Confirmação conserva o
hash da prévia; não aceita alterar o prazo por fora da revisão.

O plano vincula tipo, rascunho, revisão, hash, escopo, responsável, prazo e versão.
Mudança de conteúdo/revisão ou prazo exige nova prévia. Prazo vencido antes da
confirmação impede publicar. Calendário inicial e publicação são gravados na mesma
transação, com autoria e auditoria de metadados. Não há janela com publicação nova
confirmada sem calendário. Snapshots/hashes publicados e migrations anteriores
não são alterados; versões históricas sem calendário continuam não configuradas.

Consumidor delegado não escolhe datas: o responsável define antes o prazo da
revisão atual no console ou por POST de sessão Client em
`/api/admin/personas/:personaId/skills/:skillId/prazo-revisao`, com `{dueAt}`.
Essa ação exige autoridade humana de publicação, fonte/conteúdo vigentes e CSRF.
As tools de revisão/publicação reutilizam somente esse plano exato e as concessões
atuais. Editar por token não transfere o prazo para outra revisão do rascunho.
Configurar prazo não aprova significado, casos de teste ou operações SQL.

## Processo e tarefas

A limpeza temporária também reduz metadados de notificações encerradas há
90 dias, em lotes e pelo relógio PostgreSQL. Preserva tombstones/deduplicação
e não altera pendências ou journals. [Retenção da fila](outbox.md#retenção-dos-metadados).

`npm run worker:persona-v2` inicia `src/worker-persona-v2.ts`. Exige banco MCP v2
dedicado com migrations/checksums atuais; startup não migra ou reseta. Recusa
`NODE_ENV=production` enquanto o runtime v2 permanece bloqueado. O servidor HTTP
não inicia ciclos implicitamente. Intervalo: `PERSONA_V2_REVIEW_WORKER_INTERVAL_MS`,
padrão técnico de 60 segundos, entre 1 segundo e 1 hora. Intervalo não define
prazo de revisão de conhecimento.

Migration aditiva 0020 acrescenta planos/prévias, tarefas, notificações internas,
leitura por responsável e lease. Cada ciclo assume lease de trinta segundos com
identidade opaca da instância. Confere proprietário/prazo sob lock e novamente
antes do commit; claim abandonado pode ser retomado após expiração. SIGINT/SIGTERM
interrompem novos ciclos, aguardam o atual e fecham a conexão.

Revisão, limpeza e retenção calculam a expiração pelo relógio PostgreSQL, com
duração positiva limitada a trinta segundos. O horário recebido da aplicação
não permite tomar um lease vigente ou estendê-lo indefinidamente. A revisão
também usa o relógio do banco para criar/encerrar tarefas, sem antecipar prazos
ou encerrar tarefas vigentes por diferença entre relógios das instâncias.

Os quatro jobs compartilham a mesma composição e um ciclo sem sobreposição por
processo. Handlers de encerramento são registrados antes do primeiro ciclo.
A parada aguarda o job atual, impede os seguintes e interrompe novos claims do
lote de outbox; confirma o envio já iniciado quando houver resposta válida.
Queda abrupta conserva leases/claims. PostgreSQL pode detectar um cliente morto
somente depois que uma consulta bloqueada retorna; isso não promete cancelamento
imediato. A transação sem commit será desfeita quando a conexão for encerrada.

Por ciclo, até cem tarefas obsoletas são encerradas e até cem vencimentos vigentes
são materializados. Leituras usam locks e `SKIP LOCKED`; unicidade por publicação/
versão do calendário impede duplicações. Tarefa e notificação são gravadas na mesma
transação. Reinício não repete a notificação daquela versão. Novo prazo/revisão,
suspensão ou indisponibilidade local do alvo encerra a tarefa no próximo ciclo.
Isso não muda calendário, publicação, concessões ou resultado de operações.

O worker usa exclusivamente metadados do controle MCP. Não abre ERP, não usa
credenciais das fontes, não executa SQL de negócio, não publica ou aprova e não
repete escrita incerta. Métricas/logs têm contagens/estágio, sem conteúdo editorial
ou dados consultados.

## Limpeza de dados temporários

O mesmo processo executa um segundo job, com lease independente de trinta segundos
e identidade opaca por instância. O intervalo configurado também rege esse job;
não cria prazo de revisão nem prolonga sessões. Falha no job de revisão não impede
a tentativa de manutenção. Startup exige a migration aditiva
`0028_ephemeral_worker.sql`, sem aplicar DDL automaticamente.

Cada ciclo remove até cem registros por tabela: setups expirados e prévias
expiradas de skills, padrões, perfis e curadoria comum/física, além de anexos
cifrados expirados do armazenamento compartilhado. A remoção de anexo confere
também o relógio do banco; prazo futuro fornecido ao worker não antecipa limpeza.
Não decifra, renova ou recria arquivos. Remove também até
cem vínculos de prazo sem prévia correspondente. Prévia vigente e plano de revisão
do rascunho são preservados. Não altera publicações, calendários, propostas,
concessões ou auditoria.

Registros OAuth sem concessão são removidos após expiração. Registros vinculados
a uma concessão só são removidos quando **ambos** os prazos, do registro e da
concessão, vencerem. Isso conserva códigos consumidos e refresh tokens necessários
para detectar replay e revogar a família, inclusive depois do prazo individual do
código. Concessões e sua revogação permanecem registradas. O job não decifra
conteúdo, estende prazos ou emite tokens. Ausência de registro continua recusando
o link/código/token; não habilita uma operação.

Lotes usam ordenação estável, locks e `SKIP LOCKED`; linhas ocupadas ficam para
outro ciclo. Lease é conferido sob lock e novamente antes do commit; perda de
validade desfaz o lote inteiro. Uma instância antiga não libera o lease de outra.
Logs informam apenas estágio, claim e contagem. Rotação de chaves pertence ao
comando de operador separado; [outbox externa](outbox.md) tem job próprio. Nenhum journal, payload
de operação SQL/externa ou identidade contra repetição é removido por esse job.

## Retenção de operações

O terceiro job do mesmo processo trata somente conteúdo operacional das tabelas
v2 de operações SQL e ações externas. Tem lease próprio de trinta segundos,
lotes de até cem payloads e cem comprovantes por tabela, ordenação estável,
`SKIP LOCKED` e revalidação antes do commit. Falha de lease desfaz o lote inteiro;
os jobs de revisão, limpeza temporária e retenção falham independentemente.
O intervalo do processo determina a tentativa, sem garantir remoção no instante
exato do vencimento em presença de carga ou linhas bloqueadas.

A migration aditiva `0029_operation_retention.sql` grava `terminal_at` pelo
relógio do PostgreSQL quando há desfecho conhecido. Após 24 horas, remove
`payload_enc` e, nas ações externas, `result_enc` juntos. Após 90 dias, remove
o comprovante, somente se o conteúdo operacional já tiver sido removido.
Os prazos são fixos nesta entrega; input, receipt upstream e relógio da aplicação
não podem antecipá-los. Registros históricos sem esse relógio imutável começam
o prazo na migration, conservadoramente; seu conteúdo não é apagado no upgrade.

São elegíveis `concluida`, `rollback_confirmado`, `cancelada`, `recusada` e
`expirada`, conforme o tipo da operação. `resultado_desconhecido`, `executando`,
`cancelamento_solicitado` e preparações/aprovações ainda pendentes conservam
conteúdo. Evidência de conciliação comercial não torna um estado desconhecido
elegível. Se o journal SQL posteriormente comprovar o desfecho, o novo prazo
começa nessa transição local; não usa a idade da preparação.

As linhas dos journals nunca são removidas: permanecem ID, fingerprint, estado,
origem, vínculos, versão e metadados mínimos contra repetição. Triggers impedem
DELETE, antecipação/falsificação dos marcadores, alteração do conteúdo preparado
e restauração de payload/receipt removidos. A remoção incrementa versão por CAS,
sem mudar o estado ou `updated_at`. Aprovações, auditoria e evidência de conciliação
continuam preservadas; nenhum novo dispatch ou chamada externa ocorre no job.

Respostas autorizadas incluem `retention` com `terminalAt`, `payloadPurgedAt` e
`receiptPurgedAt`. Ausência de comprovante sem marcador não é tratada como
remoção. Consulta de ação externa distingue `dataAvailability: retained`,
`purged` e `not_available`. Revisão administrativa após remover o payload devolve
contrato, parâmetros e limites nulos; o console mostra aviso e mantém o estado.
Não recupera conteúdo pela rede nem fabrica resposta ou receipt. Todos os portões
de leitura e revogação continuam ativos.

## Notificações e autoridade

Notificações internas aparecem no calendário do console após recarregar, com prazo,
versão, estado e leitura. Revisões privadas também podem gerar [outbox externa](outbox.md)
quando o responsável configura explicitamente um destino e seleciona esse evento.
Padrões e perfis de catálogos compartilhados permanecem somente na caixa interna.
Não há envio de e-mail ou configuração automática de destino.

A resposta administrativa do calendário inclui `notifications`: as vinte mais
recentes e indicação de corte. POST `/revisao/notificacoes/:taskId/lida` com `{}`
marca leitura individual do responsável, de forma idempotente. A rota mantém os
portões do alvo: proprietário da persona, curador do catálogo e, para perfil,
acesso remoto atual à mesma base. Conhecer ID de tarefa não amplia visibilidade.
Revogação impede leitura/marcação; o worker não concede acesso por criar a tarefa.

Marcar como lida não conclui revisão. Apenas a decisão humana com novo prazo e
CAS atualiza calendário; worker encerra a tarefa anterior. Uma notificação pode
ser criada perto de uma suspensão concorrente, mas a entrega é reautorizada.
Vencimento nunca suspende SQL automaticamente. Consumer MCP continua recebendo
somente avisos das origens concedidas, sem filas ou justificativas do catálogo.

Rotação de chaves é um [comando separado de operador](vault-rotation.md), com
simulação e retomada; não é executada pelo worker. Homologação operacional
instalada da retenção/rotação, Redis e receptor externo permanece pendente.
A [rodada com duas instâncias](validation/2026-10-16-worker-outbox-multi-instance.md)
exercita quatro jobs, falhas, queda e retomada em processos/fixtures locais;
não certifica a frota ou encerra gates. O quarto job de [outbox](outbox.md) faz entrega assinada de
metadados com lease por evento, fencing e retomada; não usa os leases dos outros
jobs. Esses jobs de desenvolvimento não encerram gates.

## Saúde local e parada

`PERSONA_V2_WORKER_HEALTH_PORT=0` desabilita o listener por padrão. Quando
configurado, somente `127.0.0.1` aceita `GET /health`; a resposta contém apenas
`status`, com `Cache-Control: no-store`. Não há porta publicada pelo compose.
O probe não acessa banco, reivindica lease ou executa jobs.

Retorna 200 somente após um ciclo integral sem exceções. Antes disso retorna
503 (`starting`); falha em qualquer job produz `degraded`, sem impedir os demais
jobs. A recuperação exige novo ciclo integral bem-sucedido. Ausência de ciclo
concluído por mais que o intervalo configurado mais dois minutos produz `stale`,
medido por relógio monotônico. Um primeiro ciclo travado continua não saudável.
Lease ocupado por outra instância não é falha: saúde não promete posse de lease,
entrega de notificação, ausência de dead-letter ou aceite da plataforma.

SIGINT/SIGTERM fecham o listener e impedem novos jobs/claims, aguardando o trabalho
atual antes de fechar o pool. O compose confere saúde local e concede trinta
segundos para parada; atingir esse limite pode interromper o processo. Isso não
prova rollback nem permite repetir efeitos incertos. Estado unhealthy não executa
retry ou reinício automático. Supervisor e homologação instalada continuam pendentes.
