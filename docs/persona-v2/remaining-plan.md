# Trabalho restante da persona-v2

Avaliação consumidora: [núcleo e CLI v2](consumer-evaluation.md) implementados,
com referência isolada do modelo e recusa de aceite por harness. Continuam
pendentes adaptadores reais, dataset revisado e rodada identificada; testes
unitários não encerram o gate da IA nem a prova de privilégio mínimo nos motores.

Este documento organiza as pendências em dezesseis etapas. O [estado](README.md)
resume o que já existe; a [matriz de aceite](acceptance.md) define critérios e o
[índice de validação](validation.md) reúne as rodadas, sem duplicar seus resultados.

**Implementação pendente** é uma lacuna funcional. **Homologação pendente** é uma
capacidade existente sem prova integral aceita. **Dependência externa** exige
ambiente, acesso ou material revisado e não permite skip de aceite.

Escopo vigente: PostgreSQL, SQL Server e SQL Anywhere. DV2-015 dispensa validação
manual de HTTPS/ChatGPT e aceite funcional humano; DV2-016 dispensa o teste
específico do agente 1.8.6, inclusive instalado/VM. Não registrar as dispensas
como testes aprovados nem remover verificações técnicas. Ver [decisões](decisions.md).
O [manifesto](../../contracts/persona-v2-release.json) permanece
com ready:false e sem gates concluídos; nenhuma etapa intermediária libera deploy.

**Prioridade imediata:** encerrar lacunas identificadas por caminho de código e
concluir evidências do candidato. Homologação instalada da distribuição do agente
é distinta do corte restrito do hub; não declarar essa distribuição aprovada pela
atualização do servidor. A [rodada da imagem exata do CI](validation/2026-10-24-exact-ci-image-chain.md)
registra os resultados atuais, falhas preservadas e lacunas por gate. A
[correção da troca de base no treinamento compartilhado](validation/2026-10-23-query-source-knowledge-reset.md)
remove o vínculo antigo somente da edição local, com confirmação, sem mudar
o snapshot publicado. Sua imagem e verificações são posteriores à rodada de 85. A
[repetição integral com jornadas OAuth independentes](validation/2026-10-23-shared-knowledge-journey-budget.md)
passou nos 85 casos, sem filtro, após preservar a falha de timeout da rodada
anterior de 82. A separação conserva as verificações e o prazo de 60 segundos;
não prova a causa da variabilidade anterior nem encerra os gates. A
[seleção de tabela/view](validation/2026-10-23-query-view-editor.md) foi ligada ao
editor privado e à publicação. O [recorte nativo de views](validation/2026-10-23-native-view-chain.md)
complementa o Chromium com inspeção, paginação e policy reais nos três motores,
sem encerrar a matriz ampliada ou certificar a suíte inteira de 82 casos. A
[correção dos modos e ensaio parametrizado](validation/2026-10-23-query-parameter-reset.md)
limpa escolhas antigas na navegação e valida treinamento/consulta com parâmetro
inteiro nos três motores. Não encerra a matriz ampliada de tipos/parâmetros. A
[edição do caminho N:N das consultas](validation/2026-10-23-query-relationship-paths.md)
completa intermediárias/elos antes disponíveis apenas nos dados e no editor SQL.
Não altera validação, concessões ou snapshots publicados. A
[releitura protegida de consultas](validation/2026-10-23-query-training-reload.md)
foi entregue, incluindo recuperação de conflito e descarte de casos locais.
O ensaio nos três motores confirmou que alterar nome/SQL do rascunho não muda
o snapshot executado. O
[ensaio de treinamento atualizado](validation/2026-10-23-manual-training-guidance.md)
passou no navegador e na cadeia dos três motores, em nova imagem local e janela
estável. Corrigiu orientações antigas sobre runners, setups e busca/grafo; não
encerra o roteiro humano, a avaliação da IA ou os gates de produção. A
[montagem isolada do aplicativo](validation/2026-10-23-agent-source-build.md)
inicial foi recusada por redistribuível C++ inferior ao compilador. A
[rodada com runtime privado](validation/2026-10-23-agent-private-runtime-package.md)
resolveu isso sem instalar componentes no host: aplicativo novo e pacote privado
foram produzidos e reconferidos. O
[bootstrap compilado e reinício](validation/2026-10-23-native-desktop-persistent.md)
passou com hub Prisma, DPAPI e descoberta RPC reais, em inventário estável.
Homologação integral de atualização/recuperação continua pendente. A
[preparação das fases instaladas](validation/2026-10-23-installed-fixture-handoff.md)
agora recusa resultados antigos e fixa handoff/claim por tentativa antes do
dispatch. O teste com UAC foi autorizado nesta máquina: a primeira instalação
isolada revelou incompatibilidade do bootstrap com a checagem real de assets.
A tentativa foi registrada como falha e desinstalada. Após correção e nova
compilação, passaram nove etapas administrativas e nove grupos sem elevação,
incluindo reparo, supervisor histórico, reinstalação, retenção privada e
desinstalação final. Resíduos exclusivos foram limpos e evidências preservadas.
Esse recorte não certifica apply/probation/rollback automático, o aplicativo
operacional ou todas as alterações atuais do agente. A
[ligação explícita da prova ao empacotamento](validation/2026-10-23-agent-package-source-binding.md)
foi exercitada no novo pacote; não qualifica retrospectivamente o pacote
`bytes_only` anterior nem toda a origem do instalador. A
[sessão contínua de treinamento manual](homologation-chain.md#sessão-contínua-para-treinamento-manual)
está disponível como fixture local com controle vazio, servidor/worker, prazo e
parada explícitos. A [validação da sessão](validation/2026-10-22-manual-training-session.md)
não encerra instalação, aceite humano, IA ou gates de produção. A
[proteção da chamada direta e suíte reproduzível](validation/2026-10-22-manual-session-access.md)
foi acrescentada sem ampliar limites ou permissões. A
[rodada consolidada do treinamento](validation/2026-10-22-training-full-gates.md)
executou release:check, resolveu as omissões condicionais em serviços separados
e repetiu os 79 cenários da cadeia sem filtro, com inventários estáveis. Essa
evidência vale para os snapshots/imagem registrados; não encerra instalação,
IA, jornadas restantes ou aceite dos gates. A
[cadeia completa com o cofre corrigido](validation/2026-10-20-candidate-vault-full-chain.md)
já passou nos 79 cenários, sem filtro, incluindo navegador e recuperação nos
três motores. A [regressão completa do console](validation/2026-10-20-console-full-corrected.md)
também está registrada. Não recolocar essas rodadas como não executadas nem
tratá-las como aceite instalado, avaliação da IA ou autorização de produção.
Rodadas anteriores, falhas e correções estão no [índice de evidências](validation.md).

A [revisão do runner e das pendências](validation/2026-10-22-chain-source-inventory.md)
acrescenta captura automática antes/depois dos três checkouts: commit-base,
hash dos arquivos locais e contagem. Divergência recusa a rodada, sem repetir
ou alterar SQL. Não certifica retrospectivamente as rodadas anteriores.

O [onboarding](onboarding.md#roteiro-de-teste-manual-do-treinamento) contém o
roteiro manual com resultados esperados, prazo humano e concessões explícitas.
O ensaio não substitui os gates de produção. Uma nova rodada completa revelou
perda/intercalação de metadados concorrentes no observador de fixture do agente.
A gravação foi serializada e a regressão reproduziu/corrigiu a perda. A
[repetição integral na imagem candidata](validation/2026-10-22-manual-training-candidate.md)
passou, com inventário estável e versões dos motores preservadas; não descarta
a rodada que falhou nem substitui aceite instalado, IA ou HTTPS/ChatGPT manuais.

As tabelas abaixo conservam as dezesseis frentes e seus critérios de aceite.
Menções genéricas a “jornadas restantes” não são um inventário confirmado de
funcionalidades ausentes: antes de implementar, localizar serviço/rota/tool e
suas evidências. Revisão/incorporação humana de catálogos e aprovação humana de
efeitos são restrições deliberadas; não converter essas ações em tools delegadas.

## Prontidão para treinamento manual local

### Conferência de código para deploy — 2026-10-24

Procedimento produtivo separado agora disponível em `scripts/persona-production.ts`
e `src/infrastructure/persona-v2/production-procedure.ts`, com fases check/migrate/start,
aceite obrigatório, origem/arquivo/ID da imagem, lock local e recusa de serviços
ativos. O script legado foi inspecionado: troca checkout e usa rollback automático
de um único serviço, portanto não foi reutilizado. Restam ensaio Linux instalado,
supervisão, recuperação/proxy e integração remota após aceite; a recusa de produção
do runtime permanece. [Procedimento e limites](production-distribution.md#procedimento-de-operador-separado).

Continuação da inspeção: `main-persona-v2.ts` fechava HTTP/runtime sem compartilhar
a parada entre sinais e sem tratar rejeição do fechamento. A entrada agora usa
`src/infrastructure/persona-v2/server-shutdown.ts`: uma única Promise, drenagem
HTTP antes dos recursos, prazo total de dez segundos e saída não zero em falha.
Regressões cobrem requisição HTTP local em andamento, sinais representados por
chamadas concorrentes, falha de fechamento e timeout. Não certificam sinais no
contêiner, efeito SQL remoto, supervisor instalado ou corte produtivo.

Recorte estático do checkout, sem certificar infraestrutura ou os demais projetos:

| Frente                | Evidência no código                                                                                                                                           | Pendência efetiva                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada produtiva     | `docker-entrypoint-persona-v2.sh`, `src/composition/compose-persona-v2.ts` e `src/worker-persona-v2.ts` recusam produção                                      | Preparar o runtime de corte somente com os gates satisfeitos; não retirar a guarda como correção isolada.                                         |
| Envio ao servidor     | Workflow ainda chama `deploy SHA` legado; procedimento local v2 separado implementado e script legado inspecionado                                            | Ensaiar procedimento em Linux e preparar integração remota/supervisão; não reutilizar rollback legado.                                            |
| Configuração          | `src/config/persona-production.ts` tinha aceitação de overrides PostgreSQL na query                                                                           | Corrigida a ambiguidade de host/porta/usuário/senha/banco; TLS permanece permitido. Preflight não verifica conectividade nem isolamento real.     |
| Imagem e gates        | CI já possui produtor `persona-v2-candidate`; `check-persona-release.mjs` e `persona-release-evidence.mjs` exigem evidências e aceitam `technically_verified` | Executar a rodada produtora e completar evidências do candidato exato; não falta criar o produtor ou dispensar aceite humano novamente.           |
| Administração externa | `compose-persona-v2.ts`, `persona-v2-admin.ts` e `persona-v2-administration-tools.ts` conectam serviços de gestão/edição externa                              | Ampliar homologação dos caminhos existentes; ausência funcional não pode ser inferida de “gestão restante”.                                       |
| Datasets editoriais   | `dataset-case-seeds.ts` interpreta o rascunho com `queryTrainingSchema`; rotas administrativas expõem sementes/opções                                         | Estender a integração editorial para casos de operações/cruzamentos, com contratos próprios, sem converter o esquema de consulta automaticamente. |

Os caminhos acima são relativos à raiz; os arquivos HTTP/MCP ficam em
`src/infrastructure/`, e datasets em `src/application/persona-v2/`.
Esta conferência não examinou o instalador do agente, o servidor de destino ou
toda a matriz funcional. Pendências genéricas de dialetos/console continuam
exigindo cenário e caminho concretos antes de serem tratadas como código ausente.
DV2-015 e DV2-016 prevalecem sobre exigências históricas de validação manual e
compatibilidade específica do agente 1.8.6; os demais testes continuam exigidos.

O ensaio local não exige o corte de produção. A imagem candidata, servidor,
worker, hub e agentes usam fixtures novas e isoladas; não substituir a entrada
legada nem apontar o teste para fontes operacionais. O percurso básico está
implementado e foi ensaiado tecnicamente, conforme as evidências abaixo.
Isso libera a preparação do ensaio humano local, sem aceitar os gates de produção.

| Requisito do ensaio                            | Estado e evidência atual                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controle vazio, serviços persistentes e parada | Implementado; a [sessão na imagem atual](validation/2026-10-23-query-source-knowledge-reset.md#percurso-de-treinamento-pela-cadeia-persistente) inicia vazia, encerra servidor/worker e preserva inventários.                                                               |
| Criar persona e cadastrar várias bases         | Implementado e exercitado no navegador pela cadeia dos três motores na mesma rodada.                                                                                                                                                                                        |
| Treinar estrutura, exemplos e parâmetros       | Implementado; console completo e treinamento parametrizado passaram na imagem identificada.                                                                                                                                                                                 |
| Orientações do consumidor MCP                  | [Contradições corrigidas e verificadas no MCP](validation/2026-10-23-training-guidance-contract.md), com percurso de treinamento repetido na imagem local nova pelos três motores. Comparação de bytes delimita a mudança; avaliação da IA permanece separada.              |
| Referências compartilhadas e perfil físico     | Adoção explícita implementada; [matriz compartilhada](validation/2026-10-23-shared-knowledge-journey-budget.md) e [troca de base corrigida](validation/2026-10-23-query-source-knowledge-reset.md) têm escopos/snapshots próprios.                                          |
| Revisar e publicar com prazo humano            | Implementado; preview/hash, confirmação e snapshot ativo foram verificados no percurso. Casos obrigatórios continuam exigindo relatório atual.                                                                                                                              |
| Consumidores restritos e consulta com dados    | Implementado; treino pela cadeia verifica tokens distintos, parâmetros, dados, vazio e recusas, sem hospedar IA.                                                                                                                                                            |
| Publicação com casos obrigatórios e CLI real   | Implementada e [repetida na imagem atual](validation/2026-10-23-query-source-knowledge-reset.md#publicação-com-casos-na-imagem-atual) nos três motores, em fixture nova separada. Relatório obsoleto recusa publicação; CLI não é substituído por aprovação HTTP/MCP.       |
| Roteiro e acesso humano                        | [Roteiro](onboarding.md#roteiro-de-teste-manual-do-treinamento) e [lançador/parada](homologation-chain.md#sessão-contínua-para-treinamento-manual) disponíveis. Iniciar sessão nova; testes automáticos não deixam acesso aberto. Segredos só no arquivo privado/navegador. |
| HTTPS público, ChatGPT e resposta da IA        | Validação manual externa, ainda sem aceite. Não inferir sua aprovação a partir do Chromium ou da cadeia técnica.                                                                                                                                                            |

O catálogo Data7 pode começar vazio. O responsável precisa fornecer/revisar o
material de negócio; não inventar tabelas, relações ou resultados para completar
o roteiro. Registrar a experiência humana separadamente, incluindo falhas e
impedimentos, sem copiar credenciais ou dados operacionais nas evidências.

## Situação e frente inicial do plugin

Montagem/validação offline, identidade visual, variantes legada/v2, OAuth próprio
e orientação de treinamento delegado estão entregues em desenvolvimento.
A [correção das fixtures sob ancestral build](validation/2026-10-23-plugin-fixture-build-ancestor.md)
preserva a validação em checkouts isolados, sem mudar pacotes ou runtime.
A instalação privada e conversa nova no cliente real permanecem manuais.
Contrato e limites: [plugin](plugin.md); continuação nas etapas 10 e 15.

## Ordem

Cada etapa entrega código, contrato, schema, documentação e testes do
comportamento novo. As jornadas do console acompanham o serviço correspondente.
Migrations novas são aditivas; as já aplicadas permanecem intactas. Nenhuma
etapa intermediária libera deploy.

| Etapa | Ainda falta                                                              | Depende de                                              | Projetos                   |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------- |
| 1     | Ambiente persistente de homologação e registro do candidato testado      | Estado atual                                            | MCP, hub, agente           |
| 2     | Homologação do ciclo de fontes, revogação em trânsito e procedimento DBA | 1                                                       | MCP; hub/agente na prova   |
| 3     | Aplicar administração delegada às jornadas restantes                     | 1–2                                                     | MCP e hub                  |
| 4     | Fechar lacunas de curadoria, compatibilidade e gestão editorial          | 2–3; inspeção/adoção SELECT, propostas e tools iniciais | MCP, hub, agente           |
| 5     | Gramática e identificação qualificada restantes; homologação ampliada    | 2–4                                                     | MCP, hub/agente            |
| 6     | Ampliar matriz dos runners já implementados e concluir aceite            | 1, 4–5                                                  | MCP, hub, agente           |
| 7     | Semântica e homologação operacional dos cruzamentos                      | 5–6                                                     | MCP e cadeia dos motores   |
| 8     | Recuperação distribuída e janelas de queda restantes                     | 2–3, 5–6                                                | MCP, hub, agente           |
| 9     | Manutenção e homologação operacional das integrações                     | 3–4, 8                                                  | MCP                        |
| 10    | Manutenção OAuth e homologação manual ChatGPT v2                         | 2–4                                                     | MCP, hub e cliente privado |
| 11    | Homologação operacional do cache e anexos já implementados               | 3, 5, 7–8, 10                                           | MCP                        |
| 12    | Manutenção restante e homologação instalada de worker/cofre/outbox       | 8–11                                                    | MCP, hub, agente           |
| 13    | Diagnóstico, acessibilidade e gestão editorial restantes                 | 2–12                                                    | MCP/web                    |
| 14    | Distribuição candidata e homologação do corte                            | 1–13                                                    | MCP, hub, agente           |
| 15    | Homologação integral, IA e revisão final                                 | 1–14                                                    | Três projetos e cliente    |
| 16    | Ensaio de corte e liberação coordenada                                   | Evidências das etapas 1–15 aceitas                      | Três projetos              |

Contratos e fixtures podem ser preparados antes. Capacidades ainda incompletas
permanecem indisponíveis. A evidência para encerrar cada gate continua na matriz de aceite.

### Tipo de pendência e referência

As dependências entre etapas e projetos estão na tabela anterior. A evidência de
conclusão é a descrita na seção de cada etapa e na matriz de gates abaixo.

| Etapa | Implementação pendente                                                               | Homologação pendente / dependência externa                                          | Contrato principal                          |
| ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| 1     | Instalador e configuração candidata; concorrência do cofre corrigida                 | Ciclo instalado e cenários operacionais; bootstrap nativo já revalidado             | [Cadeia](homologation-chain.md)             |
| 2     | Ciclo entregue em desenvolvimento; ajustes revelados pela homologação                | Autoridade persistente, revogação em trânsito; DBA e restauração                    | [Identidade](source-identity.md)            |
| 3     | Aplicação da delegação existente aos serviços administrativos restantes              | Autoridade ativa, concorrência e revogação                                          | [Onboarding](onboarding.md)                 |
| 4     | Gestão editorial delegada, impacto e lacunas de compatibilidade/curadoria            | Completar prova estrutural e conteúdo Data7 revisado                                | [Conhecimento](shared-knowledge.md)         |
| 5     | Gramática/caminhos qualificados restantes; finalidades e limites já entregues        | Drivers, tipos, views e paginação dos três motores                                  | [Consultas](source-queries.md)              |
| 6     | Extensões de casos e integração editorial; runners genéricos já entregues            | Publicação pela cadeia persistente nos três motores                                 | [Catálogo](catalog.md)                      |
| 7     | Semântica de correspondência restante                                                | Incompletude, falha e revogação na cadeia persistente                               | [Cruzamentos](federation.md)                |
| 8     | Fluxos restantes de recuperação; retenção de operações já entregue                   | Quedas reais, outputs, contagens, cancelamento e reinício                           | [Operações](sql-operations.md)              |
| 9     | Manutenção restante; cadastro direto, descoberta e importação já entregues           | Serviços externos isolados, SSRF e conciliação                                      | [Integrações](external-integrations.md)     |
| 10    | Manutenção restante; OAuth, setups e revogação de conexões já entregues              | HTTPS público e ChatGPT manual; demais regressões do candidato                      | [OAuth](oauth.md)                           |
| 11    | Eventual reuso estrutural; cache/singleflight/anexos já entregues                    | Redis/proxy instalados, carga/OOM e candidato operacional; fixtures já validadas    | [Consultas](source-queries.md)              |
| 12    | Correções reveladas pela homologação; quatro jobs/cofre e retenção da fila entregues | Frota/receptor/supervisor, backups e infraestrutura; concorrência local já validada | [Operações](sql-operations.md)              |
| 13    | Editores/gestão restantes; ações do consumidor em preparações já disponíveis         | Chromium, teclado, leitor de tela, móvel e zoom real                                | [Console](console.md)                       |
| 14    | Configuração de produção e corte; reset local entregue                               | Imagens locais, migrations e preservação dos bancos                                 | [Estado](README.md)                         |
| 15    | Correções reveladas pela matriz                                                      | Três motores persistentes, plugin real e avaliação da IA                            | [Aceite](acceptance.md)                     |
| 16    | Substituição de entradas após aceite                                                 | Ensaio coordenado com versões compatíveis e evidências aceitas                      | [Aceite](acceptance.md#coordinated-cutover) |

| Gate                                    | Etapas                        |
| --------------------------------------- | ----------------------------- |
| `identity-and-authorization`            | 1–3, 5, 10–11, 15             |
| `training-and-local-query`              | 4–6, 11, 13, 15               |
| `federation`                            | 6–7, 11, 13, 15               |
| `agent-operation-journal`               | 1, 8, 12, 14–15               |
| `hub-operation-contract`                | 1, 3, 8, 14–15                |
| `operation-approval-and-reconciliation` | 6, 8, 12–13, 15               |
| `external-rest-and-mcp`                 | 6, 9, 12–13, 15               |
| `oauth-and-console`                     | Frente plugin, 2–3, 10–13, 15 |
| `postgres-real`                         | 1, 5–8, 14–15                 |
| `mssql-real`                            | 1, 5–8, 14–15                 |
| `sybase-real`                           | 1–2, 5–8, 14–15               |
| `coordinated-cutover`                   | Frente plugin, 12, 14–16      |
| `shared-knowledge-and-compatibility`    | 2–6, 11, 13–15                |

## Etapa 1 — Ambiente persistente

Manter os guards de CI, imagem e deploy. Registrar a revisão efetiva dos
arquivos locais, além do HEAD. Conferir portas, OpenAPI/OpenRPC, capabilities
e a distinção commit-base, patch e snapshot SHA-256.

PostgreSQL/Prisma do hub, bancos separados, processos próprios MCP/hub,
autenticação/aprovações reais e reinício estão no runner padrão `prisma` da
[cadeia](homologation-chain.md). O modo `memory` é explícito e não substitui
essa evidência. O MCP não cria contas nem agentes.

Configuração do agente, credenciais ODBC, sessão hub e tokens já usam os
repositórios reais Drift/FlutterSecure e cofre Windows DPAPI isolado. Reinício
sem bootstrap e recuperação dos quatro journals estão no runner da cadeia.
O [bootstrap desktop nativo recompilado](validation/2026-10-20-native-desktop-bootstrap.md)
passou nos perfis vazio e configurado, incluindo reinício, cofre DPAPI e refresh.
O hub desse runner usa autoridade em memória e o banco de negócio fica
inacessível deliberadamente; não substitui a cadeia Prisma ou o ciclo instalado.
O ciclo privado instalado foi exercitado com UAC na
[rodada isolada](validation/2026-10-23-installed-fixture-handoff.md); continuam
aplicação automática entre builds e cenários operacionais restantes, sem aceite
da etapa inteira. A falha de concorrência do cofre foi
corrigida e revalidada nas rodadas abaixo; não é implementação ausente.
O agente também já possui fixture Windows de instalação/reparo/reinstalação e
desinstalação com identidade própria, além de fixtures Pascal compiladas. Não
reimplementar esse ciclo: o ensaio histórico do agente não certifica o candidato
atual, atualização para build novo ou recuperação privilegiada completa.
A [correção do runner de instalação](validation/2026-10-22-agent-installer-isolation.md)
remove dependência/leitura do estado operacional e verifica posse dos caminhos
antes de abrir manifestos/artefatos. Relatório não afirma preservação integral
do host nem conserva aprovação se a conferência final falhar. O provisionador
agora exige revisão histórica explícita do supervisor antigo, em vez de usar
HEAD com contrato novo; a compilação histórica privada e sua atualização explícita
com UAC foram validadas. Janelas de falha e apply/probation/rollback do serviço
instalado continuam pendentes para o candidato operacional.
A [vinculação do payload e inspeção sem elevação](validation/2026-10-23-agent-fixture-payload.md)
está implementada no agente: manifesto de fixture 2, inventário completo,
revalidação nas fases e inspeção somente de metadados. Hashes são evidência de
bytes, não de origem do build. O bundle novo com origem vinculada e
armazenamento/bootstrap privados já foi produzido e testado conforme as evidências
acima. Copiar o Release existente e reescrever somente o instalador/updater não
isola o namespace Dart do app.
Não tratar esse pacote como prova de startup/logon ou de atualização entre builds.
O [runner concorrente do cofre](validation/2026-10-20-agent-vault-concurrency-failure.md)
reproduziu uma falha real em armazenamento isolado. A
[correção local](validation/2026-10-20-agent-vault-concurrency-fix.md) passou na
regressão concorrente e na
[cadeia persistente da revisão](validation/2026-10-20-candidate-vault-full-chain.md).
Condições operacionais restantes e evidências completas ainda são necessárias
antes do aceite.

Preparar HTTPS, proxy, DNS e Redis dedicados quando o ensaio os exigir, sem
herdar `.env`, credenciais ou DSNs operacionais. Controlar queda e reinício,
observar somente metadados e limpar apenas recursos com caminho, rótulo, porta
e propriedade verificados.

O destino final informado é o servidor existente em
`https://mcp.se7esistemassinop.com.br`. Preparar endereço próprio de homologação,
serviços, bancos, volumes e segredos separados, preservando a aplicação atual.
DNS/proxy/TLS externos ainda não foram provisionados por esta implementação.

Conclusão: a fixture persistente inicia, autentica, sobrevive a reinício e
remove somente os próprios recursos. O relatório separa transporte real,
autoridade persistente, cofre, TLS e Redis efetivamente exercitados.

## Etapa 2 — Ciclo de vida ainda aberto

Edição de persona, metadados/recortes da fonte e rotação de credenciais com
prova pelo hub/agente já estão no [onboarding](onboarding.md). Falta:

Suspensão/recuperação da persona já está implementada em desenvolvimento por
CAS e sessão Client: bloqueia consumidores, suspende publicações e revoga
concessões derivadas. Recuperar não ressuscita concessões ou publicações.
Contrato e limites no [onboarding](onboarding.md#suspensão-e-recuperação-da-persona).
Homologação com autoridade persistente e revogação em trânsito continua pendente.

Suspensão, recuperação e substituição explícitas de fontes estão implementadas
em desenvolvimento com sessão Client, CAS, revisão de impacto e histórico
transacional. Recuperação confirma a mesma identidade pelo hub/agente e não
reativa publicações; substituição cria novo ID/credencial, sem transferir
treinamento ou concessões. Vínculo substituído fica irrecuperável. Migration
aditiva 0011 e contrato no [onboarding](onboarding.md#suspensão-recuperação-e-substituição-de-fontes).

Recuperação e substituição pela cadeia persistente nos três motores, com
publicações/concessões independentes, estão na [rodada de 2026-10-13](validation/2026-10-13-source-lifecycle.md).
Isso não encerra os casos de revogação, privilégio mínimo e restauração abaixo.

Falta homologar revogação em trânsito e permissões mínimas de leitura da identidade em cada motor e o
procedimento DBA do SQL Anywhere: marcador reservado, UUID válido, SELECT
mínimo, cópia com UUID novo offline e restauração da mesma fonte com revisão
das operações pendentes. O runtime não cria nem repara o marcador.

Conclusão: responsável A usa fonte do Client B; troca de e-mail não perde
personas; credenciais não se misturam; troca homônima suspende só os vínculos
afetados. Falha de transporte bloqueia uso e não conta como prova de troca.
Cópia que conserva todos os identificadores observáveis continua indistinguível.

## Etapa 3 — Token administrativo

### Lacunas verificadas no código em 2026-10-20

Fundação de escopo `managedIntegrationIds` implementada no contrato de permissões,
teto e serviço de gestão. Ausência conserva negação em tokens antigos; OAuth não
herda escopo sem consentimento próprio. [Regressão dirigida](validation/2026-10-20-integration-management-scope.md).
Rotas/tools estão ligadas e [validadas no transporte local](validation/2026-10-20-integration-management-transport.md).
Consentimento explícito OAuth está ligado, com
[regressão PostgreSQL](validation/2026-10-20-integration-management-oauth.md).
Seletores de concessão na emissão/edição de tokens estão ligados e
[validados no Chromium](validation/2026-10-20-integration-management-console.md).
[Gestão Bearer com hub persistente](validation/2026-10-20-integration-management-persistent.md)
comprova escopo, CAS, reinício e revogação remota.
A [rodada OAuth persistente](validation/2026-10-20-integration-management-persistent-oauth.md)
confirma consentimento limitado, conexões independentes e revogação remota.
Rascunhos/publicação externos delegados estão ligados por serviço, HTTP e MCP.
Criação/edição MCP, casos do rascunho e releitura OAuth após reinício passaram
na [rodada persistente dirigida](validation/2026-10-20-external-editor-persistent.md).
Publicação por OAuth com hub persistente passou na
[rodada dirigida](validation/2026-10-20-external-publication-persistent-oauth.md),
incluindo prévia vinculada à conexão, consumo único e token sem ampliação.
Continuam abertos a matriz concorrente ampliada e o candidato final.
O fluxo ainda não está integralmente validado para consumidor.

Evitar interpretar “administração restante” como ausência dos casos/relatórios,
setups ou gestão de tokens já entregues. Os caminhos concretos e sua validação
restante são:

| Serviço                        | Caminhos atuais                                                                                                            | Continuação                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `PersonaIntegrationManagement` | `list`, `review`, `state` já aceitam consumidor                                                                            | Escopo, impacto/CAS e rotas entregues; rodadas dirigidas Bearer/OAuth com hub persistente passaram, aceite integral pendente |
| `PersonaExternalIntegrations`  | `create`, `detail`, `update`, `drafts` aceitam consumidor por serviço/HTTP/MCP; casos não publicados usam escopo editorial | Ampliar homologação persistente/OAuth e cenários de transporte                                                               |
| `PersonaExternalIntegrations`  | `preview`, `publish` vinculam autoridade exata e prazo humano prévio                                                       | Ampliar testes de transporte e hub persistente; aprovação de efeito permanece humana                                         |

Criação/rotação de credenciais permanece no navegador por console/setup com
reautenticação. Não transformar esses métodos em entrada de segredos por tool.
Publicar catálogo, revisar/incorporar propostas compartilhadas e aprovar efeitos
continuam ações humanas previstas no contrato, não lacunas a preencher por Bearer.
Leitura/importação de template exato e propostas próprias já têm caminhos delegados;
isso não autoriza expor a biblioteca inteira.

Casos/relatórios externos usam administração delegada por MCP e HTTP
Bearer/OAuth: contrato publicado exige concessão exata; rascunho não publicado
exige escopo editorial da integração. Edição por CAS invalida relatórios e
preserva snapshot. Criação de rascunhos também está delegada pelos caminhos
acima; runner e aprovação de efeitos não são delegados.
O [cenário persistente dirigido](validation/2026-10-19-external-delegation-persistent.md)
verifica edição, persistência após reconstrução do MCP e revogação diretamente
no hub com registro local ativo. Não certifica provedor externo, OAuth completo
ou a matriz integral; HTTPS/ChatGPT permanecem manuais.

**Avanço implementado:** teto administrativo explícito no hub/MCP (contrato
aditivo 1.8.0, migrations próprias), seleção no console e consentimento OAuth.
Treinamento/publicação privados usam a unidade autorizada de sessão/Bearer/OAuth,
com fontes concedidas, preview vinculado à autoridade e auditoria do token autor.
Listagem/edição/revogação de outros tokens aplicam teto de delegação, CAS,
consentimento e prazo. [Contrato](onboarding.md#administração-delegada-por-consumidor).

**Emissão limitada implementada:** proposta imutável, login/confirmação humana,
teto vigente e consumo transacional no [setup próprio](oauth.md#setup-de-emissão-com-concessões-limitadas).
**Continua pendente:** homologação ampliada do editor externo delegado e das
jornadas restantes de manutenção/curadoria, concorrência e revogação durante
entrega na matriz integral. `gerenciar_integracoes` pode ser selecionada no teto
do hub e habilita setups com consentimento explícito; gestão de integração e
contratos exige também managedIntegrationIds em cada camada. Não concede execução.
Não considerar toda esta etapa ou algum gate concluído.

Listar, editar concessões de consulta/cruzamento/operação SQL, rotacionar e revogar já estão
no [console](console.md). Falta:

1. Ampliar a matriz concorrente de revogação remota, CAS, commit local e entrega
   nos serviços delegados existentes. Rede fica fora da transação MCP; não
   prometer atomicidade distribuída. [Contrato](oauth.md#delegação-administrativa-e-setups-temporários).
2. Conservar como implementados os serviços de gestão/rascunho/publicação
   externos da tabela acima, setups de fontes/tokens/integrações e manutenção
   delegada de tokens. Qualquer lacuna funcional adicional precisa identificar
   o caminho e o cenário que falha; a frase “serviços restantes” não comprova
   ausência de autorização, unidade de trabalho ou prova do responsável.
3. Curadoria de catálogo e aprovação humana de efeitos permanecem reservadas
   aos papéis autenticados correspondentes. Não são permissões Bearer pendentes.

Conclusão: matriz positiva e negativa de cada permissão, outra persona,
autoelevação e publicação ampliada. Revogação concorrente impede commit e
entrega. Resultado técnico já persistido não é entregue a consumidor revogado.

## Etapa 4 — Conhecimento executável e curadoria

Preparação explícita de sementes do dataset de origem para casos de consulta
está ligada ao console e à sessão Client, com revisão/fonte/catálogo vigentes,
sem salvar ou aprovar testes. [Alcance](knowledge-library.md#preparar-sementes-de-um-caso-de-consulta).
Casos de consulta agora conservam a origem editorial validada e hashes das
sementes originais/salvas, sem inferir aprovação ou origem de casos antigos.
A escolha explícita de outras versões de dataset do mesmo template está ligada
ao console, com paginação autorizada, sem carregar linhas ou alterar casos ao
selecionar. Isso não conclui datasets de operações/cruzamentos.
[Rodada da seleção](validation/2026-10-22-dataset-case-choice.md) registra
paginação, isolamento, migration aditiva e runners nos três motores, sem
encerrar a matriz integral.
[Validação da linhagem](validation/2026-10-22-dataset-case-origin.md) separa
console/autoridade sintética da cadeia persistente. A primeira rodada de runners
foi recusada por mudança concorrente do agente; a repetição coordenada passou
com inventários estáveis. O recorte não encerra a matriz integral.
A [rodada da entrega](validation/2026-10-22-dataset-case-seeds.md) valida a
preparação no PostgreSQL/Chromium e seu uso explícito pelo runner nos três
motores, com imagem candidata local. O recorte dirigido não encerra a matriz
integral nem substitui a revisão dos demais tipos de caso.

SQL Anywhere 16 tem prova nativa limitada de constraints locais declaradas,
índices físicos e configuração de integridade para FK. Constraints desconhecidas
continuam bloqueadas; outras versões e índices comuns/virtuais não são habilitados.
[Rodada e limites](validation/2026-10-15-sqlanywhere-constraints.md). A etapa continua
parcial, com matriz adversarial e ampliação de alcance pendentes.

O catálogo administrativo está em [conhecimento compartilhado](shared-knowledge.md).
**Avanço implementado:** inspeção por `sql.describeSchema`/`sourceSchema` v1,
evidências imutáveis (0013), comparação técnica e adoção inicial em snapshots de
consultas. Perfis físicos têm rascunho CAS, revisão, publicação imutável e adoção
explícita; curadores precisam de acesso vigente à mesma base. O SELECT confere
colunas e constraints utilizadas na própria conexão antes/depois; revogação ou
suspensão do catálogo/padrão/perfil bloqueia dependências. Contrato hub aditivo 1.12.0,
sourceConstraints v1; migrations 0014–0015 preservam identidade interna/nativa.
Console oferece escopo de inspeção paginado, diagnóstico de compatibilidade,
editor de perfis CAS com publicação por curador e adoção explícita no rascunho
de consultas. Listagens isolam catálogo, padrão-base e identidade física/nativa;
seleção não modifica publicações nem concede capacidades aos tokens.
Fila inicial de propostas tipadas, revisão por curador com preview/hash/CAS e
incorporação somente ao rascunho estão entregues em desenvolvimento (0016).
Tools de leitura entregam recorte adotado da skill concedida. Propostas MCP exigem
treinar/delegação/consentimento, skill concedida e papel no catálogo; exemplos
explícitos entram candidatos, sem execução ou aprovação automática.
[Alcance](shared-knowledge.md#curadoria-e-ferramentas-mcp).
Isso não conclui a etapa nem seu gate.
Busca lexical ampliada e grafo por skill estão implementados em desenvolvimento,
com índice reconstruível 0017, referências/origem e paginação vinculada à
autorização. Console usa o token do consumidor e oferece envio estruturado dos
quatro tipos de proposta ao padrão. A biblioteca editorial é descrita no item 3;
adoção DML e seus relacionamentos estão implementados no alcance do item 4,
com ampliação da prova SQL Anywhere além da versão 16 local e matriz integral pendentes.
Curadoria física está entregue em desenvolvimento (0018): propostas com origem
imutável, console/MCP, prova atual da mesma base e revisão por preview/hash/CAS.
Incorporar altera somente rascunho; publicação, adoção e concessão permanecem
separadas. [Contrato](shared-knowledge.md#curadoria-de-particularidades-físicas).
[Rodada parcial](validation/2026-10-14-physical-curation.md) separa persistência,
console e cadeia real dos três motores. Não encerra o gate.
Feedback explícito por item concedido e calendário separado por publicação estão
entregues em desenvolvimento (0019): fila editorial, encaminhamento a proposta
existente, CAS e histórico. Prazo é escolhido pelo curador; avisos/tarefas vencidos
são calculados sob demanda, sem suspensão. [Contrato](shared-knowledge.md#feedback-e-revisão-temporal).
[Rodada parcial](validation/2026-10-14-knowledge-feedback-review.md) registra
isolamento, calendários e encaminhamento; não encerra o gate.
Falta:

1. Ampliar prova SQL Anywhere além de constraints locais declaradas na versão 16 e matriz adversarial
   de constraints/relações/perfis, homologação ampliada da adoção DML e
   histórico editorial ampliado de perfis. A comparação de snapshots publicados
   do mesmo perfil está implementada no console, com autorização vigente e
   diferenças produzidas pelo servidor ([validação dirigida](validation/2026-10-19-profile-comparison.md)).
   Não adota versões nem altera skills. Composição explícita de páginas
   está implementada em desenvolvimento (0022), com linhagem, menor validade e
   recusa de conflitos/lacunas. [Contrato](shared-knowledge.md#composição-de-páginas).
   A [rodada ampla dos três motores](validation/2026-10-14-wide-structure.md)
   comprovou dezesseis recursos em quatro páginas, JOINs entre páginas e uma view
   concedida por policy explícita. Corrigida a inspeção de views regulares SQL
   Anywhere. Coluna fora do treinamento preserva a consulta; drift em coluna
   treinada recusa dados e suspende a publicação utilizada, conservando consulta
   independente. Isso não encerra a matriz integral ou mínimos privilégios no motor.
   Homônimo não compartilha prova.
   Relações reversas e caminhos N:N têm adoção inicial por consulta: FK na filha,
   unicidade em 1:1, intermediárias/elos fixados e recusa de atalho. Importação
   de template e console preservam o caminho. A
   [rodada de relacionamentos](validation/2026-10-14-relationship-paths.md)
   valida ponte composta e remoção de FK pela cadeia persistente; SQL Anywhere
   continua recusando dependências com enforcement desconhecido. Essa entrega
   não encerra todas as combinações, perfis ou adoção compartilhada em DML.
   Fundação DML entregue no agente: `expectedStructure` entra no hash local,
   exige `sqlOperations.structureGuard:1` negociado e leitura das dependências;
   confere metadados/identidade na mesma conexão antes de iniciar a transação,
   contando os comandos auxiliares no teto de 32. A
   [rodada nativa da guarda](validation/2026-10-14-agent-operation-structure.md)
   cobre os três motores, com autoridade sintética. Transporte estrutural no
   hub e carrier MCP estão implementados em desenvolvimento, com contrato
   aditivo 1.14.0, capabilities vigentes, leitura exata das dependências e
   orçamento nativo conferido antes do envio. **Avanço implementado:** adoção,
   publicação/preparação/revalidação compartilhadas no MCP, com grão e
   classificação explícitos, identidade PK/UNIQUE comprovada, versões/hashes e
   dependências utilizadas no pacote/fingerprint. Recusa estrutural conserva o
   receipt e suspende somente a publicação utilizada. Runners sem guarda real
   não aprovam esse pacote. **Continua pendente:** ampliação da prova SQL Anywhere além do alcance homologado,
   matriz integral de perfis e homologação ampliada dos runners
   genéricos já implementados. [Contrato](shared-knowledge.md#adoção-por-operações-sql).
   Relacionamentos DML compostos, reversos e caminhos N:N agora entram no pacote
   e na guarda estrutural; unicidade 1:1 exige prova. A verificação datada está na
   [rodada de relacionamentos DML](validation/2026-10-15-operation-relationships.md),
   com limites distintos para a cadeia de operador e o fluxo consumidor.
   A [rodada de adoção DML](validation/2026-10-14-shared-sql-operation-adoption.md)
   passou nos 32 cenários persistentes dos três motores: PG/MSSQL usam pacote
   compartilhado e SQL Anywhere recusa enforcement desconhecido. Não encerra
   perfis nativos, runners genéricos, matriz integral ou gate.
   Nomes DML qualificados, helpers, conciliação e correspondência exata estão
   implementados em desenvolvimento, sem usar fallback/cache de nomes legados.
   Collation/Unicode e matriz adversarial
   nativa restante permanecem no gate de dialetos.
   [Evidência e limites dos recursos qualificados](validation/2026-10-14-qualified-sql-operations.md).
   Motivo seguro durável está implementado no journal aditivo v3 do agente,
   schemas/contrato hub 1.15.0 e carrier/persistência MCP, sem conteúdo nativo.
   Registros antigos não recebem causa inferida; código não prova o resultado.
   [Contrato, evidências e limites](validation/2026-10-14-durable-operation-reasons.md).
   Adoção compartilhada depende dessas guardas e da prova vigente; SQL Anywhere
   permanece recusado enquanto enforcement for desconhecido.
   [Transporte e pinagem 1.14.0](validation/2026-10-14-operation-structure-transport.md)
   também corrigem ref CI e snapshot com fontes/gerador, reproduzidos por bytes.
   Rodada final passou nos três motores com autoridade persistente de fixture;
   transporte por operador não certifica publicação/preparação DML compartilhadas.
   Isso não é distribuição completa do hub nem aceite de DML compartilhado.
   Homologar integralmente mínimos privilégios, views, metadados parciais,
   drift/revogação em trânsito e duas personas com versões independentes.
   Significado e publicação continuam exigindo curador.
2. Completar a homologação adversarial de grafo/busca nas combinações, recortes,
   versões e perfis ainda pendentes. A entrega inicial não transforma match ou
   desenho em autorização nem conclui o gate de treinamento.
   [Mapa inicial de impacto](validation/2026-10-19-knowledge-impact.md) por versão do padrão está implementado: publicações
   diretas/transitivas das personas do responsável, com paginação e nomes publicados.
   [Impacto por publicação de perfil físico](validation/2026-10-19-physical-impact.md) também está ligado ao console, com
   prova de identidade/acesso vigente e sem confundir adoção do padrão com a do perfil.
   [Filtro por tabela/schema/coluna](validation/2026-10-19-impact-resources.md) usa a estrutura efetivamente fixada e inclui
   dependências transitivas, sem pesquisar conteúdo inteiro ou inferir prova antiga.
   Homologação ampliada de impacto e combinações adversariais permanece pendente.
3. Biblioteca editorial versionada/cifrada, datasets com proveniência e DDL
   estrutural estão entregues em desenvolvimento (0021). Template cria rascunho
   de consulta com fonte/variante explícitas e candidatos, sem aprovação herdada.
   DDL nunca executa ou prova estrutura; grão ausente exige revisão. Importação
   de versões exatas por Bearer/OAuth está implementada com treinar, fonte concedida,
   teto do hub e papel editorial vigente; não abre navegação pela biblioteca.
   Exemplos adicionais exigem seleção e parâmetros compatíveis; datasets são
   revalidados e DDL conserva precisão/escala lógica. O console oferece criação
   estruturada de datasets por versão exata do template, com seleção de campos
   livres, valores tipados e proveniência. Comprimento lógico de texto é validado
   sem truncamento; arquivos DDL inválidos em UTF-8 são recusados.
   [Leitura delegada de template exato](validation/2026-10-19-delegated-template-read.md)
   está entregue por MCP/HTTP, com fonte/versão/dialeto e papel editorial vigentes,
   sem listar biblioteca ou devolver datasets. Completar gestão editorial delegada
   restante e integração com runners. [Contrato](knowledge-library.md).
   [Rodada parcial](validation/2026-10-14-knowledge-library.md) registra validação
   local e bloqueio daquela cadeia integral/contrato do hub; não encerra o gate.
   A [revalidação](validation/2026-10-14-knowledge-library-validation.md) confere
   tipos/decimais e limites do DDL, revisa o commit-base sem alterar contrato ou
   patch e registrou falha após reinício do agente. A
   [rodada de composição/hub 1.13.0](validation/2026-10-14-structure-composition.md)
   passou nos trinta casos da cadeia persistente, incluindo reinício, sem
   encerrar aceite integral. Integração editorial com os runners existentes e
   gestão delegada restante continuam pendentes.
   A [rodada de importação delegada](validation/2026-10-14-library-delegated-import.md)
   valida versões exatas, exemplos adicionais e precisão lógica do DDL em MCP,
   PostgreSQL e console; não certifica a cadeia dos três motores.
   A [revisão de constraints inline](validation/2026-10-14-library-inline-constraints.md)
   amplia a gramática declarativa e recusa nomes repetidos, com regressões v2,
   integração editorial e Chromium em fixture própria; não encerra runners ou
   homologação executável dos três motores.
4. Leitura de casos/relatórios e edição CAS de operação SQL/cruzamento já estão
   conectadas por MCP/HTTP delegado, sem executar runner ou aprovar evidência
   ([rodada e limites](validation/2026-10-19-delegated-cases.md)).
   A [leitura de casos/relatórios de consultas](validation/2026-10-19-delegated-query-reports.md)
   também está entregue, com paginação e evidência obsoleta identificada. Isso
   não executa runner. A [edição CAS de casos declarativos de consulta](validation/2026-10-19-delegated-query-case-edit.md)
   foi acrescentada separadamente, com cadastro/correção/remoção e revisão vigente,
   sem execução, conversão de casos antigos ou aprovação herdada.
   [OAuth e cruzamento também foram validados localmente](validation/2026-10-19-delegated-oauth-federation.md),
   com consentimento reduzido e revogação da conexão. Ainda faltam
   confirmação técnica/semântica, gestão/leitura editorial delegadas gerais e
   integração com runners. Importação exata de
   template já existe, com seus limites. Rascunho, casos, preview,
   publicar/suspender, inspeção, leitura de padrões e propostas iniciais já existem.
   Publicação e gestão de catálogo continuam exclusivas do console autenticado.
   Releitura explícita do conteúdo original de propostas compartilhadas está
   disponível ao autor na mesma conexão Bearer/OAuth, com dependência e papel
   vigentes. Não abre fila geral, revisões do curador ou rascunhos compartilhados;
   manutenção editorial mais ampla permanece pendente.
   Listagem paginada de propostas próprias está disponível por skill e versão-base
   concedida, isolada por token/conexão, sem conteúdo ou fila geral do catálogo.
   A [homologação persistente dirigida](validation/2026-10-19-own-proposals-persistent.md)
   verificou duas páginas, outro token, cursores e revogação remota nos três motores.
   OAuth ponta a ponta e matriz integral permanecem pendentes.
   Não encerra manutenção editorial, histórico entre versões ou curadoria humana.
   Propostas físicas próprias também têm lista paginada por perfil concedido e
   conexão, com acesso remoto revalidado e sem fila geral ou conteúdo.
   [Isolamento OAuth validado na cadeia persistente](validation/2026-10-19-physical-proposals-oauth.md):
   duas conexões do mesmo originador, paginação, cursores cruzados, consentimento
   restrito e revogação individual preservando os demais acessos. Metadados do
   cliente são fixture; HTTPS público e ChatGPT continuam manuais. Histórico
   entre versões de consultas/operações já está entregue nas rodadas abaixo;
   não confundir essa leitura com revisão humana ou navegação integral no catálogo.
   A releitura editorial também alcança propostas físicas próprias, com mesma
   conexão e acesso remoto à base revalidado. Não delega revisão/incorporação
   nem abre navegação pelo perfil; demais jornadas editoriais seguem pendentes.
   A [rodada persistente dirigida](validation/2026-10-19-shared-proposal-persistent.md)
   comprovou releitura por Bearer, outro token recusado e revogação diretamente
   no hub nas adoções dos três motores. Não encerra OAuth completo ou a matriz.
   Correção de exemplos SQL no rascunho privado agora aceita substituição explícita
   por ID/revisão na tool existente. O conteúdo volta a candidato e preserva a
   publicação ativa; não encerra curadoria ou manutenção do catálogo compartilhado.
   Inativação explícita de exemplo privado também está disponível por ID/revisão
   na tool `inativar_exemplo_sql`, sem apagar conteúdo ou alterar o snapshot ativo.
   [Regressão PostgreSQL](validation/2026-10-19-delegated-example-inactivation.md)
   cobre CAS concorrente, preview obsoleto e negações; autoridade remota é fixture.
   A [rodada com hub persistente](validation/2026-10-19-example-inactivation-persistent.md)
   verificou inativação por Bearer nas adoções dos três motores, concorrência,
   publicação preservada e recusa após revogação remota com estado local ativo.
   A [rodada OAuth desta ação](validation/2026-10-19-example-inactivation-oauth.md)
   acrescenta consentimento completo/reduzido e revogação da conexão, com
   persistência intacta nas recusas. Metadados do cliente são fixture;
   HTTPS/ChatGPT e demais jornadas editoriais continuam pendentes.
   Não delega revisão/incorporação de catálogos: essas ações permanecem humanas.
   Histórico MCP entre versões está disponível inicialmente para vínculos do
   mesmo padrão adotados por consultas ativas concedidas, com paginação e sem
   conteúdo ou navegação geral. Não recupera versões substituídas/revogadas.
   [Evidência PostgreSQL](validation/2026-10-19-authorized-knowledge-history.md)
   cobre páginas, concessões diferentes e suspensão. A
   [cadeia persistente](validation/2026-10-19-knowledge-history-persistent.md)
   valida duas versões adotadas, consulta real, cursores e revogação nos três
   motores. A [rodada OAuth](validation/2026-10-20-knowledge-history-oauth.md) também valida consentimento limitado e revogação individual/do originador pela cadeia persistente. HTTPS público e ChatGPT permanecem manuais.
   Comparação delegada por seção dos recortes de consultas concedidas está implementada (`comparar_conhecimento`), com [evidência PostgreSQL](validation/2026-10-20-knowledge-comparison.md); a [rodada OAuth na cadeia persistente](validation/2026-10-20-knowledge-comparison-persistent-oauth.md) passou nos três motores, com consentimento, suspensão e revogação. Aceite integral e HTTPS/ChatGPT continuam pendentes. Histórico/comparação de operações SQL estão implementados e [validados por Bearer nos três motores](validation/2026-10-20-operation-knowledge-history.md). [OAuth específico de operações](validation/2026-10-20-operation-knowledge-oauth.md) também passou nos três motores, sem dispatch adicional pelas leituras. A [matriz mista Bearer](validation/2026-10-20-mixed-knowledge-pagination.md) valida comparação consulta/operação e histórico com 22 vínculos (20+2) nos três motores. A [matriz mista OAuth](validation/2026-10-20-mixed-knowledge-oauth.md) também passou nos três motores, com duas páginas, consentimento e revogação. Concorrência ampliada continua pendente. Permanecem outros tipos de skill,
   confirmação técnica/semântica e matriz concorrente dos serviços restantes.

Prazo obrigatório na publicação e tarefas/notificações internas do worker estão
entregues em desenvolvimento (0020), com prévia exata, calendário transacional,
leases e unicidade. [Contrato](review-worker.md) e
[rodada parcial](validation/2026-10-14-publication-review-worker.md). Sem prazo
padrão ou suspensão automática por idade; distribuição/aceite operacional geral
continuam pendentes.

Revisar `initialize`, resources e catálogo dinâmico do runtime v2 para as
capacidades entregues. O conceito ClientAgentAccess permanece no hub.

Conclusão: significado, campos, grão, regras e exemplos chegam à IA sem
credencial nem conhecimento recusado. Edição preserva o snapshot ativo.
Template, candidato e inativo não executam.

## Etapa 5 — Privacidade, limites e dialetos

1. Implementadas finalidades por campo em consultas: projeção, filtro, JOIN,
   agrupamento/agregação e ordenação, com justificativa para pessoal/sensível,
   capacidades explícitas, hash e interseção token/OAuth. Contexto/busca/grafo
   exigem publicação integral concedida; não há recorte parcial da mesma skill.
   Cruzamentos conferem os usos adicionais na linhagem das saídas locais.
   Adoção compartilhada preserva classificação. Exportação JSON exige contrato/
   concessão novos. Restam matriz ampliada de cruzamentos/adoção pessoal real,
   visão parcial se necessária e matriz binária operacional ampliada. A
   [rodada binária persistente](validation/2026-10-16-binary-chain.md) valida
   bytes, tipos, completude, isolamento e reinício nos três motores em fixture.
   DML/datasets continuam livres;
   segredo/inferido bloqueados.
   [Contrato](source-queries.md#campos-e-finalidades).
   [Rodada parcial](validation/2026-10-15-field-uses.md): 38/38 na cadeia
   persistente dos três motores, sem aceite integral desta etapa.
2. Implementados limites redutíveis por skill, token, concessão e requisição
   para linhas, bytes da resposta materializada, prazo e paginação; DML reduz
   linhas diretamente afetadas/prazo e fixa o orçamento no fingerprint. OAuth
   conserva concessões e permite reduzir tetos globais de consulta/DML.
   Cruzamentos passam a incluir o teto por concessão da skill. Delegação compara
   limites efetivos e não amplia autoridade. Console configura esses limites.
   [Contrato e limites](source-queries.md#limites-redutíveis).
   [Rodada parcial](validation/2026-10-15-execution-limits.md): 41/41 pela
   cadeia persistente dos três motores, sem encerrar gates.
   A homologação ampliada de drivers e o aceite integral continuam pendentes.
3. Representação comum da análise SQL, com recusa de motores não suportados e de
   de dialeto desconhecido, script, DDL e linked server.
4. Operações já preservam `schema.tabela` em treinamento, capabilities, policy,
   recortes, outputs, compilação adaptável e conciliação. A
   [revisão de alcance](validation/2026-10-20-qualified-operation-audit.md)
   confirma essa implementação; não recolocar schemas explícitos como ausentes.
   Permanecem a matriz ampliada de homônimos/recortes na cadeia real e as
   construções fora da gramática documentada. Autorização não se reduz ao nome final.
5. Tipos, decimal, Unicode, nulos, datas, views, paginação e quantidade de
   parâmetros nos três motores.
   Views regulares têm [recorte nativo aprovado](validation/2026-10-23-native-view-chain.md):
   schema/identidade, tipo publicado, páginas e recusas técnicas sem dispatch.
   Isso não encerra outras espécies de view, tipos ou a matriz adversarial.

Conclusão: a mesma gramática documentada nos três motores, com AST, schemas
homônimos, recortes em todos os ramos, JOIN composto e fanout cobertos.

## Etapa 6 — Runners de publicação

O [ensaio integrado de casos e publicação](validation/2026-10-23-manual-publication-console.md)
validou cadastro de casos pelo console, CLI real nos três motores, leitura de
relatório, publicação e obsolescência após edição. O baseline de consultas/tokens
foi repetido em outra fixture. Isso reduz a lacuna de integração editorial,
sem encerrar sua matriz integral ou os demais tipos de skill.

Implementados runners genéricos de operador para consulta, operação SQL e
cruzamento, com manifesto explícito, fontes pretendidas/fixtures distintas,
casos declarativos, reprovação preventiva e revalidação fora da rede. O comando
`persona:test-publication` usa hub/agente; cruzamentos leem sementes reais por
fonte e fixam dependências/proveniência. Migration aditiva 0023 conserva evidência
sem payload. Aprovação técnica não aprova significado comercial. Contrato em
[homologação](homologation-chain.md#publicação-sql-genérica-em-fixtures-privadas).

Rodada atual: [43/43 na cadeia persistente dos três motores](validation/2026-10-15-publication-runners.md),
incluindo SQL adaptável, marcador conciliável e cruzamentos publicados. Não encerra gate.

Matriz representativa ampliada: [55/55 na cadeia persistente](validation/2026-10-15-publication-matrix.md),
com seis tipos lógicos, PK/UNIQUE/NOT NULL, FK composta e trigger de inserção.
Comparação exata normaliza decimal textual SQL Anywhere sem zero inteiro.

[CHECK, cascatas e triggers UPDATE/DELETE](validation/2026-10-15-publication-effects.md)
acrescentam 48 casos obrigatórios: intervalo inteiro com NULL, efeitos compostos
isolados por tenant, imagens NEW/OLD e rollback dos efeitos indiretos. A rodada
persistente passou em 73/73 nos três motores. Conferência de contagens exatas,
leituras completas não vazias e ritmo explícito preservam todos os portões.

Continuam pendentes extensões da matriz (expressões CHECK gerais, outras ações/caminhos
de cascata, triggers encadeados/INSTEAD OF, multirow geral e collations), adoção
compartilhada genérica nos três motores e a ampliação da jornada integrada de
casos/relatórios aos demais tipos de skill. Consultas já têm o ensaio integrado
acima; não recolocar essa parte como ausente. O runner sintético antigo não
certifica SQL real. Ações externas
entram na etapa 9, em serviço próprio isolado.

A divergência posterior do HEAD do hub foi revisada na
[conferência da referência e do console real](validation/2026-10-15-hub-pin-real-console.md).
A referência fixa agora o commit publicado que incorpora o patch histórico;
ancestralidade, aplicação reversa sem escrita e bytes commitados são verificados.
`training:check` passou sem relaxar a exigência de HEAD exato ou regenerar o
baseline. A comparação estática não substitui homologação comportamental integral.

Conclusão: consulta avisa quando não há casos e exige os obrigatórios existentes.
Operação, cruzamento e ação externa só publicam com os casos atuais aprovados.
Mudança de conteúdo, fonte, credencial ou casos invalida os relatórios aplicáveis.

## Etapa 7 — Cruzamentos

A [revogação remota após leitura](validation/2026-10-20-federation-live-revocation.md)
foi validada nas combinações PostgreSQL/SQL Server e PostgreSQL/SQL Anywhere:
remover no hub o acesso da primeira fonte após o segundo SELECT recusa a entrega
por AUTHORIZATION_DENIED. Corrigido fallback que usava aprovação histórica
após recusa atual. Outras janelas e imagem final continuam pendentes.

Inteiros numéricos sem precisão segura agora são recusados antes da combinação.
[Testes e alcance](validation/2026-10-20-federation-precision-revocation.md)
incluem IDs textuais exatos e revogação da fonte já lida em gateway controlado.
A cadeia persistente passou na regressão das combinações; BIGINT nativo e
outras janelas de revogação remota ainda exigem homologação própria.

Corrigida a janela de envio após autorização consumir o prazo:
[regressão e cadeia persistente](validation/2026-10-20-federation-deadline.md).
O próximo dispatch é recusado mesmo com timer ainda pendente; não promete
cancelar SQL anterior. Demais cenários operacionais continuam abertos.

Combinação tipada e execução paginada já estão em [cruzamentos](federation.md)
e no [console](console.md). O editor de etapas, regras semânticas, casos e publicação está entregue em desenvolvimento. Restam material de negócio revisado e prova de correspondência,
normalização local, ausência, duplicidade, cardinalidade, grão, unidades,
moedas e calendário, sem conversão silenciosa. Homologar chaves simples e
compostas, inner/left, união compatível, agregação e ordenação na cadeia
persistente. Completar aborto, falha e revalidação de fonte já lida. Paginação
continua depois da combinação.

Tetos a preservar: quatro fontes, oito etapas, até duas consultas simultâneas,
5.000 linhas acumuladas por fonte, 10.000 intermediárias, 16 MiB e 60 segundos.
A execução serial atual já respeita o teto.

## Etapa 8 — Lançamentos e recuperação

Preparação, aprovação, journal e conciliação por marcador já estão em
[operações SQL](sql-operations.md). Falta homologar identificadores gerados,
outputs e contagens em cada driver; expiração, claim concorrente, cancelamento
e retomada após reinício; journal durável antes do dispatch com quedas reais
antes do envio, durante o SQL, no commit e depois do commit sem comprovante.
Retenção de payloads/comprovantes já está implementada e validada localmente
na etapa 12; manutenção/compactação restantes não incluem reenviar incertos. Conciliação sem marcador UUID
exclusivo exige contrato próprio antes de ser implementada.

Contagem direta não representa trigger nem cascata. Incerteza não volta a
estado executável e não fabrica receipt nem rollback.

## Etapa 9 — Integrações

Importação OpenAPI e descoberta MCP agora aceitam consumidor por serviço,
HTTP e MCP, com escopo da integração e revalidação antes da entrega.
Suíte PostgreSQL de setups passou em
[79 testes](validation/2026-10-20-external-import-delegation.md), incluindo
retirada de escopo durante discovery sem entrega.
A [importação OpenAPI por OAuth com hub persistente](validation/2026-10-20-external-import-persistent-oauth.md)
passou com escopo/consentimento, revogação individual e revogação remota da
delegação. A [descoberta MCP por OAuth com servidor TLS de fixture](validation/2026-10-20-external-discovery-persistent-oauth.md)
também passou com hub persistente, duas conexões e revogação, sem leitura/escrita
de negócio. Matriz ampliada e provedores operacionais permanecem pendentes.
A imagem foi reconstruída e validada no percurso principal conforme a rodada
citada no início deste plano; o filtro de treinamento não reexecuta discovery
OAuth pela imagem. TLS de fixture não comprova HTTPS público ou ChatGPT.

[Runner CLI e console](validation/2026-10-15-external-runner.md): implementados e
validados localmente com manifesto/claim/limpeza, casos tipados e relatórios.
Aceite público/operacional continua pendente. A
[referência coordenada do hub](validation/2026-10-16-hub-contract-pin.md) foi
revisada e atualizada após CI upstream aprovado; `training:check` voltou a passar
sem relaxar HEAD exato, hashes ou incorporação do snapshot. HTTPS público e
ChatGPT permanecem para validação manual, sem encerrar gates.

[Conciliação local REST/MCP](validation/2026-10-15-external-reconciliation.md):
leitura treinada e evidência separada validadas em fixtures TLS com PostgreSQL.
Perda de confirmação não permite reenvio. Não encerra aceite público ou operacional.

[Rodada local de ações e referência do hub](validation/2026-10-15-external-actions.md):
preparação, aprovação, claim e recuperação implementados; pin revisado passou
em `training:check`. Não encerra homologação de provedores ou aceite integral.

**Implementado em desenvolvimento:** adapters de consulta REST GET e MCP remoto,
publicação externa com casos obrigatórios/preview/calendário e concessões explícitas.
Revalidação antes do dispatch e entrega; TLS com IP público fixado, sem redirects
ou retry. [Contrato e limites](external-integrations.md). Runner de operador tem
CLI de operador com manifesto/claim/limpeza e painel de casos/relatórios; jornada
de contratos no console está entregue em desenvolvimento. Descoberta MCP e
importação OpenAPI JSON para propostas/rascunhos também estão implementadas na
gramática do [contrato](external-integrations.md#descoberta-mcp-e-importação-openapi).
Homologação de serviços externos reais continua pendente; parser/fixture TLS
não certificam provedores, HTTPS público ou ChatGPT.

Ações com efeitos têm preparação cifrada, aprovação Client no navegador, claim CAS
durável e recuperação conservadora sem reenvio. Conciliação explícita por leitura
publicada mantém evidência append-only separada. Gestão no console inclui
cadastro direto inativo com reautenticação do responsável, UUID estável e
conferência após confirmação perdida, listagem/impacto, suspensão,
recuperação sem restaurar contratos e rotação com
reautenticação do mesmo responsável; manutenção e homologação pública ampliadas
continuam pendentes. Cadastro e credencial técnica versionada também estão
disponíveis pelo setup de navegador, sem chamadas externas. REST declara método, rota, entrada, saída
e efeito; a importação OpenAPI cria somente proposta e rascunho explícito. MCP remoto usa Streamable HTTP e seleção
explícita, sem stdio nem processo local.

Bearer, API key em header e Basic somente sobre HTTPS, com credencial da
integração. Nunca encaminhar Bearer MCP, JWT do hub ou credencial de fonte.
Egress valida DNS/IP na conexão e recusa destino privado, reservado, misto e
redirect inseguro. Efeito usa preparação, aprovação, fingerprint e resultado
desconhecido. Retry depende de idempotência publicada ou conciliação daquela
operação. A resposta não altera treinamento, tools nem dispara outra ação.

## Etapa 10 — OAuth v2 e setup

[Treinamento no pacote privado](validation/2026-10-19-plugin-delegated-training.md)
agora orienta rascunhos, casos, template exato e publicação delegada conforme
descoberta/autoridade. Montagem offline validada nas duas variantes; instalação
privada e conversa nova no ChatGPT permanecem manuais.

[Descoberta corrigida](validation/2026-10-19-runtime-capabilities.md): anúncio de
OAuth/integrações acompanha serviços ligados ao endpoint, sem falso negativo fixo
nem concessão implícita. Transporte local validado; cliente real continua manual.

Implementado em desenvolvimento: `/mcp` Bearer separado de `/mcp/chatgpt` OAuth
v2, scope `se7e:persona`, `get_profile` opaco por persona e revogação exclusiva
da conexão atual com comprovante terminal. Contratos do [plugin](plugin.md) e
[OAuth](oauth.md), com PostgreSQL, consentimento Chromium/TLS de fixture,
PKCE/replay/refresh concorrente e invalidação de derivados verificados localmente.
Transação 15 minutos, código 60 segundos, access 15 minutos e concessão até
30 dias limitada pelo originador. Alteração do token invalida conservadoramente
derivados anteriores; ampliação nunca é herdada.

Concessão ligada a um token e a consentimento explícito. Ampliar o token
originador não amplia derivados; redução, expiração, rotação e revogação
bloqueiam os derivados de forma permanente. Discovery, código de uso único,
PKCE S256, troca, refresh com rotação, replay e revogação em armazenamento v2.
Não reutilizar identidade, grants, caches, sessões nem migrations do OAuth legado.

Endpoints, audience, redirects exatos e validação CIMD por HTTPS/allowlist/DNS/IP
fixado estão implementados. Setups de fonte com uso único, POST/CSRF e
reautenticação humana permitem cadastro e rotação. GET não consome; credencial,
consumo e auditoria são atômicos. O [setup de rotação do próprio token](oauth.md#setup-de-rotação-do-próprio-token)
foi implementado com confirmação humana e invalidação dos derivados. O
[setup de integração](oauth.md#setup-de-credenciais-de-integrações) cadastra/rotaciona
credenciais próprias com consumo atômico, mantendo integração e operações inativas.
Adapters e publicação/execução externos estão no contrato da etapa 9; manutenção operacional e homologação dos provedores continuam pendentes. A emissão limitada está no
[setup de emissão](oauth.md#setup-de-emissão-com-concessões-limitadas), sem aceite externo automático.
Aplicar a identidade OAuth em tools, resources, execução, anexos e cache.

Pacote candidato ChatGPT v2 habilitado com ID real obrigatório; catálogo e skills
separam os contratos de cada variante. `gerenciar_fontes` e `gerenciar_integracoes` iniciam setups com
delegação e consentimento explícito. Restam permissões nas jornadas não entregues,
rotinas operacionais v2. Listagem paginada e revogação específica de conexões
estão entregues em desenvolvimento no console, com hash de confirmação,
auditoria atômica e preservação do originador/outras conexões.
Homologação pendente:
instalação privada, conversa nova, PKCE/audience/redirect, replay, refresh
concorrente, redução/revogação e troca de persona. Dependências externas:
TLS/DNS, cadastro e acesso autorizado ao cliente real. OAuth legado não é prova
de OAuth v2; nenhum token entra no pacote.

**Preparação entregue:** `persona:https-check` verifica discovery v2 e,
opcionalmente, CIMD/pacote privado, sem `.env`, banco ou tokens. O
[roteiro manual](oauth.md#homologação-https-e-conexão-manual) separa essas provas
da instalação real. **Dependência externa:** DNS/servidor e conexão no ChatGPT
ficaram para validação manual por decisão do operador em 2026-10-15. Nenhum
endpoint público, conexão ou gate foi certificado por essa preparação.

## Etapa 11 — Cache e anexos

**Implementado em desenvolvimento:** cache cifrado e singleflight local/Redis
opt-in para consultas locais privadas, com chaves opacas, revalidação individual,
fence físico e desativação por operações pendentes/desconhecidas. Preserva horário
e completude; não repete SQL por falha/lease. [Contrato e limites](query-cache.md).
A [rodada Redis com múltiplas instâncias](validation/2026-10-16-redis-multi-instance.md)
executou dois processos MCP nos três motores, isolamento, revogação em trânsito e
interrupção após SQL. Corrigiu corrida miss/claim e idade entre TTLs distintos;
porta estável de fixture foi confirmada após reinício. Não encerra gates.
**Implementado em desenvolvimento:** [anexo JSON local](attachments.md) com
consulta fresca, contrato/finalidades/capability explícitos, handle cifrado/opaco
por consumidor/concessão e revalidação no HTTP/MCP/resource e console. Migration
0038 registra somente metadados de auditoria. Armazenamento compartilhado cifrado
em `persona_attachment_v2` (0039) permite outra instância/reinício com a mesma
origem/keyring, sem renovar prazo ou dispensar autorização. Quotas globais são
transacionais; worker limpa expirados e rotação preserva vínculo e validade.
Sem fallback em memória ou reconsulta automática.
A [rodada de recuperação](validation/2026-10-16-shared-attachments.md) passou
em 77/77 cenários na cadeia persistente dos três motores e 121/121 na matriz
PostgreSQL dirigida, com recuperação OAuth, quotas, worker e rotação; não
certifica infraestrutura operacional nem encerra gates.
**Implementado em desenvolvimento:** coluna binária com contrato/capability
próprios, metadados ODBC/nativos e um registro completo. Bytes originais por
HTTP/MCP/resource e console, sem base64 na consulta comum, conversão ou concessão
automática. PDF/PNG/JPEG/WebP ou octet-stream explícitos. A
[rodada binária persistente](validation/2026-10-16-binary-chain.md) passou em
77/77 cenários da cadeia completa, incluindo três novos cenários binários,
com BYTEA, VARBINARY(MAX) e LONG BINARY. Namespace explícito distingue
discriminantes odbc_fast de códigos ODBC nativos. Completude exige truncated:false
explícito e teto de duas linhas, sem paginação gerenciada. Não encerra gates.
**Implementação pendente:** eventual reuso de consultas com guardas estruturais,
mantendo prova na conexão; cruzamentos continuam sem cache.
**Homologação pendente:** Redis/proxy/frota da infraestrutura, ampliação de falhas,
partições/carga/OOM, limites/tipos binários e candidato operacional final.
A evidência de fixture dos três motores não encerra o gate.

Namespace próprio. A chave inclui persona, concessão, versões, fonte, identidade
física, credencial, policy, recortes, publicações, SQL, parâmetros e opções.
Cache e singleflight só para leitura elegível, com TTL e Redis quando habilitado.
Revalidar antes do dispatch e da entrega, inclusive em cache hit. Erro e anexo
não entram no cache. Escrita confirmada ou incerta invalida os vínculos da mesma
base física, sem revelar treinamento nem resultado entre personas.

Anexo com classificação, limites e handle opaco ligado à concessão, fonte,
policy e publicações. Expiração ou revogação impede o download. Redis
indisponível desliga a otimização e não cria bypass nem retry de SQL.

## Etapa 12 — Worker, retenção e chaves

A [regressão completa PostgreSQL após retenção](validation/2026-10-20-postgres-retention-full.md)
passou nos 324 testes, sem filtro ou erros não tratados, incluindo as novas
migrations. Não substitui homologação da cadeia dos três motores ou instalação.

Retenção dos metadados da outbox está implementada com migration aditiva 0041:
limpeza após 90 dias do encerramento registrado, tombstones permanentes e
pendências preservadas. [Evidência PostgreSQL](validation/2026-10-20-outbox-retention.md).
[Upgrade com histórico e imagem com 42 migrations](validation/2026-10-20-outbox-retention-upgrade.md)
foram validados em fixture local. UPDATE neutro conserva o prazo terminal.
[Rotação concorrente com limpeza](validation/2026-10-20-outbox-retention-rotation.md)
também foi validada em conexões PostgreSQL independentes, com CAS obsoleto
recusado e retomada. Carga, outras janelas de falha e infraestrutura instalada
continuam pendentes.

Probe local de saúde e parada do listener estão implementados. A
[rodada empacotada](validation/2026-10-19-worker-health.md) validou saúde antes/depois
do reinício e duas paradas limpas, com quatro jobs e quarenta migrations.
Supervisor instalado, falhas operacionais e restauração na infraestrutura final
continuam pendentes; o [ensaio local de backup](validation/2026-10-19-backup-restore.md)
já foi executado. Esse
estado saudável não encerra gates nem autoriza retry de efeitos.

Worker com leases para expiração, manutenção de OAuth/setup/preview, revisão
temporal, curadoria e outbox. O worker não publica skill, não aprova operação
e não repete escrita incerta.

Worker de revisão tem entrada própria em desenvolvimento, lease persistente,
retomada e notificações internas autorizadas. A manutenção de dados temporários
também está implementada em desenvolvimento, com lease próprio, lotes limitados,
limpeza de setups/prévias expiradas e preservação dos registros de replay OAuth
até o prazo da concessão. [Contrato e limites](review-worker.md#limpeza-de-dados-temporários).
Retenção de payloads/comprovantes SQL e externos também está implementada em
desenvolvimento: relógio local imutável, 24 horas/90 dias, lease, lotes e
tombstones permanentes; desconhecidos ficam fora da limpeza.
[Contrato e limites](review-worker.md#retenção-de-operações).
Rotação do cofre também está implementada em desenvolvimento, com simulação,
operador de banco separado, lock exclusivo, keyring vinculado e cursor durável.
[Contrato e limites](vault-rotation.md). Homologar procedimento de instâncias,
grants de infraestrutura e restauração de backups com chaves anteriores.
Outbox externa também está implementada em desenvolvimento: configuração humana
e CAS no console, produtores transacionais de metadados privados, HMAC,
DNS/IP fixado, claims com fencing, orçamento, dead-letter e retomada.
[Contrato e limites](outbox.md). A
[rodada de workers concorrentes](validation/2026-10-16-worker-outbox-multi-instance.md)
exercita dois processos com quatro jobs, falha de revisão sem impedir os outros,
queda em POST/transação, rollback e retomada após lease real, com deduplicação
no receptor TLS de fixture. Leases e vencimento de revisão agora usam relógio
PostgreSQL; parada impede novos jobs/claims desde o primeiro ciclo.
**Homologação pendente:** receptor/frota instalados e sinais do gerenciador,
demais jobs e distribuição; esses jobs não encerram a etapa.

O pin do hub foi revisado para o candidato aprovado `0dc94d6`, preservando
contrato/snapshot. `training:check` exige checkout/SHA exatos e prova do patch
no ancestral de incorporação, em índice temporário. Mudanças posteriores exigem
nova revisão; essa atualização não certifica toda a cadeia ou libera deploy.

Retenção: comprovante terminal por 90 dias; payload operacional removido 24
horas após a conclusão. Desconhecido conserva o estado até conciliação. Remover
comprovante não reutiliza identidade nem fingerprint. Rotação de chave cobre
credencial de fonte/integração, payload, setup, OAuth e outbox, com versão,
dry-run, lock e retomada. A rotação legada não cobre essas entidades.

Outbox com lease, assinatura, orçamento, destino seguro e dead-letter. Repetir
notificação não repete a ação. Métricas usam IDs e contagens, sem SQL, pergunta,
parâmetro, resultado, cookie ou segredo.

## Etapa 13 — Jornadas restantes do console

Abertura explícita do rascunho importado pela biblioteca foi ligada à persona
de destino, com releitura antes da troca, edição protegida e foco após liberação
do editor. Essa correção do percurso manual não conclui as demais jornadas ou
o aceite de acessibilidade. [Contrato](knowledge-library.md#templates) e
[rodada dirigida](validation/2026-10-22-template-draft-handoff.md).

A inspeção estrutural teve corrigida uma submissão duplicada reproduzida em
Chromium: o bloqueio agora precede a espera de atualização do formulário e o
contexto é reconferido antes do envio. A correção não encerra acessibilidade,
homologação instalada ou aceite integral. A rodada está no índice de validação.

A [consolidação dos editores](validation/2026-10-20-console-editor-consolidation.md)
reconstruiu a candidata e passou no empacotamento. Chromium completo registrou
52 aprovações e uma corrida de navegação no teste; a sincronização foi corrigida
e o cenário passou cinco vezes. Não equivale a uma nova rodada integral aprovada.
As 86 verificações unitárias web passaram fora do sandbox, após falhas de leitura
de arquivos temporários no executor isolado.

A [rodada consolidada atual](validation/2026-10-20-candidate-console-recovery.md)
passou nos 52 cenários Chromium, sem filtro, e revalidou a imagem com as
correções recentes. Isso não substitui leitor de tela, HTTPS/ChatGPT ou
aceite instalado integral.

Editor de consulta tem foco e descrições locais para recusas de nome, slug e
treinamento, com [regressão Chromium](validation/2026-10-20-training-errors.md).
Os editores de operação SQL e cruzamento também receberam referências locais
e foco para recusas de nome/identificador/treinamento, com
[três cenários Chromium aprovados](validation/2026-10-20-operation-federation-errors.md).
Cobertura dos demais formulários e leitor de tela continuam pendentes.
O editor externo também recebeu referência de contrato, foco e descrição,
com [validação REST/MCP e regressão dos editores](validation/2026-10-20-external-editor-errors.md).
Isso fecha a referência local de erros nos contratos dos quatro tipos de skill,
sem declarar todos os subformulários ou acessibilidade integral concluídos.

A [emissão sem confirmação](validation/2026-10-20-token-issuance-recovery.md)
agora exige conferência da lista e nova decisão humana, limpando concessões
selecionadas antes de outra emissão. Não introduz idempotência de servidor
ou recuperação de segredo; empacotamento final permanece pendente.

Gestão de tokens agora bloqueia mutações após confirmação perdida até releitura
explícita bem-sucedida, preservando edição em falha de leitura.
[Cenário Chromium dirigido](validation/2026-10-20-token-confirmation-recovery.md)
comprova ausência de reenvio. A [imagem reconstruída](validation/2026-10-20-candidate-console-recovery.md)
inclui essa correção, emissão incerta e erros de treinamento; passou no
empacotamento e no percurso dirigido pela cadeia. Aceite final permanece pendente.

A [regressão Chromium completa](validation/2026-10-20-console-full.md) passou
em 49 cenários após corrigir rótulos incidentais no seletor de consultas.
Não substitui leitor de tela, zoom real integral, cadeia instalada ou IA.
O [onboarding](onboarding.md#roteiro-manual-de-treinamento-no-candidato-isolado)
inclui roteiro manual e critérios por etapa, sem autorizar produção.

Falha de rede/corpo ilegível após alteração agora orienta conferir estado,
sem recomendar reenvio. A [regressão dirigida](validation/2026-10-20-console-unconfirmed-response.md)
cobre confirmação perdida e contexto descartado, sem certificar queda real
durante efeito ou substituir os controles específicos de cada jornada.

Emissão e edição de concessões de operações SQL estão implementadas, com efeitos
do snapshot publicado e aprovação adicional inicial. A
[rodada do console](validation/2026-10-20-sql-token-console.md) valida emissão nos
dois modos SQL; edição visual ampliada continua pendente.
Concessões externas agora têm seleção de skill/operação publicadas na emissão
e edição, sem efeitos SQL, com aprovação adicional para ações novas.
O [percurso Chromium](validation/2026-10-20-external-token-console.md) valida
emissão e preparação sem envio de efeito em fixture isolada.
O [cenário de edição](validation/2026-10-20-external-token-edit.md) também
confirma retirada da operação, recusa da chamada direta sem novo journal e
preservação de outro token. OAuth e infraestrutura final não são certificados.
Manutenção delegada e homologação operacional das integrações continuam abertas.

Delegação administrativa agora oferece [recuperação por leitura explícita](validation/2026-10-19-delegation-console-recovery.md),
preservação da edição e bloqueio após confirmação perdida, com foco acessível.
Isso não encerra as demais jornadas delegadas ou o aceite de acessibilidade.

[Diagnóstico visual de fontes](validation/2026-10-19-connection-diagnosis.md)
confere resposta exata de fonte/dialeto, apresenta confirmação parcial por skill
e limites efetivos legíveis. Não encerra diagnóstico individual dos portões remotos,
homologação instalada ou disponibilidade das demais capacidades.

[Painel de casos/relatórios de consulta](validation/2026-10-19-query-tests-console.md)
entregue com leitura por revisão, descarte de resultados e diagnóstico de conflito.
O editor visual dos casos de consulta está implementado: parâmetros, sementes e
resultados tipados, CAS, preservação de conflito e remoção confirmada. A leitura
bloqueia edição concorrente local. Evidência e limites da rodada ficam no
[registro do editor](validation/2026-10-19-query-case-editor.md); execução dos
casos continua exclusiva do runner isolado, sem aprovação pelo console.

Navegação, persona, fontes, treino de consulta, tokens de consulta/cruzamento/operação SQL,
consulta paginada, cruzamento publicado, impacto de fonte e revisão/aprovação
já estão no [console](console.md). Roteiro por registros reais, teste de conexão
sem SQL, diagnóstico local, comparação de publicação, diagrama/lista e histórico
administrativo também estão implementados em desenvolvimento. Inspeção,
compatibilidade, perfis físicos e adoção inicial em consultas estão disponíveis.
Ainda falta
diagnóstico detalhado de todos os portões/limites, referências acessíveis de erro
em todos os editores e as capacidades compartilhadas restantes da etapa 4. A comparação não substitui
os runners nem aprova significado. Além disso, falta:

1. Formulários administrativos restantes; ciclo explícito de fontes está entregue
   em desenvolvimento, com revisão, preservação de edição e cadastro independente.
   Criar/renovar/revogar delegação para setups de fontes já está no console.
   Suspensão/recuperação de persona já está disponível com revisão explícita.
2. Editor de operação SQL entregue para contrato, casos e revisão/publicação;
   relatórios são lidos, nunca executados/aprovados pelo console. Relacionamentos
   compostos/N:N e vínculos de padrão/perfil têm edição visual e adoção no rascunho,
   sem inferir tipos, chaves ou escrita. Homologação operacional segue pendente.
   Editor estruturado de cruzamento, casos nos dois formatos e revisão/publicação
   também estão entregues em desenvolvimento. O editor de ações externas agora
   inclui contratos REST/MCP, conciliação, casos/relatórios e revisão/publicação. Casos/relatórios externos já têm painel próprio.
   Prazo/calendário/notificações internas de revisão estão disponíveis
   em desenvolvimento, sujeitos ao aceite integral.
3. Manutenção restante de contratos/integrações e concessões correspondentes;
   cadastro direto pelo responsável, gestão de suspensão/rotação e descoberta/
   importação já estão entregues em desenvolvimento.
   Anexos JSON/binários, setups, consentimento OAuth e revogação individual
   de conexões já estão entregues com seus limites e evidências parciais.
4. Ações do consumidor sobre preparações SQL/externas já estão disponíveis:
   verificar estado pelo Bearer, executar com confirmação separada, cancelar
   e consultar conciliação treinada. Contexto/persona e estado são revalidados;
   resposta perdida não oferece reenvio. Aprovação continua na sessão Client.
   Preparação estruturada de ações externas agora usa o contrato concedido e fixa
   a publicação esperada; não envia a ação nem aprova. Preparação SQL estruturada está implementada com parâmetros tipados e SQL
   adaptável por etapa; formulário validado no Chromium com PostgreSQL/hub sintético
   ([evidência](validation/2026-10-19-sql-preparation-console.md)). Faltam casos visuais ampliados e aceite operacional
   integrado. A evidência de UI não certifica SQL ou provedores reais.
5. Percurso completo no Chromium com backend de fixture, inclusive teclado,
   foco, leitor de tela e viewport móvel.

## Etapa 14 — Reset e distribuição candidata

O [ensaio local de restauração](validation/2026-10-19-backup-restore.md) está
automatizado na candidata: banco novo, original preservado, comparação de registros,
cifras, revogação e journal desconhecido, com reinício e jobs posteriores.
Backup instalado/externo, RPO/RTO, papéis, keyring anterior e conciliação dos eventos
posteriores ao snapshot permanecem pendentes. Não é rollback de efeitos externos.

Composição de produção separada e preflight dos campos obrigatórios estão
preparados, com imagem por digest e sem defaults de segredos. Não provisionam
bancos nem alteram a entrada padrão; runtime v2 continua recusando produção.
Ver [preparação e limites](production-distribution.md). Aceite, supervisor,
provisionamento, homologação instalada e corte continuam pendentes.

Alvo Docker `persona-v2-candidate`, composição isolada e entrypoint v2 estão
implementados para homologação local. Migração é explícita; servidor e worker
recusam produção e não executam DDL no startup. O alvo padrão continua legado.
Ver [distribuição candidata](candidate-distribution.md). Isso não conclui
imagem de produção, homologação da cadeia instalada ou corte.
O [ensaio local empacotado](validation/2026-10-19-candidate-distribution.md)
confere quarenta migrations, recusa de legado/checksum, assets e reinício dos
quatro jobs, sem certificar hub/agente ou treinamento real.
O [percurso dirigido de treinamento na imagem](validation/2026-10-19-candidate-training-chain.md)
acrescenta Chromium com hub Prisma, agente e três motores: persona, bases,
treinamento, publicação, token e consulta. Os demais casos da matriz e o aceite
operacional da imagem continuam pendentes.

O [verificador de evidências](release-evidence.md) exige relatórios por gate,
hashes, registro de aceite e inventário dos arquivos do candidato. Somente mudar
`ready` e completar a lista não libera publicação. Publicação agora depende de
todos os jobs obrigatórios e reutiliza o artefato testado; deploy confere o mesmo
artefato da rodada exata. Vínculo do ID Docker às evidências v2 e conferência antes de publicar/enviar estão implementados. Promoção por ID imutável/origem aceita entre rodadas está implementada. Produtor v2 separado está configurado com ensaio empacotado. Restam execução e aceite da rodada produtora no GitHub e homologação da distribuição.
Não há evidências aceitas nem gate encerrado por essa implementação.
Ver [validação local do verificador](validation/2026-10-19-release-evidence.md).

Migrations das etapas anteriores, sem reescrever as já aplicadas e sem seed de
persona, fonte ou skill. Homologar banco vazio, reaplicação, concorrência,
checksum e recusa do legado antes de DDL.

Reset de dados exclusivo de desenvolvimento está implementado em comando separado,
com alvo local marcado como descartável, nome, ambiente e geração exatos; preserva
schema/migrations e recusa legado, recursos desconhecidos e conexões observadas.
Ver [procedimento e limites](development-reset.md). Não realiza o corte.
Nunca atingir hub, agente ou base de negócio. Imagem candidata com publicação
bloqueada. No corte, a composição principal passa a ser a v2 e as migrations
legadas saem do runner ativo, com histórico recuperável. Upgrades do hub e do
agente usam dados sintéticos preexistentes; capabilities de escrita nascem
desligadas.

## Etapa 15 — Homologação integral

A [consolidação do candidato de treinamento](validation/2026-10-23-training-candidate-consolidated.md)
executou os gates locais com serviços e sem omissões, as suítes PostgreSQL/Redis
v2, os sessenta percursos Chromium e os 79 cenários persistentes dos três motores.
Registra o candidato com as correções de releitura, N:N e parâmetros. Não
encerra avaliação humana/IA, matriz instalada ou os treze gates de produção.

A [rodada completa de treinamento](validation/2026-10-22-training-full-gates.md)
revalidou os gates locais e a suíte geral com serviços de fixture, sem omissões,
além dos 79 cenários persistentes dos três motores na candidata. Não é aceite
instalado, avaliação da IA ou prova de alterações posteriores. As omissões das
rodadas históricas abaixo foram preservadas como registros daquelas execuções.

A [consolidação após o editor delegado](validation/2026-10-20-delegated-editor-consolidated.md)
passou nas regressões locais, em 326 testes PostgreSQL e na imagem reconstruída
com 42 migrations, jobs e restauração. O percurso Chromium de persona, três
bases, treinamento/publicação e consulta também passou pela mesma imagem.
A suíte geral ainda tem 91 testes
condicionais sem execução nessa rodada. Não equivale ao aceite dos gates.

A [rodada local consolidada](validation/2026-10-20-local-candidate-gates.md)
passou nos checks estáticos, build e testes executados, mas deixou 91 testes
condicionais PostgreSQL/Redis sem execução naquela rodada. A suíte geral
exclui integração v2 e cadeia, que exigem comandos
próprios. Não usar o resultado local como aceite dos gates.
As [fixtures condicionais](validation/2026-10-20-conditional-integration-fixtures.md)
foram executadas em rodada posterior: sete suítes passaram sem omissões.
Isso fecha aquela lacuna local, sem certificar a integração v2 ou os três motores.
A [regressão PostgreSQL v2](validation/2026-10-20-v2-postgres-suite.md) também
passou em rodada própria, sem omissões. Cadeia persistente dos três motores,
imagem final e avaliação da IA continuam exigindo evidências separadas.

Executar a matriz abaixo na instalação persistente e nas imagens candidatas.
Ambiente obrigatório ausente bloqueia o aceite. Regressões dos três projetos,
os 100 cenários sintéticos existentes e as famílias novas de autorização,
cruzamento, operação, integração e OAuth. Avaliação da IA é separada do
harness: 100% em segurança e lacuna, ao menos 95% nos casos suportados; efeito
e segurança de escrita não admitem falha.

Atualizar os contratos do runtime que estiver em corte. Instruções legadas só
saem quando esse runtime for substituído. Exemplos usam IDs sintéticos.
Evidência por gate informa revisão, hash, motor, casos, omissões e limpeza.

### Matriz mínima dos três motores

Cada linha precisa de evidência em PostgreSQL, SQL Server e SQL Anywhere,
na cadeia persistente. Parser e simulação não substituem essa prova.

| Família            | Casos                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidade         | Homônimos, motor divergente, privilégio mínimo, prova antes e depois do SELECT e antes da transação, troca/timeout, reinício, cópia/restauração e reenrolamento   |
| Consulta           | SELECT adaptável, tipos, schema e view, recortes em toda a AST, JOIN composto/fanout, paginação, vazio, truncamento e limites                                     |
| Publicação         | Runners genéricos, casos positivos e negativos, relatório obsoleto, preview/hash/CAS e ampliação sem concessão automática                                         |
| Cruzamento         | Dependências, chaves compostas, nulos, duplicatas, unidades, fonte ausente, orçamento e revogação de fonte já lida                                                |
| DML                | INSERT/UPDATE/DELETE, recortes, adaptação restrita, concorrência, outputs, helpers e teto de 32 comandos                                                          |
| Efeitos e rollback | Trigger/cascata documentados, contagem excedida ou indeterminada, pré e pós-condição, falha de etapa e rollback confirmado ou desconhecido                        |
| Recuperação        | Queda em cada janela, commit sem comprovante, duplicata, timeout tardio, cancelamento, fingerprint divergente e nenhum reenvio incerto                            |
| Conciliação        | Marcador único da mesma transação, ausência, duplicidade, truncamento e evidência monotônica sem receipt fabricado                                                |
| Isolamento         | Responsável A com fonte B, vários tokens na mesma base, revogação em dispatch/entrega/aprovação/commit/exportação e invalidação física sem compartilhar resultado |

## Etapa 16 — Corte

Ensaiar instalação e upgrade aditivo de agente e hub, negociação de
capabilities, opt-in de escrita e MCP em banco vazio dedicado. O corte não
importa cadastro, token, OAuth, sessão, preview nem handle legados. Backup do
metadado e do journal, checklist de readiness e critério para interromper
novos dispatches. Restaurar o MCP não desfaz lançamento já aplicado no banco
de negócio. Só depois das evidências aceitas os manifestos podem ser revistos
em conjunto.

## Restrições que permanecem explícitas

- Administração por Bearer usa prova do responsável no contrato do hub, sem
  credencial administrativa permanente.
- Pessoal/sensível em consultas exige finalidades/justificativa publicadas e
  concessão integral. DML/datasets seguem livres; exportação JSON/binária exige
  contratos e concessões próprios, sem herança automática.
- Idempotência externa é a da operação publicada. Um header não torna a API
  idempotente.
- Expirar payload não autoriza nova execução.
- Gramática, transporte ou conciliação sem marcador que exijam decisão nova
  entram como proposta em [decisions.md](decisions.md).

Uma etapa termina com a implementação na composição real, permissões nas
chamadas diretas, migrations quando necessárias, documentação coerente e
verificações proporcionais. Este arquivo não executa reset, DML, migration,
publicação nem deploy.

# Atualização de precedência — 2026-10-24

DV2-015 dispensa somente validação manual real de HTTPS/ChatGPT e aceite
funcional humano. Referências anteriores a essas atividades são históricas;
não representam testes aprovados. Todos os critérios técnicos continuam vigentes.
