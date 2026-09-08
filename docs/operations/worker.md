# Worker operacional

`npm run worker:operacoes` é um processo separado do HTTP MCP e exige `DATABASE_URL`. A cada `OPERATIONS_WORKER_INTERVAL_MS` ele calcula SLO por acesso sobre a janela configurada, cria/resolve alertas e procura anotações a revisar na timezone do acesso.

O worker não lê nem grava SQL, pergunta, parâmetros, resultados, senhas, tokens ou texto de anotação nos alertas. Revisão é manutenção: não muda vigência, cobertura, pacote publicado ou autorização de consulta.

Webhook é opcional e configurado por `configurar_webhook_operacional` com confirmação explícita. O destino deve ser HTTPS público, sem credenciais, query ou fragmento. URL e segredo são cifrados; cada entrega é assinada com `X-Plug-Event-Id`, `X-Plug-Timestamp` e `X-Plug-Signature-256`. A entrega é pelo menos uma vez: respostas não-2xx e falhas de rede recebem backoff com jitter e viram dead-letter após dez tentativas. `rearmar_webhook_operacional` rearma uma entrega do mesmo acesso com confirmação explícita.

A outbox usa lease no banco (`OPERATIONS_WEBHOOK_LEASE_MS`) antes de cada envio; assim dois workers não assumem a mesma entrega. A resolução DNS é validada ao configurar e novamente antes de enviar, e o IP público resolvido é fixado para a conexão HTTPS. Redirects são tratados como falha (não são seguidos).

As variáveis `OPERATIONS_SLO_*` são globais por ambiente. Defaults: janela de 15 min, mínimo 20 observações, atenção em erro 5%, p95 10 s ou truncamento 10%; crítico em erro 20% ou p95 30 s.
