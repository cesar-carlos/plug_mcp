# Worker e outbox com duas instâncias — 2026-10-16

Evidência parcial de desenvolvimento, sem aceite de produção. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub fixado em
`76950497dc386130e13b7d6afc0678e50208e985` e agente base
`7d00ae8a8f822605d76e775fb5659f27e29df539`, com alterações locais preservadas.
O [inventário SHA-256](2026-10-16-worker-outbox-multi-instance-files.json)
identifica arquivos e dependências desta rodada; não representa commit ou
candidato integral. Não houve branch, commit, push, imagem ou deploy.

## Correções

- Revisão, limpeza e retenção calculam lease pelo relógio PostgreSQL, com
  duração positiva de no máximo trinta segundos. Relógio de aplicação adiantado
  não toma lease vigente; atrasado não produz lease já vencido. Confirmação e
  liberação continuam vinculadas ao proprietário atual.
- Revisão usa o relógio PostgreSQL também para criar/encerrar tarefas. Relógio
  adiantado não antecipa o prazo escolhido pelo curador; relógio atrasado não
  encerra uma tarefa ainda vigente. Não altera calendários/snapshots publicados.
- Composição dos quatro jobs é compartilhada entre a entrada de desenvolvimento
  e a fixture de processos. Ciclos do mesmo processo não se sobrepõem; falha de
  um job é sanitizada e não impede os seguintes. Rede continua fora da transação.
- Encerramento fica registrado antes do primeiro ciclo. Parada aguarda o job
  atual e impede próximos jobs/claims; outbox reconfere parada antes do envio
  após DNS. POST iniciado pode chegar ao receptor e ser confirmado localmente.
- Ledger TLS da fixture serializa POSTs concorrentes, grava por substituição
  de arquivo e confere ID/corpo, HMAC e idade da assinatura. Cada ID tem um efeito
  deduplicado e contagem separada de recebimentos; não perde eventos por corrida
  de leitura/escrita nem esconde duplicatas.

Não há migrations, novas tools ou mudanças nos runtimes/armazenamentos legados.
Auditoria/logs continuam somente de metadados. Worker nunca publica treinamento,
aprova lançamento ou repete uma operação de negócio.

## Ambiente e cenários

Fixtures Docker exclusivas `se7e-worker-9e5e4bf1f4a5` e
`se7e-worker-5c275d720731`, labels das rodadas `9e5e4bf1f4a5` e `5c275d720731`,
PostgreSQL **17.11**, acessível apenas em loopback. A URL explícita
de teste usa `persona_worker_test`; cada família cria/remove seus bancos aleatórios
com sufixo `_test`. Configuração Client sintética serve somente ao cadastro do
destino da fixture. Nenhuma credencial, cofre, fonte ou banco operacional foi lido.

Dois processos Node independentes usam o PostgreSQL e a composição real dos
quatro jobs. Apenas o resolver/CA do transporte aponta ao receptor HTTPS local;
não existe bypass por configuração de produção. Inicialização verifica migrations
e keyring. IPC inicia/para o ciclo; queda abrupta encerra efetivamente o processo.

Casos adicionais:

1. Falha nativa durante a criação de tarefas provoca rollback, sem impedir
   limpeza de setups, retenção ou outbox. Depois de remover a falha e reiniciar
   duas instâncias, seis revisões geram seis tarefas/avisos internos e um aviso
   externo por evento. Novo reinício não duplica. Operação desconhecida conserva
   estado, payload, versão e ausência de terminal local.
2. Queda durante POST deixa claim/tentativa duráveis. Segunda instância espera
   os **trinta segundos reais** do lease PostgreSQL, assume o mesmo ID e corpo,
   registra a segunda tentativa e confirma a entrega. Dois recebimentos no
   receptor produzem um único efeito deduplicado, sem executar lançamento.
3. Parada durante o primeiro POST aguarda a confirmação e deixa o próximo
   evento sem claim. Processo sucessor entrega a pendência uma vez.
4. Queda durante DELETE de limpeza, bloqueado por gate exclusivo da fixture,
   deixa a transação sem commit. Após liberar o gate, PostgreSQL detecta a
   desconexão e desfaz o lote. Segunda instância espera lease real e remove as
   duas pendências sem duplicar revisão/notificação ou alterar operação preparada.
5. Relógios adiantados/atrasados não roubam leases, excedem trinta segundos ou
   antecipam revisão; proprietário antigo não processa/libera o lease sucessor.
   Duração inválida é recusada.
6. Dois processos enviam dois eventos distintos enquanto as duas respostas TLS
   estão retidas. Há dois claims diferentes ativos e uma tentativa por evento;
   cada worker confirma sua entrega. Isso comprova paralelismo sem lock global.
   O ledger conserva ambos os IDs, um recebimento e um efeito por ID.

A suíte mantém casos anteriores de fencing, assinatura/CSRF/CAS, revogação após
DNS, suspensão/recuperação, perda de resposta, dez tentativas/backoff/dead-letter,
origem superada, atomicidade, limites/SSRF e rotação do cofre. Retenção cobre
24h/90d, rollback por expiração, concorrência e tombstones; manutenção preserva
OAuth necessário ao replay. Curadoria física mantém seus portões próprios.

## Resultados e reprodução

Usar scripts/with-project-node.ps1 e `PERSONA_V2_TEST_DATABASE_URL` explícito
de fixture. Não usar `.env` ou DATABASE_URL operacional. A matriz nativa é:

```text
npx vitest run --config vitest.persona-v2.config.ts tests/persona-v2/notification-outbox.postgres.test.ts tests/persona-v2/ephemeral-worker.postgres.test.ts tests/persona-v2/operation-retention.postgres.test.ts tests/persona-v2/physical-curation.postgres.test.ts
```

| Verificação                             | Resultado                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Matriz nativa completa, quatro arquivos | **38/38**, **101,16 s**, sem skips                                                                |
| Ciclo/encerramento e guardas de release | **5/5**, **1,91 s**                                                                               |
| Regressão geral MCP nativa              | **1.470 aprovados, 91 não executados**, 161 arquivos aprovados/seis não executados; **73,10 s**   |
| Runtime/compiler                        | Node **24.21.0**, TypeScript real **7.0.2**                                                       |
| Gates locais                            | lint, tipos, build, formatação, docs:check, node:check, compiler:check e training:check aprovados |

As não execuções da configuração geral são preexistentes e não certificam
ambientes obrigatórios. A matriz nativa desta frente não teve skips. Totais
sobrepostos não são somados. A proteção contra encerramento por relógio atrasado
também é conferida explicitamente no cenário de relógios divergentes.
Confirmação seletiva após acrescentar essa asserção: **1/1, 4,04 s**, com quinze
casos deliberadamente excluídos pelo filtro. Código funcional é o mesmo da
rodada completa; essa repetição não substitui sua matriz.

Rodada intermediária: 26/26 nos três arquivos iniciais; ampliação incluiu o
cenário de queda dentro da transação. A primeira tentativa desse cenário supunha
que PostgreSQL detectaria imediatamente o cliente morto enquanto aguardava lock.
A fixture foi corrigida para liberar seu próprio gate e conferir a desconexão,
rollback e retomada reais. Confirmação seletiva: **1/1, 35,50 s**, com quinze
casos deliberadamente excluídos pelo filtro; não substitui a rodada completa.

A suíte geral no sandbox foi recusada por restrições a módulos temporários,
TCP local e Git de fixture. A repetição nativa preservou os mesmos testes;
nenhuma exigência foi retirada ou transformada em skip para fazê-los passar.

## Limites e liberação

Limpeza confirmada: bancos derivados removidos pelos testes; banco-base conferido
antes de remover os containers e seus volumes anônimos exclusivos. Labels, nomes e raízes
temporária foram verificados antes da remoção. Nenhum processo ou recurso da
fixture desta rodada permanece ativo; a chave/senha sintéticas não entram no relatório.

Este worker usa somente o banco de controle MCP e metadados; não chama hub,
agente ou bases de negócio. A rodada não é homologação da cadeia SQL dos três
motores, instalação desktop, proxy/Redis/frota instalados, restauração de backups,
receptor externo real, carga ou todas as partições possíveis. Rodadas históricas
dos motores não são reapresentadas como prova do candidato atual.

IPC exercita a mesma parada do ciclo. Windows `kill` encerra abruptamente;
não certifica SIGTERM de um supervisor POSIX. Cliente morto não garante
cancelamento imediato de SQL ou POST; uma notificação pode chegar antes da
perda de confirmação. Receptor precisa deduplicar, e a fila mantém orçamento.
Não existe garantia de exatamente uma vez ou repetição da operação original.

HTTPS público e ChatGPT permanecem para validação manual. Manifestos dos três
projetos conservam `ready:false`, treze gates exigidos e nenhum concluído.
Esta evidência não libera deploy nem publicação de imagens.
