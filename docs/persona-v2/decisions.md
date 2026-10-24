# Decisões da refatoração persona-v2

Registro organizado em 2026-10-11 a partir das decisões já aprovadas. A data deste
registro não atribui uma nova data de aprovação às decisões. A precedência continua
em [AGENTS.md](../../AGENTS.md); implementação e pendências estão no [estado v2](README.md).

## DV2-001 — Persona central e fontes independentes

**Decisão:** o responsável administra personas; cada persona pode existir vazia,
conectar várias fontes e emitir vários tokens com concessões explícitas.

**Substitui no produto novo:** a equivalência legada entre client_token, persona,
catálogo e Bearer. Essa equivalência continua válida na manutenção da entrada legada.

**Motivo e efeito:** reunir uma especialidade com várias origens, mantendo credenciais,
treinamento e permissões próprios de cada fonte. Recursos novos não ampliam tokens.
[Contrato](onboarding.md) e [concessões](catalog.md#confirmação-e-autoridade).

## DV2-002 — Identidade nativa da fonte

**Decisão:** banco vem da policy; motor e identidade são comprovados pelo agente.
A prova esperada acompanha a execução na conexão dedicada, sem reconexão.

**Substitui:** inferência de identidade por nome, locator ou combinação de hub,
agente e database. Troca de destino suspende vínculos e dependências.

**Motivo e efeito:** impedir reutilização do treinamento em outra base homônima.
SQL Anywhere continua recusado quando fornece somente locator; a exceção
UUID provisionado foi aprovada posteriormente em DV2-007. Clones e
restaurações preservando identificadores têm limites explícitos.
[Contrato e limites](source-identity.md).

## DV2-003 — Publicação imutável e concessão vigente

**Decisão:** rascunho editável e publicação ativa são distintos; preview/hash/CAS
e confirmação autorizam publicação. Publicação e concessões delimitam execução.

**Substitui:** interpretação de grafo, rascunho ou validação técnica como licença
de consulta. Edição preserva publicação anterior; restrições/revogação suspendem uso.

**Motivo e efeito:** permitir evolução revisável sem ampliar a autoridade do
consumidor silenciosamente. [Contrato](catalog.md#confirmação-e-autoridade).

## DV2-004 — Operações treinadas têm contrato próprio

**Decisão:** operações SQL podem escrever mediante contrato publicado, preparação,
aprovação aplicável e journal. SELECT continua estritamente somente leitura.

**Substitui no produto novo:** proibição global de escrita herdada do runtime
legado. Não amplia consultar_dados nem autoriza uso de batch como atalho.

**Motivo e efeito:** executar operações limitadas e revisáveis. Resultado incerto
nunca é reenviado; conciliação não inventa receipt ou rollback.
[Contrato](sql-operations.md).

## DV2-005 — Cruzamentos fixam dependências

**Decisão:** cruzamentos publicam combinação tipada e publicações exatas, com
concessões de todas as dependências e casos atuais do runner separado.

**Substitui:** união automática de catálogos/tokens ou cruzamento improvisado de
SELECTs. Resultados incompletos não sustentam totais.

**Motivo e efeito:** tornar explícitas cardinalidade, unidades, proveniência e
limites. Leituras independentes não prometem snapshot distribuído.
[Contrato](federation.md).

## DV2-006 — Desenvolvimento separado e aceite coordenado

**Decisão:** a entrada v2 e sua baseline são independentes enquanto a entrada
principal permanece legada. Não há conversão ou reset operacional implícito.

**Substitui:** tratar a fundação implementada ou testes parciais como conclusão
da refatoração. Snapshot do hub não é anunciado como commit upstream.

**Motivo e efeito:** permitir desenvolvimento sem antecipar o corte. A
[matriz de aceite](acceptance.md) liga trabalho pendente às evidências; somente
o [manifesto](../../contracts/persona-v2-release.json) controla liberação.

## DV2-007 — UUID provisionado no SQL Anywhere

**Decisão aprovada em 2026-10-11:** SQL Anywhere pode usar identidade por UUID
provisionado manualmente pelo DBA, com permissões mínimas e procedimento para
cópias/restaurações. A aprovação veio da escolha explícita do responsável nesta
implementação; não autoriza modificar nenhuma base cadastrada.

**Substitui parcialmente DV2-002:** somente nesse motor, `identityKind: provisioned`
é admitido. Não chamar essa prova de nativa nem aceitar locator. PostgreSQL,
SQL Server e Firebird continuam exigindo `native`.

**Motivo e efeito:** o UUID persistido oferece continuidade após reinício e permite
recusar substituição homônima com UUID diferente. O agente lê metadados pela mesma
conexão executora. Runtime nunca provisiona ou repara; a tabela é reservada, não
é treinamento de negócio. Cópias preservam UUID até reenrolamento offline; não há
detecção automática de uma cópia que conserve todos os metadados observáveis.
[Provisionamento, permissões e restauração](source-identity.md#sql-anywhere-uuid-provisionado-pelo-dba).
Deploy e homologação integral permanecem bloqueados.

## DV2-008 — Conhecimento compartilhado por padrão e base

**Decisão aprovada:** padrões estruturais (incluindo Data7) são versionados em
catálogos privados, compartilhados por concessão explícita entre responsáveis.
Administradores gerenciam membros; curadores publicam; colaboradores propõem;
leitores recebem somente versões publicadas utilizáveis. Particularidades da base
exigem curadores designados com acesso vigente à identidade física comprovada.

**Substitui parcialmente DV2-001:** treinamento estrutural deixa de ser
necessariamente exclusivo de uma persona/fonte. Credenciais, resultados, recortes,
permissões e instruções particulares permanecem isolados. Conhecimento não concede
execução. Não promover automaticamente conteúdo privado existente.

**Publicação e aprendizado:** novos padrões/versões não atualizam skills; adoção
exige revisão, compatibilidade, testes e republicação. Exemplos são enviados
explicitamente, com variantes por dialeto; consultas comuns não são capturadas.
Metadados comprovam fatos técnicos, sem aprovar significado de negócio. Importação
DDL nunca executa o arquivo. Data7 não recebe certificação Firebird por inferência.

**Alcance:** [conhecimento compartilhado](shared-knowledge.md). O gate
`shared-knowledge-and-compatibility` permanece pendente na [matriz de aceite](acceptance.md).

## DV2-009 — Plugin privado separado por geração

**Decisão aprovada no plano consolidado:** corrigir o pacote legado e preparar
o candidato persona-v2 de forma independente, com identidade `se7e`, assets
oficiais e validação offline por perfil fixado. A montagem exige geração,
ambiente e variante explícitos, recusa sobrescrita e não altera instalações.
Preservar IDs reais; fixtures sintéticas não representam conexões cadastradas.

**Substitui:** tratar presença de arquivos como validação de pacote ou aceitar
implicitamente a geração legada. Tools das skills devem corresponder ao runtime;
instruções não concedem autoridade. V2 não captura consultas para treinamento.

**OAuth:** `/mcp` manual permanece separado do futuro `/mcp/chatgpt` v2,
scope `se7e:persona`, identidade opaca por persona, consentimento limitado e
revogação somente da conexão atual. Alteração do originador invalida derivados;
ampliação não é herdada. Na aprovação desta decisão, OAuth v2 e instalação real
estavam pendentes; a nota de implementação abaixo registra o avanço posterior.
[Contrato e validação](plugin.md). Distribuição pública fica fora do escopo.

**Ciclo de vida consolidado:** responsável autenticado suspende/recupera a persona
por CAS. Suspensão bloqueia uso, suspende publicações e revoga derivados;
recuperação preserva histórico e não ressuscita publicações ou concessões.
[Onboarding](onboarding.md#suspensão-e-recuperação-da-persona).

Nenhuma dessas entregas remove o bloqueio de deploy/imagens ou encerra gates.

## DV2-010 — Continuação e calendário de revisão do conhecimento

**Aprovado em 2026-10-13:** priorizar a conclusão do conhecimento compartilhado,
preservando as entregas v2, as dezesseis etapas restantes e o bloqueio de deploy.
Busca/grafo usam snapshots concedidos; índice é derivado, reconstruível e não
concede autoridade. Curadoria física, feedback, templates/datasets e compatibilidade
ampliada seguem o contrato e o plano restante, sem captura automática de dados.

**Revisão temporal:** prazo escolhido explicitamente pelo curador, sem prazo
padrão de noventa dias. Novas publicações sujeitas à revisão exigirão data;
existentes conservarão snapshots imutáveis e receberão calendário separado após
configuração explícita. Sem data inventada: mostrar revisão não configurada.
Vencimento gera aviso/tarefa, sem suspensão ou republicação automática. Revogação
e incompatibilidade continuam bloqueando imediatamente. Calendário separado e
avisos sob demanda estão no [contrato](shared-knowledge.md#feedback-e-revisão-temporal);
integração na publicação e worker v2 de tarefas/notificações internas estão
implementados em desenvolvimento no [contrato do worker](review-worker.md).
Outros jobs e envio externo continuam pendentes. Esta decisão
não certifica homologação integral ou disponibilidade em produção.

**Substitui:** eventual pressuposto de revisão temporal com prazo padrão.
Retenção de comprovantes por noventa dias permanece uma regra distinta.
Contratos: [conhecimento](shared-knowledge.md), [trabalho restante](remaining-plan.md).

## DV2-011 — Anexos compartilhados com recuperação autorizada

**Decisão:** conteúdo operacional de anexos pode ser persistido cifrado no banco
de controle v2, com hashes de handle, consumidor/concessão e origem. Instâncias
compatíveis e reinícios preservam o conteúdo e prazo original, sem reservar
autoridade. Acesso continua revalidado localmente e pelo hub/agente.

**Substitui:** a limitação inicial de armazenamento somente em memória e perda
obrigatória do anexo no reinício. Não compartilha resultados entre personas,
tokens ou concessões, não usa Redis/cache e não repete SELECT automaticamente.
Quotas globais, limpeza de expirados e rotação do cofre mantêm vínculo e deadline.
Implementação autorizada em 2026-10-16; homologação não libera produção.
[Contrato](attachments.md) e [pendências](remaining-plan.md#etapa-11--cache-e-anexos).

## DV2-015 — Dispensa das validações manuais de liberação — 2026-10-24

O responsável respondeu “pode remover estas validações” à pergunta explícita
sobre validação manual real de HTTPS/ChatGPT e aceite funcional humano.
Esses requisitos deixam de bloquear a liberação; não foram executados nem aprovados.
A decisão substitui somente essas exigências nos documentos anteriores.

Permanecem obrigatórios OAuth/HTTPS técnicos, segurança, avaliação automatizada
da IA quando exigida, três motores, imagem/fontes exatas, Node 24, compatibilidade
com agente 1.8.6 (posteriormente dispensada por DV2-016) e os demais critérios técnicos. Aprovação humana de operações
de negócio não é dispensada. Produção não é liberada por esta decisão.

Relatórios podem registrar `approval.status: technically_verified`, identificando
o verificador em `reviewer`, horário e artefato técnico por hash; isso não significa
aceite humano. Não registrar verificações manuais dispensadas como `passed`.
O manifesto permanece `ready: false` até comprovação dos critérios técnicos.

## DV2-016 — Dispensa do teste específico do agente 1.8.6 — 2026-10-24

O responsável determinou: “nao precrisa fazer teste de compatibilidade com
plug_agente 1.8.6 . remova se tiver em alguma documentacao exigencia”.
O teste específico dessa versão, instalado ou em VM, deixa de ser requisito.
Não há declaração de teste aprovado ou de suporte comprovado às extensões novas.
Contratos/runtime, testes gerais de negociação e recusa segura, três motores,
segurança, Node 24 e evidência do candidato exato permanecem exigidos.
Regressões úteis existentes e registros históricos não são apagados.

## Manutenção do registro de decisões

Nota de implementação de DV2-009 — 2026-10-12: núcleo OAuth e montagem candidata
ChatGPT entregues na entrada de desenvolvimento. O [contrato OAuth](oauth.md)
separa testes locais de instalação privada pendente. Administração OAuth aguarda
a delegação revogável do responsável no hub; consentimento não delega aprovação.

Nota posterior de implementação de DV2-009 — 2026-10-12: delegação MCP/hub e
setups de fontes entregues em desenvolvimento com gerenciar_fontes explícito,
consentimento OAuth e reautenticação do responsável no navegador. Demais
permissões administrativas continuam pendentes. Prova remota não cria transação
distribuída nem delega aprovação humana. [Contrato e limites](oauth.md#delegação-administrativa-e-setups-temporários).

Mudança aprovada registra decisão, motivo, regra substituída e contratos afetados.
Preserve decisões anteriores e marque a substituição por ID; não reescreva o
histórico como se a nova decisão sempre tivesse valido. Propostas não aprovadas
devem ser identificadas como propostas. Atualizar este registro não aprova gates.
