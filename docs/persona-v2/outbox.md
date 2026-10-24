# Outbox e notificações externas persona-v2

Disponível no runtime de desenvolvimento. Não usa webhook, segredo, sessão ou
fila legados e não libera deploy. O processo [worker v2](review-worker.md)
executa este quarto job independentemente de revisão, limpeza e retenção.

## Configuração e autoridade

O responsável Client autenticado configura um destino por persona no console,
em **Operações → Notificações externas**. A configuração exige confirmação humana,
CSRF, Host/Origin, revalidação da identidade no hub e CAS. Não há tool MCP nem
administração delegada desse destino. Uma sessão de outra pessoa ou autoridade
indisponível bloqueia alteração. SQL não é executado ao configurar/testar DNS.

Rotas sob `/api/admin/personas/:personaId/notifications`:

- GET: `{version, active, configured, events}`, sem endereço ou segredo.
- POST: `{expectedVersion, active, confirmed:true, events, destination?, secret?}`.
  Habilitar/alterar exige endereço e segredo novamente; desativar não exige ambos.
- GET `/deliveries?after=<uuid>`: vinte metadados de entrega e `nextCursor`.
  Cursor pertence à mesma persona. Não retorna corpo, endereço ou segredo.

Eventos selecionados explicitamente: `knowledge.review_due`,
`sql.operation_state` e `external.action_state`. Segredo de assinatura próprio
de 32 a 256 caracteres base64url, preenchido só no navegador; usar material
aleatório independente de credenciais de fontes, integrações, hub ou tokens MCP.
URL/segredo são cifrados no controle v2 e abrangidos pela rotação do cofre.
Novas entregas referenciam a versão exata do endpoint, sem duplicar credenciais
na fila. Alterar a configuração invalida essas referências pendentes.
Formulário descarta segredo após tentativa, protege edição pendente e não usa
armazenamento local. Configurar não envia mensagem de teste.

Alteração/desativação incrementa versão e encerra entregas pendentes da versão
anterior, na mesma transação da auditoria de metadados. Suspender persona desativa
a assinatura e encerra pendências; recuperar não a reativa. Destino novo não
recebe eventos históricos. Eventos já enviados não podem ser recolhidos.

## Conteúdo e persistência

Migrations aditivas `0032_notification_outbox.sql` e
`0033_notification_migration_guard.sql` acrescentam endpoint, metadados,
unicidade, guards e produtores transacionais. Filas anteriores sem
`notification_version` não são promovidas ou despachadas. Upgrade e rotação do
cofre são serializados; concluir a rodada do cofre antes do upgrade. O inventário
adiciona o endpoint ao final, preservando o significado de cursores antigos.

Criar tarefa de revisão privada e mudar estado de operação grava o evento na
mesma transação de origem. Rollback não deixa notificação. Unicidade fixa persona,
versão da assinatura e identidade/versão do evento. A migration
`0034_notification_event_namespace.sql` distingue os espaços de IDs SQL/externos:
o mesmo UUID nos dois journals não elimina uma das notificações.
Troca de cifra não gera evento.
A migration `0035_notification_credential_reference.sql` conserva cifras
históricas, mas novas linhas usam referência ao endpoint. Assim a criação do
aviso não tenta inserir uma cifra antiga enquanto o cursor de rotação ainda não
alcançou esse endpoint; registrar um estado/receipt não depende dessa posição.
O claim só resolve a versão vigente/autorizada e nunca retorna o segredo pela API.
Padrões e perfis de catálogos compartilhados mantêm somente notificação interna:
habilitar avisos da persona não concede exportação de metadados do catálogo.

O corpo JSON UTF-8 tem `schema: se7e.persona.notification.v1`, `id`, `personaId`,
`event`, `occurredAt` em UTC e `metadata`:

| Evento             | Metadados                                     |
| ------------------ | --------------------------------------------- |
| Revisão privada    | taskId, publicationId, calendarVersion, dueAt |
| Estado SQL/externo | operationId, state, version                   |

Não inclui nomes de pessoa/tabela/base, e-mail, instrução, SQL, perguntas,
parâmetros, resultados, payloads, fingerprints, receipts ou segredos. Estado
`resultado_desconhecido` é comunicado como tal; não prova efeito/rollback e não
autoriza retry. Notificação é conteúdo, nunca comando ou aprovação.

## Assinatura e transporte

POST HTTPS público, porta 443, sem query, fragmento, user-info ou redirects.
DNS é validado na configuração e em cada envio: todos os endereços devem ser
públicos; o IP escolhido fica fixado na conexão TLS, mantendo validação de
certificado/hostname. Não encaminha Authorization, cookies ou credenciais de
outras origens. Resposta aceita somente 2xx, sem compressão e até 8 KiB; conteúdo
retornado é descartado. Timeout total de cinco segundos inclui DNS e envio.
Não há bypass TLS/DNS por env em produção; fixture injeta CA/resolver próprios.

Headers:

```text
X-Se7e-Event-Id: <uuid permanente do evento>
X-Se7e-Timestamp: <segundos Unix desta tentativa>
X-Se7e-Signature-256: sha256=<hex HMAC-SHA256>
```

A entrada assinada é exatamente `eventId + "." + timestamp + "." + corpoUTF8`.
O receptor deve verificar HMAC em tempo constante sobre bytes recebidos, limitar
a idade do timestamp (por exemplo cinco minutos) e deduplicar pelo ID persistente
antes de aplicar efeitos. Corpo/ID permanecem iguais nas repetições; timestamp
e assinatura pertencem à tentativa. O receptor deve responder 2xx também para
duplicata já processada. O HMAC não cifra o conteúdo; HTTPS faz o transporte.

## Lock, orçamento e retomada

Cada claim usa transação curta, `FOR UPDATE SKIP LOCKED`, UUID de fencing novo e
lease de trinta segundos pelo relógio PostgreSQL. A tentativa é contabilizada
antes da rede. Dois workers podem trabalhar em eventos distintos; só o claim
vigente pode confirmar ou reagendar. Rede ocorre fora de locks/transações.
Não existe lock global que bloqueie todas as personas.

São até dez claims por ciclo, dez tentativas por evento e 24 horas desde a criação.
Backoff exponencial começa entre 15 e 30 segundos, com jitter e teto de uma hora.
Falha, resposta perdida ou reinício não zera orçamento. Claim abandonado expira
e outro processo assume o mesmo ID. Ausência de confirmação pode gerar duplicata:
a garantia é **pelo menos uma vez dentro do orçamento**, sem promessa de entrega
ou execução exatamente uma vez. Entrega não confirmada termina em `dead_letter`.
Não há rearmamento automático ou endpoint de retry de eventos terminais.

Antes do claim, depois do DNS/antes do POST e na confirmação, verifica persona,
assinatura/versão, evento selecionado e origem vigente. Tarefa encerrada/calendário
substituído e estado de operação já superado não geram aviso atual. Versões que
mudam só por retenção não apagam um estado ainda vigente. Configuração/suspensão
podem competir com um POST já iniciado; revogação não cancela retroativamente um
envio. A verificação não constitui atomicidade distribuída ou reserva de autoridade.

SIGINT/SIGTERM param novos ciclos e aguardam o ciclo atual. Queda abrupta deixa
claim durável até expirar. Confirmação fora do lease é ignorada; não sobrescreve
o sucessor. Logs têm somente contagens/estágio; falhas armazenam códigos fechados,
sem mensagens de transporte, URL, resposta ou corpo. IDs e tombstones terminais
permanecem; o corpo segue a retenção abaixo. Nunca se tornam operações de negócio executáveis.

A parada está registrada antes do primeiro ciclo e impede os próximos jobs e
claims do lote. Depois do DNS, um claim ainda não enviado também reconfere se o
worker está parando. POST iniciado pode chegar ao receptor e será finalizado
localmente quando possível; queda/perda da confirmação conserva a possibilidade
de repetição do mesmo aviso. Nenhum desses eventos repete a operação original.

## Retenção dos metadados

A migration aditiva 0041 registra o encerramento local pelo relógio PostgreSQL.
Entregas já encerradas começam a janela na migração; a data real anterior não é
inferida. O job de limpeza temporária remove corpo de metadados e cópias antigas
de destino/segredo após 90 dias, em lotes de cem, sob lease e locks.
Migration 0042 conserva o horário de encerramento mesmo em UPDATE sem mudanças;
somente a transição de pendente para terminal inicia o prazo.

ID, persona, tipo, chave de deduplicação, referências, estado, tentativas e
horários permanecem como tombstone. Não apaga identidade nem rearma entrega;
eventos pendentes nunca entram. A data de limpeza é fixada pelo banco e não
aceita alteração posterior. Configuração ativa do endpoint conserva seu próprio
segredo; a limpeza não altera journals SQL/externos ou resultados desconhecidos.
Uma notificação encerrada de operação desconhecida pode perder seus metadados:
isso não altera o estado permanente da operação original.

## Limites do aceite

Na [rodada com duas instâncias](validation/2026-10-16-worker-outbox-multi-instance.md),
dois processos usam a composição dos quatro jobs, com falhas, reinício e espera
pelo lease PostgreSQL real. Ledger do receptor serializa recebimentos, confere
HMAC/idade e conserva um efeito por ID, mesmo com entrega duplicada. IPC exercita
a parada compartilhada; Windows encerra abruptamente processos por `kill`,
portanto isso não certifica sinais POSIX ou um gerenciador instalado.

Fixtures PostgreSQL/TLS nativos, dois workers e queda de processo não certificam
HTTPS público, operação distribuída instalada ou integração com receptor real.
Essas evidências e acompanhamento operacional
ampliado continuam separados. HTTPS público e ChatGPT permanecem para validação
manual. `ready: false` permanece obrigatório.
