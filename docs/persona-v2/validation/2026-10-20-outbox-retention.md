# Retenção dos metadados da outbox — 2026-10-20

Migration aditiva 0041, sem alterar as anteriores. Registra encerramento pelo
PostgreSQL; históricos iniciam prazo conservador na migração. Após 90 dias,
limpeza temporária sob lease remove metadados/cópias de credenciais em lotes de
cem. Mantém identidade, namespace, deduplicação e estado terminal permanentemente.
Não toca journals ou repete operações.

## Resultados

PostgreSQL 17 em contêiner aleatório dedicado; nenhum banco operacional usado.
Banco vazio e reaplicação das migrations passaram. Na rodada de 10:39:39,
17 testes da outbox passaram; teste novo falhou por esperar chave sem namespace.
A implementação manteve corretamente o prefixo existente. Rodada final dirigida
de limpeza: seis testes passaram em 1,54 s, início 10:41:38, após corrigir a
expectativa e acrescentar recusa de duplicata após limpeza. Fixtures removidas.

Testes confirmam recusa de limpeza antecipada, preservação de entrega recente
e pendente, limpeza vencida, idempotência, recusa de rearmamento/exclusão e
deduplicação permanente. Somente o banco descartável envelhece artificialmente
um registro com trigger temporariamente desabilitado; produção não pode alterar
esse relógio pelo worker.

A primeira rodada também identificou a constraint fechada de metadados: a
migration agora conserva a expressão original e acrescenta exclusivamente a
forma de tombstone terminal. Preserva a proibição de promover outbox histórica
sem notification_version a notificação executável.

## Limites

Tipos, lint dirigido e build passaram; docs:check conferiu 227 arquivos e
1.101 links sem problemas. SHA-256 da migration:
F0405C147A057E0E46D99EF2D0A75256B430B9026C7CCFA72266CC86368E20D5.
SHA-256 do adapter ephemeral-worker.ts:
92A469F0C012671C0BA3D3B8D376C3C643C795765348F9B580F32D15F98D52C2.

Upgrade com registros históricos, rotação das cifras antigas seguida de limpeza,
matriz de carga e imagem com 41 migrations ainda exigem homologação.
MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
Não certifica infraestrutura instalada ou gates. HTTPS/ChatGPT manuais e
ready:false preservados; sem publicação, commit ou deploy.
