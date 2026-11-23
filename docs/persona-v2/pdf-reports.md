# Relatórios PDF gerados — implementação em validação

Estado em 20/11/2026: código publicado no destino test-server em `efb4172`,
após a [prova F0](pdf-reports-f0.md) e os gates técnicos. PDF permanece desabilitado,
sem concessões novas e sem aceite integral para clientes.
O plano coordenado do mcp_test_agente separa F0–F7.
Este documento registra o código atual; não substitui evidência de liberação.

## Contrato e autoridade

`validar_relatorio_pdf` confere contrato, colunas, formatos, seções e tetos vigentes
sem executar SQL ou reservar job/autorização. Revalida a autoridade antes da resposta;
não comprova completude dos dados ou sucesso de renderização. A geração refaz as
guardas. Regressão PostgreSQL cobre ausência de SQL/job e recusa após revogação.
`localizar_relatorio` recupera a tentativa pelo requestId original na mesma conexão,
sem nova captura. `listar_relatorios` devolve metadados autorizados, com filtro de
fonte/publicação/concessão antes de paginar; não revela nomes ou total de itens
inacessíveis. Página tem até 20 itens; a quota de 1000 registros por persona limita
a seleção interna. Não entrega arquivos; download mantém suas próprias guardas.

Monitoramento é de operador, não uma tool de consumidor: execute
`npx tsx scripts/persona-pdf-health.ts` com `PERSONA_V2_PDF_HEALTH_DATABASE_URL`
apontando explicitamente ao PostgreSQL de controle v2. Use credencial de leitura
fornecida pelo ambiente, nunca URL com segredo em argumentos ou logs. A transação
somente leitura tem timeout de cinco segundos; retorna contagens globais de fila,
coleta, renderização, estados incertos, trabalhos vencidos, leases vencidos e uso
dos tetos de oito payloads e 100 mil metadados. Não seleciona IDs, SQL, conteúdo,
handles ou diagnósticos individuais. Não limpa, cancela nem repete execução.
Tombstones continuam permanentes; saturação exige decisão operacional, não purge.
As ferramentas estão incorporadas à imagem, mas não expostas enquanto PDF estiver
desabilitado. A publicação do código não altera contratos ou concessões existentes.

### Deploy e rodada nativa da revisão publicada

CI [44849057750](https://github.com/cesar-carlos/plug_mcp/actions/runs/44849057750)
e deploy [44850063942](https://github.com/cesar-carlos/plug_mcp/actions/runs/44850063942)
aprovados para `efb4172db195b27602cbce948fbe47e9ee253164`. Servidor e worker saudáveis,
quatro ciclos do worker concluídos e zero avisos/erros na janela pós-subida;
`logReviewRequired=false`. Ledger das migrations 0056/0057 confere com seus hashes.
Flag PDF confirmada `false`; imagem
`sha256:cafdc4e5c77dce83d2ebe914fe1b98fc4b46120940011861dd3927874836c20d`.

A rodada oficial isolada posterior usou essa mesma imagem de renderer sem rede,
MCP efb4172, hub 41cc6b1 e agente isolado b304026e. Inventário antes/depois estável,
sourceSha MCP `4b4b3e6ccd21056b6f1ef33c24e35c78f72ffa9aa0b062206010ba02765c48e0`.
Passaram nove casos nativos (tabela/gráfico/seções em PostgreSQL, MSSQL e Sybase),
com 85 casos não selecionados. Os nove PDFs/15 páginas passaram extração e
inspeção visual; download HTTP autenticado e repetição do requestId preservaram
o handle e não repetiram SQL. A fixture não certifica o agente instalado na Campo.

Artefatos sintéticos locais: `node_modules/.cache/pdf-efb4172-native-evidence`;
log `node_modules/.cache/pdf-efb4172-chain.log`. Fixture oficial
`se7e_persona_ab33d1ac0e48_test`, DSN, motores próprios e renderer foram removidos
com limpeza verificada, preservando imagens/cache/evidências.

Download dentro do ChatGPT continua pendente: não há endpoint HTTPS de fixture PDF
com OAuth e identidade sintética preparada. O ingresso operacional com PDF off não
substitui esse ambiente; não criar túnel público, copiar tokens operacionais ou
ampliar concessões da Helena para contornar a ausência. PAGE-01..08 e snapshot
forte continuam separados. A rodada nativa não certifica essas integrações.

### Evidência das ferramentas de recuperação e operação — 20/11/2026

Após os ajustes finais, a suíte PDF PostgreSQL passou 31/31. Inclui prévia sem
SQL/job, revogação entre prévia e criação, recuperação sem recaptura, isolamento de
conexões, filtro anterior à paginação e métricas sem conteúdo ou efeitos. A
regressão detectou e corrigiu a admissão anterior à revalidação: recusa conhecida
antes do SQL não cria captura incerta. Status também revalida antes de devolver
metadados. Falha de métricas conserva mensagem fixa e descarta conexão incerta.

`npm run release:check` passou no snapshot local: 2778 testes gerais, 91 omitidos
pela configuração e 292 testes web; documentação 311 arquivos/1425 links/zero
problemas. O gate inclui Node 24.21, TypeScript 7.0.2, treinamento, lint, formato,
build e web. Pacote persona-v2 portátil sintético montado e validado offline.
Log local em `node_modules/.cache/pdf-tools-release-check.log` (não versionado).
Fixture `plug-mcp-pdf-recovery-test-20261120` e volume exclusivo removidos após a
última rodada, sem remover outros serviços, imagens ou caches.

Esta evidência não reexecuta a cadeia nativa dos três motores sobre o delta atual,
nem certifica download no cliente, PAGE-01..08 ou snapshot forte. Nenhuma publicação,
concessão, consulta ERP ou entrega externa foi realizada nesta rodada.

Uma fonte e uma skill publicada por captura; até quatro capturas da mesma fonte
podem formar seções por leituras sucessivas explícitas. `generatedPdf` tem schemaVersion 1,
template `table-v1`, colunas únicas da projeção e tetos de 5000 linhas, 250 páginas,
8 MiB e 15 minutos. A capability `generated-pdf-contract:<hash>` é própria e
inclui o contrato; permissões JSON/BLOB não habilitam PDF. Toda a projeção exige
finalidade exportacao. Não imprimir parâmetros, restrições internas ou SQL.

`criar_relatorio_pdf` recebe schemaVersion, requestId UUID, query, scope e layout
fechado. `pagina` exige page/pageSize; `limitado` declara recorte; `integral` exige
completude positiva, sem paginação. Nenhum deles comprova snapshot consistente.
Layout aceita orientação e seleção de até oito aliases autorizados; não aceita
HTML/CSS/SVG/JS, URL, título livre ou fórmulas. O renderer atual recusa glifos fora
do repertório revisado WinAnsi em vez de substituir dados silenciosamente.
Noto Sans 2.015 Regular/Bold são incorporadas a partir dos arquivos completos
oficiais, com [licença e hashes](../../assets/pdf-fonts/README.md). Não implica
PDF/A ou PDF/UA. A extração independente preservou acentos e caracteres estendidos;
a matriz F6 de oito tabelas/245 páginas passou extração e Poppler; três gráficos
e respectivas tabelas passaram extração e inspeção visual. A rodada combinada
posterior também verificou múltiplas seções nos três motores, conforme abaixo.

`obter_status_relatorio` e `cancelar_relatorio` recebem somente jobId. Só ready
devolve descritor para o fluxo autenticado de anexos. Estado e metadados exigem
identidade, fonte e publicação vigentes. Download reconfere policy, estrutura,
concessões e prazo, reaproveitando [anexos](attachments.md). Sucesso via HTTP/MCP
em fixture não comprova que o ChatGPT permite baixar o arquivo.

## Captura e processamento

A requisição autenticada reserva job e claim duráveis antes de chamar o serviço
existente de consultas. Faz no máximo um SELECT fresco por seção, sem cache. Uma captura
selada/cifrada alimenta a renderização; worker nunca recebe trabalho de consulta.
Falha incerta não autoriza replay. Falha de status depois do selo não reclassifica
a captura como desconhecida. Refresh mantém binding, sem renovar deadline.

Migration 0056 cria `persona_pdf_job_v2`. Admission usa relógio PostgreSQL,
deadline de trabalho até 60 segundos para fila, captura, renderização e finalização, sem reinício por etapa; validade limitada pelo acesso original.
Quotas transacionais: oito capturas globais, duas por persona e 100 mil registros
de idempotência. Migration 0057 limita a mil tombstones por persona, sem apagá-los ou reabilitar requestIds. Saturação recusa novas gerações e exige planejamento operacional, sem limpeza automática do histórico. Payload cifrado limitado a 32 MiB, resultado a 64 KiB. Há limites
adicionais de plaintext antes da cifra. Revisar o orçamento agregado antes do
rollout; não há SLA certificado por essas constantes.

requestId/binding identificam a tentativa; HMAC com chave privada por tentativa
confere conteúdo enquanto retido. Após expiração fica tombstone, sem permitir
nova captura. Uma requisição explícita nova exige novo requestId. Captura incerta
é terminal. Renderização pode retomar captura selada com fencing, no máximo duas
claims e sem repetir SQL. Finalização do job, anexo e auditoria é transacional.
Cancelamento disputa o mesmo lock/CAS e remove o arquivo sem prometer cancelar
SQL remoto. Rotação do cofre inclui as três cifras do job.

O processo do servidor coordena somente jobs de renderização em loop sem
sobreposição; revalida antes e depois de renderizar e aguarda o ciclo em shutdown.
O renderer dedicado recebe apenas células de apresentação e limites, por socket
Unix com frame JSON fechado por newline. Não carrega configuração, keyring,
cliente SQL ou credenciais. Worker thread recebe somente FONTCONFIG_FILE fixo
para as fontes locais e pools nativos limitados a uma thread; não herda segredos.
O processo dedicado também fixa essas variáveis, pois bibliotecas nativas não
leem necessariamente a cópia de environment JavaScript de uma worker thread.

## Habilitação experimental

Atualização operacional de 23/11/2026: PDF foi habilitado por solicitação do
responsável no servidor operacional (destino técnico test-server), mantendo
efb4172. Servidor, worker e renderer saudáveis; nenhuma concessão ou publicação
foi alterada. Download no ChatGPT continua sem comprovação.

O deploy passa a ler `PERSONA_V2_TEST_PDF_ENABLED=true` no arquivo privado do
destino. O padrão é `false`; outros valores são recusados antes de parar serviços.
Quando habilitado, aplica `docker-compose.persona-v2.pdf.yml` e aguarda o renderer
da mesma imagem verificada antes de subir servidor/worker. Não imprime configuração
resolvida, não repete migrações nem aplica rollback automático. A correção do
procedimento precisa ser publicada antes de o próximo deploy poder preservá-la.

A ferramenta é genérica: não exige um desenvolvimento ou contrato novo para cada
período, filtro ou relatório. Reutiliza o contrato `generatedPdf` da consulta
publicada, suas colunas exportáveis e os limites concedidos. Consultar não implica
exportar; a primeira habilitação de uma consulta requer contrato e concessão
específicos. Não converter automaticamente todas as consultas ou tokens existentes.

Revisão de integração em 23/11: `obter_capacidades` pela conexão OAuth da Helena
confirmou `generatedPdf.enabled=true` e build efb4172, sem SQL de negócio. O
inventário disponível na conversa ainda não expunha tools PDF; isso não comprova
expiração do token. Descoberta atualizada e download real permanecem pendentes.
Os contratos PDF e as concessões da Helena não foram alterados nesta revisão.
Validação local do ajuste: 71 testes de deploy, isolamento, transporte PDF e
anexos aprovados; lint, documentação e treinamento v2 aprovados. Não equivale a
CI/deploy do ajuste, teste de navegador ou autorização de exportação.

Revisão adicional: a observação pós-deploy passa a incluir o renderer quando o
servidor declara PDF ativo. Confere imagem, entrypoint, rede desabilitada, filesystem
somente leitura, saúde, reinícios/OOM e resumo seguro dos logs. Ausência ou deriva
impede aprovação; erro registrado também reprova. Configuração vazia é inválida,
enquanto variável ausente mantém o padrão desabilitado. Regressão sintética
confirmou que o código anterior aprovava renderer ausente e o novo recusa.
Esta verificação não gera PDF, consulta ERP ou substitui download real no cliente.

Revisão do transporte IPC: respostas com campo `error` desconhecido/inválido não
podem ser aceitas como sucesso, mesmo se contiverem bytes de PDF. Motivos seguros
conhecidos continuam preservados; conteúdo remoto não é exposto. O limite de
16 MiB inclui o delimitador newline, conferido antes de conectar. Eventos após
o término são ignorados. Cinco regressões reproduziram as falhas antes da correção;
testes usam socket local e dados sintéticos, sem ERP ou repetição automática.

A detecção de alterações também inclui o verificador pós-deploy: mudanças isoladas
em `scripts/verify-persona-deployment.mjs` não podem ser tratadas como documentação
e ignoradas pela entrega. Alterações somente em seus testes não disparam deploy.

Consolidação local em 23/11: 129 testes aprovados em dez arquivos cobrindo
transporte/renderer PDF, anexos, deploy/observação e orientação de SQL agregado.
Lint, tipos, documentação, formatação e orçamento do treinamento v2 aprovados.
Git Bash exigiu execução fora do sandbox Windows; não foram acessados ERP ou
produção pelos testes. Evidência local não substitui CI, publicação ou download
no ChatGPT. Exemplos operacionais de devoluções seguem revisão editorial separada.

Gate completo local de entrega em 23/11: `npm run release:check` aprovado com
2.806 testes gerais (91 omitidos pela configuração) e 292 testes do console,
incluindo lint, tipos, treinamento, documentação, formatação e builds.
Log privado: `node_modules/.cache/pdf-release-20261123-final.log`.
O destino mantém opt-in PDF explícito em configuração privada com backup;
esta evidência local não antecipa resultado do CI ou do deploy.

Padrão `PERSONA_V2_PDF_ENABLED=false`. Composição registra as três tools somente
quando habilitado e mantém capacidades explícitas de aceite nativo/download como
falsas. O overlay [Docker PDF](../../docker-compose.persona-v2.pdf.yml) é para
combinação explícita com o destino de teste, não para concessão automática.

Renderer usa a mesma imagem verificada, entrypoint próprio, network_mode none,
filesystem somente leitura, sem environment de banco/cofre, cap_drop ALL,
no-new-privileges, 384 MiB, uma CPU e 32 PIDs. Compartilha apenas o volume do
socket com o servidor. Não montar diretórios de backups ou volumes de dados.
Migrations 0056/0057 são explícitas antes de habilitar; startup nunca as aplica. Tetos de 5000 linhas/250 páginas não garantem qualquer texto: células longas podem ser recusadas sem truncamento silencioso.

## Evidências e pendências por fase

| Fase | Evidência atual                                                                           | Limite ou pendência                                               |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| F0   | Oito PDFs/226 páginas do protótipo                                                        | Não certifica renderer final                                      |
| F1   | Contrato/capability, catálogo, pacote offline e regressões                                | Sem habilitação automática                                        |
| F2   | 21 testes PG, incluindo revogação, seções e falha sem replay                              | Homologação operacional separada                                  |
| F3   | Nove casos nativos com renderer Docker nos três motores; 85 não selecionados              | Sem ERP; alteração posterior do slot testada separadamente        |
| F4   | Fontes, IPC/Docker, 245 páginas de tabelas e seis de gráficos; regressões de concorrência | Sem certificação PDF/A ou PDF/UA                                  |
| F5   | Tools opt-in, Bearer/OAuth e download HTTP/403 em fixture; pacote offline                 | Download no cliente real não comprovado                           |
| F6   | Gráficos com tabela equivalente, extração, inspeção visual e cadeia combinada             | Sem SLA de renderização                                           |
| F7   | Até quatro seções sucessivas, testes PG/renderer e casos nativos/visuais de duas seções   | Snapshot forte/multi-lote depende de contrato hub/agente separado |

Suítes: `tests/unit/persona-v2/{attachments,pdf-renderer,pdf-render-client,
pdf-report-transport,attachment-permissions,worker-loop}.test.ts` e
`tests/persona-v2/pdf-report-jobs.postgres.test.ts`. Os testes PostgreSQL criam
banco sintético aleatório e removem somente esse banco ao terminar. O transporte
SQL nessa suíte é simulado; o arquivo PDF e o banco de controle são reais.

A prova isolada usa `scripts/homologation/pdf-renderer-isolation.mjs`, montado
somente na fixture, e `verify-pdf-report-f0.py --renderer` para extração/renderização
independentes. Artefatos sintéticos ficam em node_modules/.cache, fora do Git.
O catálogo do mcp_test_agente ainda não tem runner PDF oficial: não apresentar
esses scripts como relatório de publicação ou como se7e-test-run/v3.

Cadeia nativa anterior: base MCP 4473f3a, sourceSha
`d392ff6220e65a7b52960250e696ff5ffe04059b4993eaf95f502ff8521e2cc2`,
hub 41cc6b1 e agente b304026e em clone isolado, Flutter 3.50 e lock preservado.
Inventários antes/depois estáveis. Fixture 010d7b9b5a89 removida pelo procedimento
oficial com exit 0 e zero containers restantes por nome. Esses resultados não
certificam a mudança posterior de fontes/gráficos. As fixtures dedicadas foram
encerradas ao concluir a rodada final, conforme o fechamento abaixo.

## Gráficos em validação

`generatedPdf.charts` declara ID, tipo, aliases de categoria/valor e unidade
(BRL, quantity ou percent). `layout.chartId` só seleciona esse contrato; o hash
da capability inclui as novas definições. Publicações antigas não ganham gráficos.
Todas as colunas continuam sujeitas à finalidade de exportação.

Apache ECharts 6.1.0 gera SVG interno com opções fechadas; Sharp rasteriza no
renderer isolado, sem SVG/URL/código vindo do consumidor. Barras aceitam até 30
categorias, linhas até 200 pontos na ordem capturada, composição até seis valores
não negativos. Categorias repetidas, números incompatíveis ou composição nula
são recusados; não agregamos nem preenchemos dados. Nulos preservam lacunas em
linhas/barras. A captura conserva strings decimais; a tabela formata medidas com duas casas. Number só define geometria,
sem total financeiro calculado em ponto flutuante. Imagem não substitui tabela.

Referências: [ECharts SSR](https://echarts.apache.org/handbook/en/how-to/cross-platform/server/)
e [incorporação de fontes no PDFKit](https://pdfkit.org/docs/text.html).

Hono foi atualizado dentro da faixa compatível; auditoria online de runtime
retornou zero advisories. Restam quatro ocorrências moderadas de desenvolvimento
na cadeia drizzle-kit → esbuild-kit → esbuild; não foi aplicado downgrade forçado
do gerador de migrations. Esse resultado não equivale a auditoria total sem achados.
Nenhum teste anterior certifica alterações posteriores.
Nenhuma publicação SQL, concessão, banco operacional ou cliente foi alterado.

## Seções por leituras sucessivas

`additionalSections` admite até três seções além da principal, sempre na mesma
fonte. Cada publicação deve declarar `successiveSections` suficiente; isso muda
o hash da capability e não amplia publicações/concessões existentes. A requisição
exige `consistency=successive_reads`. Snapshot forte e coleta em lotes são recusados;
`SourceQueryLease` não oferece sessão consistente. Não usar esse modo quando
simultaneidade ou conciliação garantida forem requisitos do pedido.

Autoridade de todas as seções é verificada antes do primeiro envio e novamente
antes de cada consulta. Cada seção executa no máximo uma vez; falha interrompe
as restantes e não permite retomar SQL. Capturas são seladas juntas. Prazos,
TTL, linhas, páginas e bytes usam o menor teto e orçamento global, sem reinício.
O PDF identifica seção, fonte, readAt e completude; o descritor traz pdfSections.
Download revalida todas as capturas, não somente a primeira. Revogar a segunda
publicação bloqueia o arquivo inteiro. Não somamos medidas de leituras diferentes.

## Prova combinada de captura e renderer

Rodada de 20/11/2026: nove casos aprovados, 85 não selecionados, sem autorização
de release. Base MCP 4473f3a; inventário sourceSha
`ad16449d66236acd0f89720367217ef3d62059e846465e0dc12880fbaf2f878d`,
hub 41cc6b1 e agente b304026e. Imagem sintética de renderer
`sha256:75aed2e56be358d7c8943e6d6e06502696d4b15a24b3e989f2bb11505cc6849c`.
Inventários estáveis antes/depois; não é a imagem final de release. Os nove PDFs
(15 páginas) passaram extração independente e inspeção visual com Poppler,
incluindo tabela, gráfico e segunda seção vazia. O verificador
`scripts/homologation/verify-native-pdf-reports.py` confere os dados sintéticos.
Fixture 9b9b4c7231ff removida pelo procedimento oficial, exit 0 e zero containers
restantes pelo prefixo. As fixtures próprias PG/renderer foram encerradas ao final.

O manifesto oficial da cadeia admite `pdfRenderer` opcional com nome de container
sintético e imageId imutável. O runner recompila o MCP antes do inventário;
o adapter de fixture confere imagem, isolamento e hashes do código compilado.
O transporte passa dados por stdin ao socket Unix real dentro do renderer,
nunca por argumentos de processo. Não é uma nova tool nem um runner de produção.
Sem esse vínculo, o teste continua usando renderer em processo e não certifica
o isolamento combinado. As duas modalidades devem ser distinguidas no relatório.

Na F6, registramos uma regressão real do PDFKit: aliases de fontes provocavam
reabertura de TTF ao restaurar cada célula. Em cópia isolada, 100 linhas geraram
632 leituras antes e duas depois; o teste exige duas. Medição local de 1000 linhas
passou de 7087 ms para 290 ms. Na fixture de uma CPU, 5000 linhas com fontes
incorporadas renderizaram 228 páginas em cerca de 4,4 segundos, incluindo IPC.
São medidas de rodadas identificadas, não SLA. O timeout de 10 segundos foi mantido.

## Fechamento local da rodada

`release:check` terminou com sucesso: Node/compilador, documentação, treinamento,
lint/formatação, tipos, 2762 testes gerais aprovados (91 omitidos pela configuração),
build e 292 testes do console, além de lint/tipos/build web. Os omitidos não são
evidência aprovada. A suíte PDF PostgreSQL foi repetida com 21/21. A rodada v2
PostgreSQL completa teve 367 aprovados e duas falhas: expectativa de baseline
anterior às migrations 0056/0057 e verificação de segredo com senha vazia na URL
da fixture. A expectativa foi atualizada e a configuração ganhou senha sintética;
as duas suítes foram repetidas, 22/22 aprovados, sem enfraquecer as validações.
Não somar resultados sobrepostos nem descrever a primeira rodada como limpa.

Depois da cadeia nativa, a revisão de concorrência corrigiu liberação prematura
do slot do renderer. A resposta agora aguarda encerramento confirmado da thread;
falha ao encerrar conserva indisponibilidade, sem sobreposição. Três regressões
específicas e as regressões do pacote passaram (47 testes focados, sem somá-los
à suíte geral). A matriz Docker foi repetida com oito tabelas/245 páginas e três
gráficos/seis páginas; parsing independente e inspeção visual passaram novamente.
O sourceSha anterior da cadeia não certifica essa alteração posterior. Manifesto
com hashes compilados está em `node_modules/.cache/pdf-renderer-final-evidence`.
Após o gate geral, os ajustes finais do slot, baseline e overlay foram verificados
por regressões focadas, lint e typecheck. O overlay ganhou tmpfs limitado a 32 MiB
para o cache de fontes, equivalente ao ambiente isolado; teste conserva rede
desabilitada, raiz somente leitura, teto de recursos e ausência de credenciais.

O pacote privado portátil foi gerado e aprovado offline no perfil se7e-package-v1,
com origem sintética, sem instalação: `node_modules/.cache/pdf-plugin-final-20261120`.
Não foi feita publicação GitHub, implantação, consulta ERP ou mudança de grants.
PDF permanece desabilitado por padrão. Download no ChatGPT real, rollout e aceite
integral continuam separados. Snapshot forte e coleta multi-lote não foram
implementados: dependem de contrato e evidência de isolamento no hub/agente.

Limpeza final confirmada: os dois renderers próprios e a fixture PG
`plug-mcp-pdf-f2-test-20261120` foram removidos; somente o volume anônimo exclusivo
dessa fixture foi apagado após conferir dono e referências. A listagem pelo
prefixo plug-mcp-pdf não retornou containers. Outros bancos, containers, imagens,
backups e configurações foram preservados. Artefatos sintéticos e logs permanecem
em node_modules/.cache para revisão.

## Formatação brasileira

Datas usam dd/mm/aaaa; horários preservam o fuso recebido, com UTC explícito ou
aviso de fuso ausente. Não se presume que todo o Brasil usa o mesmo fuso.
`generatedPdf.columnFormats` associa aliases exportáveis a text, number, currency,
percent, date, datetime ou boolean. O renderer recebe apenas os formatos fechados,
sem código. A ausência de formato conserva texto; a medida de gráfico usa a unidade
publicada. Códigos, zeros à esquerda e identificadores não viram valores monetários.
Mudanças no contrato exigem nova publicação/capability; nenhuma existente foi alterada.

Medidas usam ponto de milhar, vírgula e duas casas; moeda usa R$ e percentual usa %
sem multiplicar por cem. Arredondamento decimal é feito em base dez, inclusive para
valores maiores que o inteiro seguro de JavaScript; empate arredonda para longe de
zero. Nulo continua Não informado, booleanos Sim/Não. A captura original permanece
inalterada. Eixos de gráficos também usam padrão brasileiro. A formatação é de
apresentação e não comprova precisão original limitada a duas casas.

Validação desta alteração: 26 testes focados e 21 PostgreSQL PDF aprovados,
lint, typecheck, build, treinamento e checks documentais. Duas amostras sintéticas
(três páginas) passaram extração independente e inspeção visual pelos scripts
`pdf-br-samples.ts` e `verify-pdf-br-samples.py` em scripts/homologation.
A fixture PostgreSQL exclusiva da rodada foi removida após os testes. O pacote
privado foi regenerado e validado offline; sem publicação ou alteração de grants.
Essa evidência não substitui nova rodada nativa/consumidor para liberar o delta.

## Revisão de integridade e diagnósticos

Cancelamento conserva somente metadados cifrados de autoridade até o prazo original,
sem payload, descritor ou handle. Consultar estado e repetir cancelamento exige
autorização vigente. Se cancelar vencer durante a captura, a resposta consulta o
estado persistido e não anuncia captura incerta no lugar de cancelado. Nenhuma
dessas disputas reabre o job ou permite repetir SQL.

O menor maxRows de todas as seções limita a soma das linhas. Para bytes, existem
dois orçamentos independentes: soma das respostas JSON capturadas e arquivo PDF
final. Ambos respeitam o menor teto publicado, concedido e solicitado; evidências
seladas ainda têm teto de plaintext de 16 MiB. O saldo de captura é reduzido antes
de enviar a seção seguinte, sem reiniciar limites por seção. Isso pode recusar um
relatório cujas seções isoladas caberiam, mas o conjunto não cabe.

O cliente IPC usa deadline absoluto, que não é renovado pelo recebimento de bytes.
O diagnóstico persistido admite somente códigos conhecidos e motivos fechados do
renderer; não armazena mensagem nativa, SQL ou valores. Status conserva errorCode
e supportId após falha. Se persistir a falha também falhar, a resposta preserva o
protocolo original e informa diagnosticPersisted=false; o log usa o mesmo supportId.
Isso não garante que o próximo status já contenha o diagnóstico nem autoriza replay.

Formato explícito da medida deve concordar com a unidade do gráfico. Percentuais
já estão em pontos percentuais: 0.25 é exibido como 0,25%, sem multiplicação por cem.
A guarda de caracteres permanece um repertório WinAnsi revisado e explícito,
apesar dos arquivos de fonte completos; não há promessa de Unicode irrestrito.

Validação da revisão de 20/11/2026: release:check aprovado, 2777 testes gerais
aprovados/91 omitidos e 292 testes web; suíte PDF PostgreSQL 27/27. O enum de
diagnóstico, corrida com captura em voo, persistência secundária indisponível,
quota acumulada e deadline com bytes contínuos têm regressões específicas.
Orientações finais de diagnóstico/páginas foram reconferidas em sete testes
focados e training:check/budgets; não somar casos sobrepostos. Pacote privado
regenerado/validado offline em node_modules/.cache/pdf-plugin-review-final-20261120.
A fixture plug-mcp-pdf-review-20261120 e seu volume exclusivo foram removidos,
com conferência de propriedade e zero containers restantes pelo nome.
O chat mcp_test_agente revisou os casos e a documentação em leitura; não executou
consumidor/ERP. Nova rodada nativa e download real continuam separados do gate
local. Sem commit, publicação, deploy ou alteração de concessões nesta revisão.
