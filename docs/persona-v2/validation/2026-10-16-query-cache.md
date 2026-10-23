# Cache e singleflight persona-v2 — 2026-10-16

Evidência parcial de desenvolvimento. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais preservadas.
[Inventário parcial SHA-256](2026-10-16-query-cache-files.json) identifica esta
frente, sem representar commit/candidato integral. `ready: false`, treze gates
pendentes e `completedGates: []` preservados. HTTPS público e ChatGPT seguem
para validação manual; nenhum projeto foi commitado/publicado/implantado.

## Entrega

[Contrato](../query-cache.md): cache local/Redis cifrado e singleflight opt-in,
com chave HMAC por runtime/banco de controle, consumidor/concessão, fonte,
credencial, policy, recortes, publicações, SQL/parâmetros e limites. Cada
solicitante obtém seu próprio lease remoto e revalida localmente antes de lookup
e entrega. Fonte física/revisão e operação pendente/desconhecida integram os
fences; resultados de personas distintas nunca são compartilhados.

Cache preserva `readAt`, proveniência, paginação e completude. Console e
instruções distinguem leitura reutilizada de leitura fresca. Não cacheia erro,
validação, DML, cruzamento, SQL volátil ou consulta com prova estrutural. Essa
prova continua na conexão executora; ausência de cache não dispensa autorização.
Anexos continuam indisponíveis. Migration aditiva 0037: metadado de auditoria
por consumidor e índices dos fences; migrations aplicadas preservadas.

Memória tem quotas de entradas/bytes; Redis tem lease/proprietário e publicação
atômica, comandos limitados, sem reconexão ou offline queue. Timeout/lease
expirado não autoriza takeover ou reenvio; falha de publicação após SQL não
repete a consulta. Leituras fora do journal MCP podem mudar durante o TTL;
horário original permanece explícito, sem snapshot distribuído presumido.

## Ambiente e resultados

Fixtures exclusivas:

- `se7e_cache_pg_08a0bbe1edce_test`, PostgreSQL 17.11, `postgres:17-alpine`,
  imagem `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
- `se7e_cache_redis_08a0bbe1edce_test`, Redis 7.4.9, `redis:7-alpine`,
  imagem `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99`.

Labels de propriedade iguais aos nomes. Portas somente loopback: inicialmente
51250/51254; após reinício, 59736/59737. Bancos aleatórios `_test`, dados e
credenciais sintéticos. Nenhum arquivo operacional, fonte cadastrada do usuário
ou conexão pública foi usado. Node 24.21.0 e TypeScript 7.0.2 reais.

| Rodada                                         | Resultado                                 |
| ---------------------------------------------- | ----------------------------------------- |
| Unitários dirigidos iniciais                   | 40/40, dois arquivos, 1,41 s              |
| Unitários v2 com guarda estrutural             | 523/523, 49 arquivos, 21,87 s             |
| PostgreSQL: consultas e baseline               | 54/54, dois arquivos, 13,62 s, modo local |
| PostgreSQL v2 completo                         | 260/260, dezessete arquivos, 113,10 s     |
| HTTP/MCP + Redis efetivamente habilitado       | 54/54, dois arquivos, 14,36 s             |
| Fences finais após namespace de banco/reinício | 2 aprovados/33 não selecionados, 6,38 s   |
| Redis nativo final                             | 5/5, 680 ms                               |
| Frontend                                       | 36/36, treze arquivos, 2,54 s             |

Chromium completo final: **28/28**, 2,5 minutos. Regressão geral final:
**1.449 aprovados e 91 não executados**, 159 arquivos aprovados/seis não executados,
118,15 segundos.

Rodadas sobrepostas não são somadas. Autoridade/hub sintéticos, SQL PostgreSQL
e persistência de controle reais. Os testes HTTP comprovam cinco solicitações
coalescidas em um SELECT, hit com horário original, token revogado durante
revalidação de hit sem entrega, auditoria individual e invalidação nas duas
personas por `invalidatePhysicalSource` real. Um journal desconhecido sintético
sem dispatch de escrita comprova desativação do reuso para a base compartilhada.
Não representa DML real dessa nova frente ou prova dos outros dois motores.

Testes Redis usam duas conexões/coordenadores, ciphertext real, fencing, perda
de lease sem takeover e cliente indisponível sem retry. Não usam FLUSHDB;
removem somente chaves opacas da fixture. Unitários cobrem token/concessão,
parâmetros/policy/revisão, clones, TTL, limite de cifra, erros não cacheados,
espera independente e prova estrutural mantida no executor.

Falhas anteriores não foram tratadas como aprovação: uma asserção Redis usava
`toContain` em lock já removido (NULL); corrigida sem reduzir teste da cifra.
Dois containers estavam parados durante revalidação posterior, causando recusa
de conexão; reiniciados somente após conferir propriedade, com novas portas.
A configuração de teste criada nesta frente estava depois preenchida por NUL,
sem causa identificada; restaurado seu conteúdo exato e conferidos 403 arquivos
textuais sem NUL. As rodadas Redis/fences foram repetidas após essas correções.

Os 91 casos não executados na configuração geral não constituem evidência de
infraestrutura ou motores obrigatórios. A regressão Chromium usa hub sintético,
com cache desativado por padrão; comprova preservação das jornadas, sem afirmar
que o novo ramo visual de cache foi percorrido por essa rodada.

Tipos, lint, builds servidor/frontend, formatação e documentação conferidos;
`training:check` passou sem alterar referência/contrato do hub. CI agora tem
comando Redis específico e a variável de fixture na suíte PostgreSQL; não houve
push nem execução desse workflow remoto para o snapshot local.

Container/volumes próprios removidos depois da verificação das etiquetas e
encerramento dos testes. Nenhum recurso compartilhado foi removido.

## Limites de aceite

Não homologa infraestrutura distribuída instalada, Redis operacional,
restauração de backups, plugins reais, IA consumidora ou cadeia persistente
MCP → hub → agente nos três motores do novo candidato. Cache de conhecimento
com prova estrutural, anexos e demais pendências continuam no
[plano](../remaining-plan.md). Nenhum gate foi encerrado.
