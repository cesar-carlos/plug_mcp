# Matriz de aceite persona-v2

Esta matriz define os critérios dos 13 gates do
[manifesto](../../contracts/persona-v2-release.json). Todos permanecem sem aceite
formal; produção e publicação de imagens continuam bloqueadas.

- Implementação atual: [estado](README.md) e contratos de cada subsistema.
- Lacunas, sequência e dependências: [plano restante](remaining-plan.md).
- Rodadas e limites de cada evidência: [índice de validação](validation.md).
- Vínculo ao candidato e aprovação: [verificador de evidências](release-evidence.md).

O escopo vigente exige PostgreSQL, SQL Server e SQL Anywhere. Relatórios antigos
podem tratar de Firebird ou de capacidades posteriormente entregues; descrevem
somente aquela rodada. HTTPS/ChatGPT permanecem para validação manual.

Uma evidência precisa identificar revisão/hash, ambiente, versões, casos,
omissões e limpeza. Testes locais ou uma rodada aprovada não encerram
automaticamente um gate. Critérios abaixo permanecem obrigatórios.

A [consolidação atual de treinamento](validation/2026-10-23-training-candidate-consolidated.md)
registra gates gerais com serviços, suítes PostgreSQL/Redis v2, console completo
e cadeia persistente integral no candidato identificado. É evidência daquela
rodada, sem avaliação humana/IA ou aceite automático dos gates abaixo.

A [matriz integral de 85 casos](validation/2026-10-23-shared-knowledge-journey-budget.md)
acrescenta a repetição após separar as jornadas OAuth, com inventários estáveis
e limites preservados. Não apaga o timeout anterior nem homologa cotas padrão
de produção, HTTPS, ChatGPT ou o conjunto de gates.

A [rodada integral de treinamento](validation/2026-10-22-training-full-gates.md)
registra gates locais, regressão geral com serviços sem omissões e os 79 cenários
persistentes dos três motores. O recorte posterior ao ajuste de polling do agente
está separado por snapshot. A evidência não constitui aceite instalado ou da IA,
nem encerra qualquer gate abaixo.

A [montagem privada do agente com prova de fontes](validation/2026-10-23-agent-private-runtime-package.md)
produziu e reconferiu aplicativo/pacote novos sem modificar o runtime do host.
É evidência de build/empacotamento. O
[bootstrap positivo e reinício](validation/2026-10-23-native-desktop-persistent.md)
foi validado com DPAPI e hub Prisma, sem instalação. A
[rodada instalada com UAC](validation/2026-10-23-installed-fixture-handoff.md)
passou instalação, reparos, migração explícita de supervisor, reinstalação e
limpeza em namespace privado, incluindo nove grupos sem elevação. Não certifica
apply/probation/rollback automático nem todas as alterações atuais do agente;
nenhuma dessas rodadas encerra gate ou recertifica a cadeia anterior.

## shared-knowledge-and-compatibility

[Prova SQL Anywhere 16](validation/2026-10-15-sqlanywhere-constraints.md) habilita
constraints locais declaradas dentro do alcance comprovado. Matriz integral e
ampliação de versões/tipos continuam pendentes; nenhum gate é encerrado.

[Relacionamentos DML](validation/2026-10-15-operation-relationships.md) acrescentam
dependências compostas/reversas e caminhos explícitos. Prova SQL Anywhere,
matriz integral de perfis e aceite do candidato continuam pendentes.

Biblioteca editorial 0021 acrescenta versões cifradas de templates/datasets,
rascunhos com origem explícita e DDL interpretado sem execução. Não aprova casos,
semântica ou compatibilidade. Importação delegada limitada está implementada;
gestão editorial delegada restante e integração com os runners já existentes
continuam pendentes.
Preparação de sementes do dataset de origem para consulta tem
[evidência dirigida](validation/2026-10-22-dataset-case-seeds.md) de console,
PostgreSQL e runner nos três motores; não cria/aprova casos automaticamente nem
conclui a integração editorial ampliada ou este gate.
Casos de consulta também conservam [origem editorial validada](validation/2026-10-22-dataset-case-origin.md),
com distinção entre sementes originais/editadas e recálculo pelo servidor.
A referência não herda aprovação; runners dos três motores têm rodada dirigida
estável, sem encerrar datasets de outros tipos ou este gate.
Escolha explícita de versões de dataset do mesmo template tem
[evidência dirigida](validation/2026-10-22-dataset-case-choice.md) de paginação,
recusas, console e publicação por runners nos três motores. Não adota versão
automaticamente nem habilita datasets de outros tipos de skill.
[Contrato e limites](knowledge-library.md). Nenhum gate encerrado.
[Rodada parcial](validation/2026-10-14-knowledge-library.md): implementação local
validada; naquela rodada houve divergência do hub e falhas na cadeia. A
[repetição atual](validation/2026-10-19-hub-chain-rerun.md) passou, sem encerrar
a matriz ampliada ou o aceite integrado.

[Revalidação da biblioteca](validation/2026-10-14-knowledge-library-validation.md):
tipos e precisão editorial reforçados, limites de DDL conferidos e commit-base
do hub revisado sem mudança dos bytes do contrato/patch naquela rodada. Ela
registrou falha após reinício; a rodada de composição acima foi repetida com
sucesso. Não há aceite integral nem gate concluído.

**Implementado em desenvolvimento:** catálogo privado, membros/papéis, rascunhos
CAS, preview/confirmação de uso único, publicação imutável, suspensão, histórico
paginado e comparação de estrutura/significado/exemplos. Console, representação
nativa por dialeto, caminhos N:N e exemplos adicionais em skills privadas.
[Contrato](shared-knowledge.md).

Feedback explícito por item e calendário separado por publicação estão em
desenvolvimento, com fila editorial, encaminhamento, CAS e histórico. Prazo é
definido pelo curador; vencimento produz aviso/tarefa sob demanda sem suspensão.
[Rodada parcial](validation/2026-10-14-knowledge-feedback-review.md) registra
PostgreSQL, Chromium e cadeia persistente, sem encerrar este gate.

Avanço de desenvolvimento: inspeção por recursos, evidência imutável 0013 e
adoção inicial em consultas, com expectativa de colunas na conexão executora.
Perfis físicos têm revisão/publicação por curadores com acesso à base e adoção
explícita por consulta. Constraints utilizadas exigem sourceConstraints v1 e
verificação na mesma conexão. SQL Anywhere 16 tem prova nativa limitada a
constraints locais declaradas e configuração verificável. DML tem adoção inicial;
ampliação de alcance e homologação integral continuam pendentes. Console oferece inspeção,
compatibilidade, perfis CAS/publicação e adoção explícita no rascunho de consultas.
Nenhum gate encerrado.

Busca lexical ampliada e grafo concedido usam índice derivado por publicação/hash,
proveniência e paginação vinculada à autorização. O console envia tabelas e
relacionamentos pelos editores estruturados. Propostas físicas agora têm
persistência própria, revisão exata e incorporação apenas em rascunhos, com acesso
vigente à mesma base; demais pendências de curadoria continuam abertas.
Esses avanços não encerram o gate.
[Rodada de curadoria física](validation/2026-10-14-physical-curation.md): origem
imutável, revisão/incorporação CAS, isolamento, console e prova pela cadeia
persistente dos três motores. Alcance parcial, sujeito aos limites do relatório.
[Rodada de busca/grafo](validation/2026-10-14-knowledge-search-graph.md): provas
de isolamento, reconstrução/paginação, console e cadeia persistente dos quatro
motores são parciais e vinculadas ao inventário do candidato daquela rodada.

[Rodada dos editores físicos](validation/2026-10-13-console-physical-knowledge.md):
inspeção/compatibilidade/perfis/adoção no Chromium, regressões PostgreSQL e
contratos pela cadeia persistente dos três motores. Evidências separadas;
não encerra este gate nem o aceite completo de acessibilidade ou da IA.

**Para aceite:** inspeção/prova estrutural `sourceSchema` v1 nos três motores,
perfis físicos/curadores com acesso vigente, associação fonte/versão/compatibilidade,
dependências executáveis, curadoria/testes e tools MCP autorizados. Demonstrar duas
personas na mesma base, bases distintas compatíveis, responsáveis concedidos,
revogação em trânsito, versões fixadas e nenhum compartilhamento de resultados.
Este gate adicional não substitui os gates de consulta, identidade ou motores.

## identity-and-authorization

**Implementado:** credenciais por fonte, JWT/vínculo/policy, concessões, descoberta
nativa (UUID provisionado no SQL Anywhere, DV2-007), prova na conexão executora e suspensão transitiva.
Edição administrativa por CAS e troca de credenciais verificadas pelo hub/agente,
com suspensão das publicações afetadas, estão disponíveis em desenvolvimento.
Suspensão/recuperação da persona usa CAS, bloqueia uso e preserva snapshots;
recuperação não remove suspensões ou revogações anteriores.
Fontes também dispõem de suspensão/recuperação CAS e substituição transacional
por novo vínculo. Recuperação exige prova da mesma identidade; vínculo
substituído não reativa nem transfere concessões. Upgrade aditivo preserva dados
v2 e snapshots. Homologação integral continua obrigatória.
A [rodada de ciclo de fontes](validation/2026-10-13-source-lifecycle.md) cobre
prova real de recuperação/substituição nos três motores e isolamento entre
personas, com testes específicos de upgrade/console. Não encerra este gate.
[Contrato](source-identity.md); [regressões](../../tests/unit/persona-v2/source-identity.test.ts).

**Para aceite:** provar permissões mínimas, substituição homônima, mudanças durante
dispatch e revogação na cadeia real MCP/hub/agente; validar a identidade
SQL Anywhere provisionada conforme DV2-007 na cadeia completa e o procedimento
DBA de restauração/reenrolamento. Evidência sintética é insuficiente.

## training-and-local-query

A [sessão local de treinamento manual](validation/2026-10-22-manual-training-session.md)
foi validada com controle vazio e navegador nos três motores. Disponibiliza o
ensaio humano com prazo/parada próprios; não constitui aceite humano, avaliação
da IA ou liberação deste gate.

**Implementado:** catálogo/CAS/publicação, SELECT por fonte, parâmetros e recortes.
[Catálogo](catalog.md), [consulta](source-queries.md) e
[testes reais de persistência](../../tests/persona-v2/source-query.postgres.test.ts).

Runner genérico de consultas e operações validado em fixtures na
[rodada dos três motores](validation/2026-10-15-publication-runners.md), com
casos declarativos, reprovação preventiva e evidência das identidades.
A [matriz ampliada](validation/2026-10-15-publication-matrix.md) acrescenta tipos
exatos, PK/UNIQUE/NOT NULL, FK composta e efeitos/rollback de trigger nos três
motores, sem certificar todas as extensões nativas ou encerrar o gate.
Os [casos de CHECK/cascatas/UPDATE/DELETE](validation/2026-10-15-publication-effects.md)
acrescentam prova nativa de rollback e efeitos indiretos nos três motores.
O alcance é fechado: intervalo inteiro, cascata composta e cópias NEW/OLD;
não certifica expressões arbitrárias, encadeamentos ou toda a gramática nativa.

**Para aceite:** ampliar homologação de grafo/busca e curadoria, matriz do runner, classificação,
privacidade, anexos e cache conforme contratos. Registrar relatórios atuais dos
casos e avaliação da IA consumidora, distinguindo significado de execução técnica.

## federation

**Implementado:** publicação de combinação tipada, dependências, concessões,
proveniência, limites e runners sintético e pela cadeia real. O runner genérico
passou nos cruzamentos PostgreSQL/MSSQL e PostgreSQL/SQL Anywhere;
[alcance e limites](validation/2026-10-15-publication-runners.md). [Contrato](federation.md) e
[regressões](../../tests/unit/persona-v2/federation-publication.test.ts).

**Para aceite:** ampliar as combinações de consultas dependentes na cadeia real,
normalização/unidades, cardinalidade, incompletude e revogação durante combinação.
Identificar relatórios atuais e avaliar a resposta da IA separadamente.

## agent-operation-journal

**Implementado:** journal durável, recuperação, executor/RPC e duplicatas sem reenvio.
[Contrato](sql-operations.md#transporte-e-journal).

**Para aceite:** registrar revisão do agente, driver/motor e casos de reinício,
confirmação perdida, cancelamento, mudança de identidade e timeout tardio no fluxo
completo; concluir retenção/limpeza e validar limites/triggers/conversões restantes.

## hub-operation-contract

**Implementado:** REST aditivo por base + snapshot, negociação e transporte sem
reenvio por ACK. [Contrato](sql-operations.md#transporte-e-journal) e
[verificação dos hashes](../../tests/unit/hub-contract-pin.test.ts).

**Para aceite:** homologar instalação completa MCP/hub/agente, canais e sessões
negociadas, policy e mudanças em trânsito. Registrar base, hashes e resultados;
contract:check e mocks não substituem essa execução.

## operation-approval-and-reconciliation

**Implementado:** preparação/aprovação/claim, SQL adaptável restrito e conciliação
por marcador transacional. [Contrato](sql-operations.md) e
[regressões](../../tests/unit/persona-v2/sql-operations.test.ts).

**Para aceite:** concluir jornadas administrativas, retenção e fluxos restantes;
demonstrar aprovação específica, concorrência/revogação, evidência ausente/duplicada/
truncada e nenhum reenvio incerto. Conciliação sem marcador exige contrato seguro
próprio antes de implementação e homologação.

## external-rest-and-mcp

[Runner e casos/relatórios](validation/2026-10-15-external-runner.md): validação
local PostgreSQL/TLS/Chromium. Não encerra gate; referência/CI do hub, operação
dos journals e aceite público continuam pendentes.

[Rodada de conciliação](validation/2026-10-15-external-reconciliation.md): fixtures
REST/MCP em TLS nativo e journal PostgreSQL; perda de confirmação, reabertura e
evidência append-only sem retry. DNS/HTTPS público e ChatGPT continuam manuais.

**Implementado em desenvolvimento:** consultas REST/MCP e ações com preparação
cifrada, aprovação Client no console, claim único durável e recuperação conservadora.
Conciliação treinada registra evidência independente, sem alterar receipt ou permitir retry.
[Contrato e limites](external-integrations.md). Nenhum gate encerrado.

**Para aceite:** homologar o runner CLI e concluir importação/descoberta, editores de contratos,
homologação pública de provedores e manutenção do journal. Ampliar provas de segurança,
falhas/reinício e evidência operacional em serviços externos isolados reais.

## oauth-and-console

[Percurso na imagem candidata](validation/2026-10-19-candidate-training-chain.md):
Chromium cria persona, três fontes, treinamento/publicação e token, consulta pela
cadeia persistente e distingue vazio/recusa. Um cenário dirigido não encerra o
gate nem substitui HTTPS/ChatGPT ou a matriz completa.

[Emissão limitada por setup](validation/2026-10-15-token-issuance-setup.md)
implementada com proposta imutável e confirmação humana. Evidência local não
encerra o gate; integrações, manutenção e validação manual pública continuam pendentes.

[Setup de rotação do token originador](validation/2026-10-15-token-rotation-setup.md)
implementado e testado com PostgreSQL/Chromium locais. Integrações e
aceite manual público continuam pendentes; essa evidência não encerra o gate.

**Preparação HTTPS:** [verificador e roteiro manual](validation/2026-10-15-https-manual.md).
Checks públicos/pacote não comprovam isolamento, instalação ou conversa real;
DNS/servidor e conexão ChatGPT aguardam validação manual, sem encerramento de gate.

**Implementado em desenvolvimento:** navegação por áreas, identidade oficial,
edição protegida, nomes de snapshots publicados, consulta paginada, gestão CAS de
tokens, revisão/aprovação de preparações, impacto transitivo de fontes, erros
por campo e execução de cruzamentos concedidos com paginação final. Roteiro
derivado de registros reais, teste de conexão sem SQL, diagnóstico local,
histórico paginado, diagrama/lista e comparação servidor de conteúdo publicado.
[Contrato e limites](console.md).
[Fluxo](onboarding.md) e [Chromium](../../tests/persona-v2-browser/persona.spec.ts).

[Chromium com cadeia persistente](validation/2026-10-15-hub-pin-real-console.md):
74/74 na rodada ampliada, com criação/treinamento/publicação e consultas nas três
bases pelo console. Evidência local sem hub sintético; não encerra este gate ou
comprova conexão no ChatGPT real.

**Implementado adicionalmente:** delegação opaca MCP/hub e setups de fontes com
gerenciar_fontes, consentimento, POST/CSRF, uso único e reautenticação humana.
[Contrato](oauth.md#delegação-administrativa-e-setups-temporários) e
[evidência parcial](validation/2026-10-12-setup-delegation.md).

**Para aceite:** concluir outros setups, administração/delegação, autorização
transacional completa, gestão OAuth/setup e demais jornadas. O núcleo OAuth v2
está implementado em desenvolvimento ([contrato](oauth.md)). Registrar navegador/TLS/DNS,
consentimento, replay/revogação/concorrência e compatibilidade manual real.
OAuth legado não comprova OAuth v2.

[Rodada OAuth v2](validation/2026-10-12-oauth-plugin-v2.md): PostgreSQL, replay,
revogação, consulta autorizada e Chromium HTTPS com certificado de fixture;
DNS público e autoridade de fonte sintéticos. Não comprova instalação privada
no ChatGPT, delegação administrativa ou encerra o gate.

**Pacote em desenvolvimento:** [perfil Se7e versionado](plugin.md), validação
offline de manifesto/frontmatter/referências/inventário/assets e separação de
gerações. Candidato v2 portátil usa Bearer; variante ChatGPT v2 exige ID real da
conexão OAuth de homologação. Exigir instalação privada e conversa nova no cliente real,
ID/ambiente correspondentes, discovery autorizado e OAuth completo. Aprovação
local do pacote não encerra este gate nem `coordinated-cutover`.

[Rodada de pacote e ciclo de vida](validation/2026-10-12-plugin-lifecycle.md):
regressões locais, PostgreSQL e Chromium com autoridade sintética; não comprova
OAuth v2 ou instalação no cliente.

[Rodada de melhorias do console](validation/2026-10-12-console-improvements.md):
evidência parcial de desenvolvimento com PostgreSQL e hub sintético. Não cobre
inspeção/compatibilidade compartilhada, zoom real, leitor de tela nem IA.

## postgres-real

**Disponível:** fixtures PostgreSQL, runner de operações, matriz ODBC e cadeia
MCP/hub/agente isolada com consultas, cruzamento e DML aprovado.
[Rodadas](validation.md) e [runners](sql-operations.md#contrato-publicado-e-testes-obrigatórios).

**Para aceite:** instalação completa com autoridade real, SELECT/cruzamentos/DML,
tipos/triggers/outputs, identidade, revogação e recuperação. Registrar versões,
fixtures próprias, comandos e todos os casos obrigatórios sem skips.

## mssql-real

**Disponível:** compilador, matriz ODBC e cadeia MCP/hub/agente isolada com
consultas, cruzamento e DML aprovado. [Rodadas](validation.md).

**Para aceite:** a mesma cadeia operacional exigida para PostgreSQL, no SQL Server,
e runner de publicação próprio. Resultado de parser ou de outro motor não vale.

## sybase-real

**Disponível:** compilação, outputs e identidade provisionada SQL Anywhere em
fixtures dedicadas e cadeia MCP/hub/agente isolada com consulta/cruzamento/DML; locator
continua recusado para fonte v2. [Identidade](source-identity.md) e [rodadas](validation.md).

**Para aceite:** homologar UUID provisionado conforme DV2-007 na cadeia operacional,
gramática, tipos/triggers/outputs e runner de publicação do motor. Preservar o ID
sybase-real do manifesto; não renomeá-lo para contornar o gate.

## Firebird fora do suporte

Removido do escopo por decisão do produto em 2026-10-14. Os relatórios anteriores
são históricos. A remoção não conclui nenhum gate dos três motores suportados.

## coordinated-cutover

O [contrato de evidências](release-evidence.md) define a verificação automatizada
de hashes, associação ao candidato e registro de aceite por gate. Não substitui
revisão humana, imagem homologada ou ensaio instalado; o gate permanece aberto.

**Estado:** entrada principal, worker e distribuição ainda legados.
[Desenvolvimento](README.md#uso-de-desenvolvimento).

Há [alvo candidato isolado](candidate-distribution.md) para servidor, worker e
migration v2 explícita. Sua construção local não substitui aceite da imagem de
produção ou a cadeia instalada, nem altera a distribuição padrão legada.

**Para aceite:** substituir fluxos restantes, validar pacote/imagem/inicialização,
limpeza/retenção e plano de corte para banco MCP vazio. Demonstrar preservação de
hub/agente/ERP e critérios de recuperação. Reset exige alvo/ambiente/confirmação
exatos; todos os outros gates precisam de evidência aceita antes da liberação.
