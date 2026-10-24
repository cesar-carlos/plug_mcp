# Cache e singleflight persona-v2

Otimização opt-in de consultas locais publicadas, independente do runtime legado.
Nunca concede autoridade, licencia SQL ou substitui hub/agente. Deploy continua
bloqueado. Anexos têm armazenamento compartilhado próprio; cache de consultas
com prova estrutural continua pendente.

## Configuração e alcance

`PERSONA_V2_QUERY_CACHE_TTL_MS=0` desativa cache/singleflight, preservando o caminho
anterior. Valor de 1 a 60.000 habilita ambos. Sem `PERSONA_V2_REDIS_URL`, o cache é
local ao processo; com URL própria, Redis armazena resultados e coordena leases
entre instâncias. Não utiliza `REDIS_URL`, opções ou namespaces legados. A origem
canônica e a configuração do banco de controle integram o namespace efetivo,
somente sob HMAC, sem expor a URL ou suas credenciais. Habilitar não autoriza produção.

Somente `consultar_dados` local, após validar toda a AST, parâmetros, recortes,
classificação e limites. `validar_consulta`, etapas de cruzamento e DML não usam
reuso. Consultas com `expectedStructure` continuam executando integralmente na
conexão do agente; cache não pode substituir a prova antes/depois do SELECT.
SQL com funções/termos temporais ou voláteis conhecidos também é excluído
conservadoramente, incluindo NOW, GETDATE/GETUTCDATE, CURRENT_TIMESTAMP e AGE.

Cache pode preservar paginação e incompletude; nunca transforma página ou
resultado truncado em total. Erro, resposta incompatível, binário/anexo ou
resultado excedendo os limites não são armazenados. Conteúdo grande ainda pode
ser entregue fresco dentro do contrato, sem virar entrada de cache.

[Anexos JSON](attachments.md) têm armazenamento efêmero próprio e não utilizam
cache/singleflight. Criar executa SELECT fresco; ler revalida sem repetir SQL de
negócio. Ausência/expiração do handle não dispara consulta automaticamente.

## Isolamento e autorização

O namespace vigente não lê entradas sem instante autenticado de criação nem as
anteriores à distinção entre tipos ODBC nativos e discriminantes odbc_fast.
Entradas antigas expiram pelo próprio
prazo; não há conversão, limpeza ampla ou reuso de resultados já materializados.

Chave HMAC-SHA256 sob `se7e:persona-v2:query:v3:`, vinculada a:

- Persona, token/versões e concessão OAuth/prazo do access quando houver.
- Fonte, identidade física, revisão, credencial/versão e recortes.
- Fingerprint da policy completa recém-verificada e publicações/hashes exatos.
- SQL, parâmetros tipados, paginação e limites efetivos.

Chaves não expõem SQL, parâmetros, credenciais ou nomes. Valores são cifrados
com o keyring v2, com vínculo à chave, versão 2, criação e validade no envelope
autenticado. A instância leitora confere a idade desde a criação contra seu próprio
TTL e o vencimento original. Uma instância com prazo menor não aceita entrada
antiga perto do vencimento de um prazo maior; tampouco renova esse prazo.
Datas futuras, não inteiras ou validade acima de sessenta segundos são recusadas.
Memória/Redis nunca recebem linhas em texto puro como entrada persistida. Chave
rotacionada, conteúdo inválido ou cifra não decifrável causam miss; não geram
reexecução de SQL já enviado. Conteúdo efêmero não integra o inventário durável
de rewrap: expira em até sessenta segundos e uma nova chave cria namespace novo.

Cada solicitante autentica e valida publicação/conhecimento e permissões antes
do lookup. Obtém lease próprio do hub, conferindo JWT, ClientAgentAccess,
policy, credencial e identidade. Hit/seguidor revalidam seu lease e autoridade
local antes da entrega, inclusive OAuth, prazo, versão, limites e revisão física.
Ausência de autoridade bloqueia a entrega; cache não é fallback de autorização.
Respostas são copiadas, sem compartilhar referências mutáveis entre chamadas.

## Revisão da base física

O fence transacional lê `fonte_fisica.cache_revision` como texto exato e detecta
operações SQL `executando`, `cancelamento_solicitado` ou `resultado_desconhecido`
em qualquer vínculo da mesma identidade física, sem revelar essas operações.
Operação pendente/desconhecida desativa cache e singleflight; consulta normal
continua sujeita aos portões atuais. Conciliação comercial não libera reuso
enquanto o journal técnico continuar desconhecido.

Escrita confirmada/incerta incrementa a revisão pela transação já existente dos
comprovantes. A revisão integra a chave de todas as personas dessa base e é
revalidada antes da entrega. Mudança em voo descarta o resultado. Assim, dados
de uma persona invalidam logicamente entradas de outros vínculos, sem jamais
compartilhar suas linhas, credenciais ou concessões. Entradas inacessíveis ficam
cifradas até TTL/evicção; invalidação não significa exclusão física instantânea.

Não há snapshot distribuído ou detecção de toda gravação externa ao MCP.
Alterações de negócio fora desse journal são observadas após expiração; a
resposta informa o horário original, sem prometer dados recém-consultados.
Durante restauração de backup, manter reuso desativado e aguardar ao menos o
TTL máximo antes de habilitá-lo; não preservar entradas como prova do banco restaurado.

## Concorrência e falhas

Singleflight local mantém até 64 jobs em andamento. Espera tem prazo próprio;
timeout não remove o líder nem envia outra consulta. Sucesso é copiado por
solicitante; erro remove o job somente quando encerrado, sem cache de erros.
Novo pedido explícito após erro continua exigindo autorização completa.

Redis usa claim NX com proprietário aleatório e lease de 120 segundos, superior
ao prazo máximo de consulta. Publicação e liberação verificam proprietário por
Lua; líder antigo não publica/apaga lease de outro. Seguidor espera até seu
prazo, sem assumir lease expirado ou ausente e sem disparar SQL por falta de ACK.
Resultado acima do limite ou falha do líder pode fazer seguidor expirar; não
se troca indisponibilidade por nova execução automática.

Depois de obter o claim, o líder confere novamente a entrada: outra instância
pode ter publicado entre o miss inicial e a aquisição do lock. Nesse caso usa
o resultado existente, preserva criação/vencimento e libera somente seu claim,
sem executar outro SELECT. A entrega continua revalidada pelo próprio consumidor.

Redis tem conexão/comandos limitados a um segundo, sem offline queue ou reconexão
automática. Falha antes do envio reduz a otimização ao singleflight local e a
uma execução autorizada. Falha de publicação após SQL preserva o resultado
revalidado, sem reenviar SQL. Falha de espera não autoriza takeover. Não há
retry genérico de consulta, DML ou efeitos externos.

Cache local: 128 entradas/16 MiB de cifras, evicção LRU, até 2 MiB por entrada.
Redis também recusa entrada acima de 2 MiB; sua quota total é configuração de
infraestrutura. Nenhum hit renova TTL. Limites de linhas/bytes/prazo da consulta
continuam independentes e só podem ser reduzidos pelas concessões.

## Resposta, auditoria e testes

`reuse.kind` distingue `fresh`, `cache` e `singleflight` quando a otimização é
elegível. `provenance.readAt`, fonte, publicações, paginação e completude originais
são preservados. Console sinaliza leitura reutilizada; instruções da IA exigem
origem/horário sem inventar atualização. Caso inelegível não recebe esse campo.
Auditoria por consumidor registra somente metadados e `query_reuse_kind`.
Migration aditiva 0037 acrescenta esse campo e índices dos fences, sem backfill
de eventos ou alteração de migrations anteriores.

- Unitários: isolamento, cifras, TTL, concorrência, timeout, erros, limites e
  revalidação de cada solicitante. Prova estrutural continua no executor.
- `test:persona-v2:postgres`: fluxo MCP real da aplicação e SQL PostgreSQL de
  fixture, com autoridade sintética. `PERSONA_V2_TEST_REDIS_URL` explícita habilita
  Redis nesses casos; sem ela, essa suíte comprova o modo local, sem afirmar Redis.
- `test:persona-v2:cache`: Redis nativo dedicado e URL local explícita obrigatória,
  sem skip/fallback; duas conexões/coordenadores, fencing, ausência de takeover
  e indisponibilidade, corrida miss/claim e prazos diferentes entre instâncias.
  Não usa FLUSHDB; remove somente chaves da fixture.
- A cadeia persistente acrescenta dois processos MCP com a mesma origem e Redis,
  nos três motores. Barreiras somente de fixture retêm a publicação depois do
  SELECT nativo e sinalizam claim de seguidor, sem alterar SQL ou autoridade.
  Conferem SQL único, proveniência, isolamento por token e revogação em trânsito.
  Interrupção do container Redis proprietário após o SELECT verifica resultado
  fresco do líder e expiração do seguidor sem takeover/reenvio. Recursos são
  dedicados; rótulo de ownership é conferido antes de parar/reiniciar Redis.

CI conecta essas verificações somente ao Redis efêmero do job e usa prefixos
próprios. Ter essa etapa configurada não significa que o CI do candidato local
já foi executado ou aprovado.

Testes de coordenadores ou PostgreSQL com autoridade sintética não substituem
a cadeia persistente. Mesmo a cadeia de fixture não homologa Redis da infraestrutura,
proxy/frota instalados, HTTPS público, plugin ChatGPT ou aceite de release.
Pendências e evidências: [plano](remaining-plan.md),
[matriz](acceptance.md), [índice](validation.md).
A [rodada Redis com dois processos MCP](validation/2026-10-16-redis-multi-instance.md)
separa coordenadores nativos, PostgreSQL com autoridade sintética e cadeia
persistente dos três motores; nenhum desses resultados encerra gates sozinho.
