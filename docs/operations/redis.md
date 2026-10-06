# Redis 7: configuração e diagnóstico

O servidor Redis do projeto usa `redis:7-alpine` no `docker-compose.yml` e na CI. O pacote npm `redis` 6.3.0 é o cliente Node: sua versão não indica a versão do servidor. As versões instaladas estão em `package-lock.json`; a versão efetiva do servidor é obtida com `INFO server`. A tag `7-alpine` acompanha patches da linha 7.

## Escolher a conexão

| Execução do MCP            | Redis                              | `REDIS_URL`                           |
| -------------------------- | ---------------------------------- | ------------------------------------- |
| Node/PM2 no host           | Compose com overlay de porta local | `redis://127.0.0.1:6379`              |
| Container `mcp` no Compose | Serviço `redis` na rede interna    | `redis://redis:6379` (já configurado) |
| Sem Redis                  | Memória do processo                | Vazio (padrão do `.env.example`)      |

O Compose padrão não publica a porta do Redis no host. O nome `redis` é resolvido dentro da rede do Compose; Node/PM2 no host precisa de uma porta publicada e do endereço local. Iniciar o container não altera o `.env` nem a configuração do processo já em execução.

## Node/PM2 no host

Execute na raiz do projeto:

```bash
docker compose -f docker-compose.yml -f docs/operations/redis-host.compose.yml up -d postgres redis
```

O overlay publica somente `127.0.0.1:6379`. Configure no `.env`:

```dotenv
REDIS_URL=redis://127.0.0.1:6379
```

Reinicie o processo Node para carregar a configuração. Para PM2:

```bash
pm2 restart ecosystem.config.cjs --update-env
```

Se a porta 6379 estiver ocupada, ajuste a porta do host no overlay e em `REDIS_URL` para o mesmo valor.

## MCP no container

O serviço `mcp` já usa `redis://redis:6379` e aguarda o healthcheck do Redis. Não precisa do overlay de porta local. Siga o setup e as migrações descritos no [README](../../README.md) antes de iniciar o MCP.

## Confirmar o servidor em execução

```bash
docker compose ps redis
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli INFO server
npm ls redis --depth=0
```

`ping` deve responder `PONG`; `INFO server` deve informar `redis_version:7.x.x`. O último comando mostra a versão do cliente npm. `docker compose ps` sem Redis ativo indica apenas configuração disponível, não um servidor em uso. `/ready` verifica PostgreSQL e não certifica a conexão Redis.

## Uso e limites

Com `REDIS_URL` vazio, rate limit, cache e singleflight ficam em memória. Com URL configurada e OAuth desligado, `compose()` mantém a conexão Redis durante a inicialização: uma URL inacessível pode impedir o startup. No piloto OAuth, a conexão tem limite de 5s e falha usa quotas/cache locais; falha posterior de rate limit preserva contadores locais já consumidos. Não há fila offline nem reconexão automática nesse modo: recuperar coordenação distribuída exige reiniciar. A autoridade OAuth permanece no PostgreSQL.

Redis coordena rate limit, caches auxiliares e resultados agregados, além de leases de consultas iguais entre processos. Não replica sessões MCP nem guarda bytes dos handles de anexos. Uma instalação com clientes legados mantém sessão no processo; usar Redis não habilita cluster PM2.

O cache isola usuário, acesso, token, policy e publicações. Antes da entrega, os três portões do hub são revalidados. Erros e resultados com anexos não são cacheados; indisponibilidade da autoridade bloqueia entrega mesmo com cache. Leases são renovados e liberados somente pelo proprietário; a falha da coordenação Redis preserva os limites e a autorização da consulta.

`QUERY_CACHE_TTL_MS`, `QUERY_CACHE_SINGLEFLIGHT_WAIT_MS` e `QUERY_CACHE_SINGLEFLIGHT_LEASE_MS` controlam TTL, espera e lease. Testes de integração usam `REDIS_URL` de um Redis exclusivo de CI; não execute testes de cache/rate limit contra uma instância de produção.
