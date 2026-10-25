# Console persona-v2 — desenvolvimento e servidor de teste

O aviso do console identifica ambiente de teste e aceite integral pendente.
Disponibilidade do servidor não aprova gates nem dispensa revisão/publicação,
concessões ou aprovação Client dos efeitos. Ver [deploy inicial](first-test-deploy.md).

## Clareza, acessibilidade e recuperação da interface

Formulários sinalizam campos obrigatórios sem alterar seu nome acessível.
Validação nativa mantém foco no campo inválido e acrescenta orientação local
associada por `aria-describedby`; corrigir remove o erro local. Erros não copiam
valores para mensagens. Falhas preservam edição não secreta; credenciais continuam
sendo descartadas após tentativa e a expiração da sessão limpa o contexto.

Solicitações bloqueantes exibem aviso de processamento. Revisar impacto de fonte
tem guarda local síncrona para impedir cliques repetidos antes da atualização do
componente pai. Nenhuma dessas proteções autoriza retry de efeitos incertos.
Revogação de token explica perda das skills/conexões OAuth derivadas, preservação
dos outros tokens e impossibilidade de desfazer efeitos anteriores. Integrações
mantêm revisão de dependências, fingerprint e confirmação explícita.

O roteiro destaca, na ordem do servidor, o primeiro passo que não esteja concluído
nem marcado como não aplicável, incluindo bloqueios e sua razão. É orientação, sem concessão de
autoridade ou verificação remota implícita. Respostas de persona descartada não
atualizam o roteiro vigente. Sessão expirada retorna ao login com aviso explícito.

Botões, resumos expansíveis e links do menu têm altura mínima de 44 px. Tabelas e conteúdo técnico podem
rolar horizontalmente em tela pequena; diálogos têm altura limitada à tela e
mantêm cancelamento por Escape, foco inicial e retorno ao elemento anterior.
Testes de navegador cobrem validação, espera sem duplicação, expiração, resposta
atrasada após troca de persona e navegação móvel por diálogo. APIs sintéticas
nesses testes comprovam comportamento da UI, não autoridade remota nem efeitos.

## Busca local e carregamento por área

O console permite buscar personas por nome/especialidade, bases por nome/motor,
skills por nome nos quatro editores e tokens por nome/situação. Busca ignora
acentos e caixa, combina todas as palavras e informa a contagem encontrada.
“Não revogados” inclui tokens que podem estar expirados; o filtro não certifica
validade nem autoridade. Seletores conservam o item atual mesmo fora da busca;
filtrar bases só oculta linhas, sem desmontar suas edições. Editar um token e
filtrar sua linha não descarta o formulário. Filtros não são persistidos nem
geram concessões, consultas remotas ou alterações no cadastro.

Painéis de catálogo, conhecimento, integração e operação SQL são carregados sob
demanda, com aviso de espera e erro de download. Catálogo e formulário de consulta
só são montados na área correspondente; guardas de navegação continuam exigindo
confirmação antes de descartar edição. Falha de download não repete efeitos nem
recarrega automaticamente a página. O build não eleva o limite de aviso de tamanho.
Ao abrir treinamento importado, o foco aguarda a montagem dos painéis e o fim
das leituras bloqueantes, para não ser perdido por um editor carregado depois.

Ajuda expansível explica persona, fonte, skill, rascunho/publicação e token/concessão.
Cadastro de persona oferece exemplos de preenchimento. Estados sem seleção,
fonte, treinamento ou token orientam a próxima ação; zero resultados da busca
não é apresentado como ausência de cadastro. O atalho “Pular para o conteúdo”
move o foco por teclado, sem mudar a rota; o título da página acompanha a área.

As verificações automatizadas cobrem nomes/descrições acessíveis, foco, teclado
e reflow equivalente a 200% (640 px CSS para viewport original de 1280 px,
também com texto ampliado). Não equivalem a uma sessão humana com leitor de tela.

### Testes rápidos e integrados

`npm run test:persona-v2:ui` gera o build e executa `ui-*.spec.ts` em dois workers,
com contextos e respostas sintéticas independentes. A fixture estática escuta
somente em localhost:5189 e recusa APIs não simuladas; não abre banco, hub ou ERP.
Usar para feedback rápido de formulários, filtros, navegação e carregamento.

`npm run test:persona-v2:browser` continua sendo o comando completo usado pela CI:
gera um único build, executa a suíte rápida e depois a integrada. A integrada
mantém um worker, porta 5188 e bancos PostgreSQL aleatórios próprios, com limpeza
ao terminar. Seus casos compartilham a fixture e não foram paralelizados sem
isolamento adicional. Rodar somente a suíte rápida não aprova os gates integrados.
Não reconstruir o build enquanto qualquer uma das rodadas estiver em andamento.

## ERP no cadastro de bases

A área Bases oferece uma segunda etapa opcional, **ERP / padrão de estrutura da
base**, depois da confirmação de identidade e dialeto. Reutiliza o seletor do
catálogo autorizado, versões publicadas, perfis físicos, inspeção e comparação
existentes. Também atende bases já cadastradas, sem migrations ou alterações nos
cadastros. Não cria um catálogo Data7 fictício quando não houver material publicado.

A inspeção e a compatibilidade continuam usando os serviços autenticados e os
metadados do hub/agente. Incompatibilidade, prova insuficiente e revogação não
habilitam adoção. Seleções e inspeções pendentes têm proteção de navegação; não
são um vínculo permanente na fonte. A referência executável fica no rascunho da
skill após adoção explícita, e exige publicação e concessão próprias. Selecionar
ERP não converte SQL entre dialetos nem transfere vínculos a uma base substituta.

O cadastro técnico pode ser concluído sem ERP. Campos de credenciais continuam
sendo descartados após a tentativa; a segunda etapa não repete o cadastro.

Validação desta integração: Chromium em PostgreSQL descartável com hub sintético,
cobrindo seleção no cadastro, inspeção, compatibilidade, proteção de navegação e
regressão da adoção existente em skills. Não certifica os agentes das bases
cadastradas nem substitui a cadeia persistente nos três motores. A implantação do
console atualizado permanece separada da implementação local.

Trocar a base de um treinamento de consulta com referência compartilhada exige
confirmação. Cancelar preserva fonte e vínculo; confirmar remove somente o
vínculo do rascunho local, sem reassociar padrão/perfil à nova base. Estrutura,
SQL e regras continuam sujeitos a revisão, salvamento e publicação explícitos.
A publicação ativa não é alterada. Resposta de confirmação de outro contexto
não muda a edição atual. [Regressão](validation/2026-10-23-query-source-knowledge-reset.md).

Cada recurso de consulta permite escolher **Tabela** ou **View**. A ausência
histórica de tipo continua representada como tabela, sem editar o rascunho ao
abrir. A escolha é salva e aparece na publicação; não detecta o tipo no banco nem
amplia a policy técnica. Corrigir um tipo exige revisão/republicação e concessão
compatível. [Regressão com view de fixture](validation/2026-10-23-query-view-editor.md).

Sair da área Consultas com SQL adaptado, valores ou modos de envio alterados
exige confirmação. Continuar editando preserva esses campos; confirmar descarte
limpa SQL, valores e modos. Trocar persona, sair da sessão ou fechar a página
também protege essas edições; expiração da sessão continua descartando dados.
Ao voltar, nulo explícito, texto vazio ou omissão precisam ser
escolhidos novamente. A limpeza não altera a seleção/publicação da consulta,
o treinamento ou as concessões. [Regressão](validation/2026-10-23-query-parameter-reset.md).
O editor agrupa cada parâmetro com nome/tipo/significado específicos, evitando
confundi-los com o nome da skill ou campos da estrutura. Isso não muda o contrato.

Em Tokens e conexões, revogar um token preserva a edição não salva de outro;
a proteção de navegação dessa edição permanece ativa. A lista distingue
carregamento, falha e ausência confirmada: erro não significa que não há tokens.
Se houver dados anteriores, eles são identificados como última leitura confirmada.
Atualização é explícita. A disponibilidade OAuth encerra o carregamento em caso
de erro e oferece nova tentativa, sem iniciar consentimento ou alterar conexão.

Consultas e operações reutilizam os campos de caminho N:N. O editor de consultas
permite identificar os relacionamentos, selecionar intermediárias e ordenar os
elos diretos. Novas relações recebem ID local sem colisão; relações antigas não
são renomeadas. Referências existentes permanecem visíveis mesmo quando pendentes;
alterar uma tabela ou ID não remapeia o caminho automaticamente. Salvar rascunho
não comprova validade: a prévia recusa caminho incompleto e JOIN direto entre as
extremidades de uma associação com intermediárias. Somente a publicação revista
define a capacidade executável. [Validação](validation/2026-10-23-query-relationship-paths.md).

O editor de casos oferece escolha paginada de datasets da versão exata do
template de origem. Seleção não muda sementes; preparação exige ação e
confirmação separadas. [Contrato e limites](knowledge-library.md#escolher-uma-versão-de-dataset).

Casos de consulta carregados de dataset conservam referência editorial no
conteúdo salvo e a exibem ao reabrir. A conferência distingue sementes originais
de editadas, sem aprovar execução ou semântica. [Contrato e limites](knowledge-library.md#origem-editorial-no-caso-salvo).

Importação de template confirmada oferece **Abrir treinamento criado**. A ação
relê o destino autorizado e protege edições antes de abrir o rascunho, sem exigir
troca manual do seletor de persona para atualizar a lista. Falha preserva a edição;
o foco aguarda o carregamento do editor. [Contrato da biblioteca](knowledge-library.md#templates).

Emissão e edição de tokens oferecem seleção explícita das integrações
administráveis quando gerenciar_integracoes está escolhida. O seletor consulta
a listagem administrativa, sem credenciais, e não marca IDs automaticamente.
IDs já concedidos que não estejam disponíveis permanecem removíveis. Emissão
limpa seleção com o restante do formulário; troca de contexto descarta respostas
antigas. Esse escopo não concede execução. Tipos, lint e build passaram;
a [rodada Chromium dirigida](validation/2026-10-20-integration-management-console.md)
confirma emissão explícita e retirada persistida. Aceite integral permanece pendente.

Erros seguros do editor de consulta associam nome e identificador aos campos,
com foco e descrição acessível. Recusa genérica do treinamento foca aviso na
seção, sem apontar falsamente um campo específico. Edição e SQL são preservados.

O treinamento de consulta inclui painel de casos/relatórios por revisão, com
paginação e indicação de aprovação técnica e conteúdo obsoleto. Leitura é
explícita; edição local, troca de contexto ou erro descartam o resultado anterior.
O botão **Recarregar treinamento** busca novamente o rascunho no servidor.
Alterações locais de treinamento, casos, conhecimento ou prazo exigem confirmação
de descarte. Cancelar ou falhar a leitura preserva a edição. Somente uma resposta
atual da mesma persona/skill substitui os campos; sucesso limpa prévia, confirmação
e editores de casos/conhecimento. Não salva, publica ou muda o snapshot ativo.
Revisão concorrente exige recarregar o rascunho; não combina páginas de pacotes
diferentes. O painel não executa testes ou aprova evidência. Cadastro/correção de
casos por API/MCP estão disponíveis. O editor visual cadastra, corrige e remove
casos declarativos por CAS, com parâmetros, sementes e resultados esperados
tipados. Conflito preserva edição; remoção exige confirmação. Casos antigos fora
do schema são recusados sem conversão. Enquanto há edição pendente do caso, o
treinamento principal fica protegido; navegação/troca de persona exige descarte.
Nenhum cadastro executa SQL ou aprova o caso. Não herdar aprovação do snapshot.

Histórico de versões do padrão oferece leitura paginada do impacto nas personas
do responsável. Mostra nomes publicados e dependências diretas/indiretas sem
expor outros responsáveis ou confirmar disponibilidade de execução.
No perfil físico selecionado, a mesma leitura exige acesso atual à base e
apresenta somente dependências daquela versão exata, antes da suspensão separada.
Filtros de tabela/schema e coluna usam a estrutura fixada no snapshot e descartam
resultados antigos ao editar. Nome sem schema não pesquisa todos os schemas;
publicações sem prova estrutural não recebem dependências inferidas.

O editor de perfis físicos inclui comparação de versões publicadas do mesmo
perfil, usando a listagem paginada autorizada. Diferenças vêm do servidor; a
comparação exige acesso vigente à base e catálogo e não adota versões. Veja o
[contrato](shared-knowledge.md#comparação-de-versões-físicas-publicadas).

O console em `/app/` pertence exclusivamente a `dev:persona-v2`. A entrada
principal, o worker e o manifesto legados não foram substituídos. Este documento
descreve o alcance implementado. O que ainda falta está no
[trabalho restante](remaining-plan.md) e na [matriz de aceite](acceptance.md).
Deploy permanece bloqueado.

A fixture de testes Chromium é inicializada por `globalSetup` e finalizada pelo
runner no mesmo processo. A limpeza fecha HTTP/runtime/pools e remove somente
bancos da rodada e seu arquivo de estado, inclusive quando um teste falha.
Esse mecanismo não é um endpoint da aplicação nem uma prova de parada do
servidor instalado. Não depende de sinais ou encerramento da árvore de processos
no Windows; erro de limpeza não deve ser ignorado como teste aprovado.

Treinamento de consulta permite escolher finalidades por campo e justificar
dados pessoais/sensíveis. Emissão exibe os usos concedidos por publicação;
edição permite retirar/restaurar capacidades por finalidade. Retirar um uso
obrigatório bloqueia a skill inteira, sem criar consulta parcialmente concedida.
Adoção de campo pessoal/sensível exige configurar os usos locais antes de publicar.
Segredo/inferido e DML sensível permanecem bloqueados conforme o
[contrato de campos](source-queries.md#campos-e-finalidades).

## Navegação e edição

Vue Router usa fragmentos `#/personas`, `#/overview`, `#/sources`, `#/knowledge`,
`#/training`, `#/tokens`, `#/queries`, `#/operations`, `#/integrations` e
`#/catalog` e `#/history`. SQL, parâmetros, credenciais e resultados nunca integram essas URLs.
O catálogo compartilhado é global; não depende da seleção de persona. A área
Conhecimento permite inspecionar as bases, comparar versões publicadas e editar
perfis físicos. Treinamentos permite adotar explicitamente essas versões em consultas.

Na inspeção, o console mantém páginas vigentes somente em memória e oferece
**Combinar páginas inspecionadas** explicitamente. A evidência composta apresenta
origem/horários e menor validade, sem snapshot simultâneo ou adoção automática.
Mudar escopo, fonte/versão, reiniciar inspeção ou expirar a prova descarta o
contexto correspondente. Metadados ausentes continuam inconclusivos; juntar
páginas não comprova que uma tabela inexistente ou não autorizada está disponível.
Contrato: [composição](shared-knowledge.md#composição-de-páginas).

Criar uma persona abre sua visão geral com roteiro de bases, treinamento,
permissões e consultas. O roteiro usa registros reais de persona, fontes,
rascunhos, publicações, concessões, diagnóstico e consultas registradas. Cada
etapa tem estado, motivo e link para a próxima ação; não há marcação manual nem
execução automática. Treinamento privado atende à etapa de conhecimento sem
exigir Data7. Autenticação/consulta históricas ficam separadas da disponibilidade
atual, que exige nova verificação. **Atualizar roteiro** refaz a leitura local;
não consulta o banco de negócio. No celular, o menu é recolhível. Todos os formulários
mantêm edição somente em memória. Navegação, troca de persona, saída e troca de
rascunho exigem escolher **Continuar editando** ou **Descartar alterações** quando
o conteúdo seria perdido; recarregamento usa a proteção nativa do navegador.
Conflitos preservam a edição e a versão original; não existe reaplicação automática.

A sessão dura 15 minutos, com aviso dois minutos antes. Expiração ou identidade
administrativa revogada (`ADMIN_SESSION_EXPIRED`, HTTP 401) descarta dados e
segredos. Erros de permissão de uma fonte não equivalem a expiração da sessão.
Requisições de catálogo e persona têm contextos separados; logout cancela ambos.

## Ciclo de vida da persona

A visão geral permite suspender/recuperar a persona com revisão dos efeitos e
confirmação explícita. Enquanto suspensa, a navegação fica limitada à visão geral
e histórico da persona; catálogo global e criação/seleção de outras personas
continuam disponíveis. Edições pendentes são protegidas e o contexto/segredos
carregados são descartados após a transição. Recuperar não reativa publicações,
fontes suspensas, tokens ou conexões revogados. [Ciclo de vida](onboarding.md#suspensão-e-recuperação-da-persona).

## Treinamento e consultas

O fluxo privado permite cadastrar várias bases com os cinco campos técnicos,
treinar consultas e múltiplos exemplos, revisar o preview e publicar. Seletores
de consultas e concessões usam nome e revisão do snapshot publicado. Alterar
o nome do rascunho não renomeia a publicação ativa.

O catálogo dispõe de editor estruturado de tabelas/campos, tipos nativos,
classificação, chaves, grão, relações compostas/N:N, exemplos e variantes SQL.
JSON revisado de até 50 KiB permanece como importação avançada. Nenhum SQL
importado é executado. Existência de uma declaração não comprova metadados,
compatibilidade ou significado comercial. A jornada inicial de inspeção, perfis
e adoção por consultas está descrita abaixo; feedback e curadoria têm seções
próprias neste documento. Lacunas adicionais ficam no plano restante.

Na biblioteca editorial, a criação de rascunho escolhe explicitamente modelo e
exemplos adicionais com variante no dialeto selecionado. O servidor exige os
mesmos parâmetros do modelo; todos entram candidatos, sem publicação ou casos
herdados. Trocar modelo/dialeto limpa a seleção adicional. DDL conserva precisão
e escala no tipo lógico declarado. [Contrato e limites](knowledge-library.md).

## Inspeção, compatibilidade e perfis físicos

O editor de casos de consulta também permite carregar explicitamente as sementes
do dataset associado à importação do template. Confere revisão/fonte/catálogo no
servidor, apresenta a origem e preenche somente o formulário em memória. Exige
confirmação para substituir sementes existentes; erros preservam a edição.
Nome, parâmetros, resultado esperado, campos gerados e salvamento continuam sob
revisão do responsável. Não executa SQL nem aprova casos. Alcance e limites no
[contrato da biblioteca](knowledge-library.md#preparar-sementes-de-um-caso-de-consulta).

Em **Conhecimento**, selecione uma base ativa, um catálogo concedido, a versão
publicada do padrão e, opcionalmente, um perfil publicado da mesma identidade.
O conteúdo é legível por tabelas, campos, relacionamentos e regras, sem exigir JSON.
As listas usam snapshots publicados; editar um rascunho não altera os nomes ou
contratos adotados. Rascunhos físicos ficam disponíveis somente a curadores e
administradores. Paginação independente carrega mais rascunhos ou publicações.

O escopo da inspeção declara schemas, tabelas/views exatos, até 16 recursos e
quatro por página. **Preencher escopo da versão selecionada** apenas preenche o
formulário; **Inspecionar estrutura** consulta metadados fixos pelo hub/agente.
São apresentados tipos, nulabilidade, precisão/escala, chaves, cobertura, estados
de constraints e horário/validade da evidência. Ausência de metadados e estado
desconhecido não viram compatibilidade. Cada página gera uma evidência independente.

A inspeção bloqueia submissões antes de aguardar a atualização do formulário,
inclusive eventos duplicados no mesmo ciclo. Antes do envio, reconfere o escopo,
o vínculo e a permanência do painel; troca de contexto descarta a tentativa.
Bases inativas não iniciam inspeção ou composição. Essas guardas de interface
não substituem a autorização do servidor.

**Verificar compatibilidade** compara no servidor o padrão/perfil exato com a
evidência vigente. O resultado distingue compatível, incompatível e inconclusivo,
com dependência e motivo. Mudar versão, escopo, evidência ou campos utilizados
invalida a comparação local. O diagnóstico não reserva autorização nem habilita execução.

Curadores com acesso vigente à base podem criar/editar o perfil com o editor
estrutural existente, marcar substituições explícitas, salvar por CAS, revisar,
confirmar e publicar. Preview e evidência expiram; conflitos preservam a edição.
Suspensão exige confirmação explícita e bloqueia dependentes, sem apagar snapshots.
Publicar um perfil não o seleciona automaticamente nem modifica skills ou tokens.

Em **Treinamentos**, selecione padrão/perfil, tabelas e campos livres utilizados,
incluindo o grão e pares dos relacionamentos. Inspecione, compare e confirme
**Aplicar conhecimento ao rascunho**. Essa ação substitui definições estruturais
selecionadas, preserva SQL, parâmetros e exemplos e acumula regras restritivas.
Depois salve, revise os casos e publique novamente a skill. O servidor fixa hashes,
evidência e dependências comprovadas; permissões novas exigem concessão explícita.
Remover a referência afeta somente o rascunho e preserva seu conteúdo privado.

Escopo, edição do perfil e seleção pendente são protegidos na navegação, troca
de base/persona/rascunho e saída. Respostas antigas são descartadas por contexto;
não há armazenamento local nem salvamento automático. Fonte suspensa não permite
inspeção/adoção. Composição de páginas e aplicação inicial de relações reversas
e caminhos N:N estão disponíveis: conservam IDs, intermediárias e elos, sem
habilitar JOIN direto entre extremidades. Adoção em DML, enforcement SQL Anywhere
e matriz adversarial integral continuam pendentes.

## Revisão e execução de consultas

Os editores de consulta e estrutura apresentam diagrama de relacionamentos e
lista equivalente com pares de chaves, cardinalidade e caminho N:N declarado.
O diagrama limita a representação a doze tabelas e informa esse limite; a lista
mantém todos os relacionamentos. Seletores usam as referências existentes,
preservando uma referência pendente para correção, sem remapear silenciosamente.
Sugestões de exemplos duplicados normalizam espaços e caixa de palavras SQL,
preservando literais/identificadores entre aspas e separando dialetos. São
somente sugestões: não aprovam, alteram ou excluem exemplos. Variantes e revisão
semântica completas continuam dependendo da biblioteca compartilhada e dos runners.

O preview mostra comparação produzida pelo servidor entre o snapshot anterior e
o pacote exato proposto, agrupando finalidade, estrutura, relacionamentos,
exemplos, parâmetros, regras, limites, capacidades e dependências. Exibe conteúdo
anterior/proposto, revisão, casos obrigatórios e impacto transitivo nas publicações
anteriores, com até 200 metadados e total explícito. JSON permanece em detalhes.
O preview conserva hash, prazo de quinze minutos, consumo único e CAS; novas
capacidades não ampliam tokens. Comparação não aprova significado comercial.

Consultas exigem Bearer da persona, mesmo com responsável autenticado. Validação
técnica e execução são ações separadas. A paginação envia `page` e `pageSize`
juntos, com padrão de 100 e opções 25/50/100, mantendo a validação definitiva
no servidor. **Ver consultas permitidas por este token** filtra pelas publicações
concedidas e seus hashes; a execução faz nova conferência. Parâmetros distinguem
valor, texto vazio, nulo e omissão; decimais são enviados como texto. Uma página
não representa o total. Fonte, publicação, dialeto,
filtros, horário e completude acompanham o resultado. Alterar SQL, parâmetros,
consulta ou Bearer descarta o resultado e o handle anteriores. O editor publica
contratos opcionais JSON/binário e finalidades de exportação por campo; novos
tokens precisam receber as capabilities exatas. O editor binário seleciona uma
coluna cadastrada, MIME, bytes e prazo; exige projeção/exportação e justificativa
para pessoal/sensível. Modelo SQL retorna essa coluna e um registro completo.
Criar anexo JSON executa outra consulta com a página/filtros escolhidos; Criar
anexo binário não usa paginação e exige metadados positivos. Download revalida
o Bearer, sem sessão administrativa, conversão, renderização ou novo SQL de
negócio. Exibe horário, prazo, tipo e completude. O armazenamento cifrado do
servidor pode recuperar o mesmo handle após reinício, com origem/keyring iguais
e autorização vigente; o console continua sem persistir Bearer/descritor no
navegador. Não enumera arquivos, recupera segredos ou recria consultas ao recarregar.
[Contrato e limites](attachments.md).

O console executa cruzamentos já publicados, descobertos pelo Bearer via
`listar_skills` e `obter_skill`. As etapas de combinação são somente leitura;
SQL e parâmetros tipados são editáveis nas etapas locais dentro de suas
publicações. A seleção verifica publicações e hashes exatos de todas as
consultas dependentes. `validar_cruzamento` não mostra linhas nem aprova
semântica; `executar_cruzamento` pagina depois de combinar, apresenta proveniência,
horários e total somente quando o servidor comprova completude. Falha/recusa
remove resultados anteriores; não se torna resultado vazio. Alterar SQL,
parâmetros, página/tamanho ou Bearer invalida resultados. Mudança de Bearer
preserva a edição local, mas exige nova autorização antes de executar. Navegação,
troca de cruzamento e atualização da descoberta protegem a edição pendente.
O editor de treinamento, casos, relatórios e publicação está descrito em
[Editor de skills de cruzamento](#editor-de-skills-de-cruzamento).

## Revisão de alteração de bases e erros

Editores de operação SQL e cruzamento associam as referências `name` e `slug`
da recusa ao respectivo campo, com descrição acessível e foco após liberar o
bloqueio de envio. `training` aponta para aviso da seção, sem atribuir a recusa
a um campo interno não informado. Referências desconhecidas usam o resumo.
O conteúdo local é preservado; corrigir o formulário não altera a publicação ativa.
O editor externo aplica o mesmo comportamento a `name`, `slug` e `contract`.
A API inclui somente o nome público `contract` na lista de campos recusados,
sem serializar seu conteúdo ou caminhos internos. A recusa genérica foca o resumo.

Antes de salvar metadados/recortes ou verificar e trocar credenciais, o console
consulta `GET /api/admin/personas/:personaId/fontes/:sourceId/impacto?expectedVersion=<n>`.
Exige responsável vigente, fonte da persona e versão atual. A resposta contém
`sourceVersion`, `total` e até 200 metadados de publicações afetadas, incluindo
dependências transitivas e versões anteriores. Nome vem do snapshot, nunca do
rascunho; não são selecionados SQL, credenciais ou resultados. Quando há mais
itens, a interface informa explicitamente a listagem parcial e o total.

A pessoa revisa a lista e confirma a alteração. É uma fotografia informativa:
publicações concorrentes também serão suspensas no salvamento; a consulta não
concede aprovação, não reserva a versão e não substitui CAS/revalidação. Editar
o conteúdo após a revisão exige nova conferência. Não há reassociação automática.
O mapa de impacto de versões compartilhadas permite leitura autorizada por
padrão/perfil e recurso, conforme descrito no início deste documento. Não expõe
personas de outros responsáveis nem reserva autorização de execução.

Cada vínculo também permite revisar suspensão, recuperação e substituição.
Recuperação confirma a mesma identidade pelo hub/agente, com credenciais
cadastradas ou novas credenciais preenchidas no navegador. Publicações continuam
suspensas. Substituição abre cadastro independente, exige os cinco campos
técnicos e confirmação própria; o vínculo anterior fica histórico e não pode
ser reativado. Não transfere treinamento nem concessões. Segredos são limpos
após tentativa, resultados/previews anteriores são descartados e edição/revisão
pendente é protegida na navegação. **Recarregar vínculo** permite tratar conflitos
sem atualizar silenciosamente a versão em edição.
[Contrato](onboarding.md#suspensão-recuperação-e-substituição-de-fontes).

Erros HTTP de validação incluem `fields` com nomes públicos de campos de primeiro
nível ou dos objetos fixos `source`/`credentials`. Nunca incluem valores,
mensagens Zod, SQL ou nomes arbitrários de records.
O cadastro de persona/base aponta os campos, usa `aria-invalid`/descrições e foca
o primeiro campo indicado. Erros sem referência de campo focam o resumo. As
credenciais são descartadas após a tentativa. Outros editores ainda precisam de
referências de erro por campo mais específicas. O limite de login mantém dez
tentativas por minuto/origem de rede; HTTP 429 informa `Retry-After` e uma
mensagem segura. O console não reenvia credenciais automaticamente.

## Tokens

Falhas de rede ou respostas ilegíveis após POST/alteração são apresentadas como
resultado não confirmado. O console orienta conferir listagem ou identificador,
sem recomendar reenvio automático e sem afirmar sucesso, rollback ou estado
terminal da operação. Isso também vale para POST MCP. Leituras GET podem ser
repetidas explicitamente; respostas de contexto descartado não são aplicadas.

Novas emissões sugerem 30 dias; ausência de expiração exige escolha explícita.
Tokens existentes conservam sua validade. Bearer aparece somente na emissão ou
rotação, com cópia e revelação por até 30 segundos; não há recuperação posterior.
O responsável pode listar metadados, editar nome/validade/concessões de consultas, cruzamentos, operações SQL e capacidades externas,
rotacionar e revogar. Conflito preserva campos; recarregar a edição é explícito.
Emissão e editor permitem selecionar as cinco permissões administrativas,
inclusive sem consulta publicada. A emissão permite escolher fontes para
administração e um teto de delegação igual às concessões selecionadas, somente
por opção explícita. Integrações possuem jornadas próprias de cadastro, gestão e
contratos; a permissão administrativa não concede execução. Selecionar uma skill
externa concede explicitamente suas capabilities e o ID exato da operação
publicada, sem efeitos SQL. Ações novas começam com aprovação adicional;
consultas externas continuam sem aprovação adicional. O editor permite retirar
a operação separadamente: executar exige tanto a skill quanto a operação.
Permissões externas e limites preexistentes são preservados.

Operações SQL exigem seleção explícita da publicação e da fonte. Emissão e
edição usam os efeitos do contrato publicado, incluindo SELECT auxiliar quando
necessário, e as capabilities exatas. Novas concessões SQL começam exigindo
aprovação adicional; a política humana da skill nunca pode ser dispensada pelo
token. Publicações suspensas ou incompletas não podem ser adicionadas.
Essa seleção não prepara, aprova nem executa lançamentos e não amplia tokens
existentes. Nomes e revisões apresentados são os do snapshot publicado.

Rotação substitui o hash atomicamente e invalida o valor anterior, sem sobreposição.
Emissão sem confirmação bloqueia o formulário da persona durante a sessão.
Exige leitura explícita da lista e confirmação de nova emissão, que limpa nome
e concessões selecionadas. A lista não correlaciona automaticamente tentativas:
o responsável confere os cadastros e revoga eventual token cujo segredo se perdeu.
Não há reenvio automático, recuperação de Bearer ou promessa de idempotência.
O controle é somente em memória e é descartado no encerramento da sessão.
Se a confirmação de uma mutação do token se perder, salvar, rotacionar e revogar
ficam bloqueados até a ação explícita de conferir estado concluir sua leitura.
A edição local permanece disponível para comparação até descarte confirmado;
falha de leitura mantém o bloqueio. O Bearer exibido é limpo e o segredo de uma
rotação concluída não pode ser recuperado. A leitura não repete a mutação.
Qualquer edição invalida conservadoramente concessões OAuth derivadas anteriores.
Não há propagação de ampliações de permissão. Recursos novos precisam de seleção
explícita. Emitir token com cruzamento exige selecionar também cada consulta
dependente na versão exigida; não há seleção automática. Na edição de token,
fontes e consultas dependentes também são concessões independentes. O servidor
recusa uso de cruzamentos com qualquer dependência não concedida. A integração
OAuth v2 está disponível opcionalmente na composição de desenvolvimento.
Tokens e conexões mostram a disponibilidade autenticada e copiam o endereço
OAuth sem token. Consentimento ocorre em formulário protegido com seleção
explícita. A área também cria, renova e revoga a delegação do responsável no hub
com confirmação e CAS. Exibe estado local/prazo, sem prometer autoridade remota.
Teto da delegação exige seleção explícita; edição pendente protege navegação,
troca de persona e saída. Permissões do token/consentimento são independentes;
renovar não amplia concessões antigas.

**Conferir estado da delegação** faz somente leitura explícita. Falha inicial
permite nova leitura; erro ou confirmação perdida de uma mutação bloqueia
criar/renovar/revogar até a conferência bem-sucedida. A seleção local é preservada;
substituí-la pelo estado recebido exige confirmar o descarte quando houver edição.
Durante a leitura/mutação, controles e troca de contexto ficam bloqueados. Erros
têm resumo com foco; sucesso é anunciado separadamente. Não há retry automático
do POST, e conferir estado local não reserva autoridade remota. A nova ação usa
a versão recebida e continua sujeita ao CAS/revalidação do servidor.
`gerenciar_fontes` e consentimento permitem iniciar setups temporários de cadastro
e rotação de credenciais pelo plugin. O responsável autentica novamente e informa
segredos somente no navegador. Setups de tokens e integrações também estão
implementados; manutenção e homologação restantes constam do plano.
[Contrato](oauth.md#delegação-administrativa-e-setups-temporários).

Rotas com sessão Client, Host/Origin e CSRF, sob `/api/admin/personas/:personaId`:

| Método | Sufixo                        | Contrato                                                            |
| ------ | ----------------------------- | ------------------------------------------------------------------- |
| GET    | `/tokens`                     | Metadados e concessões; nunca hash nem Bearer                       |
| POST   | `/tokens/:tokenId/editar`     | `expectedVersion`, `name`, `expiresAt`, `permissions`, `delegation` |
| POST   | `/tokens/:tokenId/rotacionar` | Mesma entrada; entrega novo Bearer uma vez                          |
| POST   | `/tokens/:tokenId/revogar`    | Revoga token e derivados                                            |

CAS e locks de persona/token protegem mutações. Delegação deve caber nas próprias
permissões e referências devem pertencer à persona.

## Conexão e diagnóstico do consumidor

**Testar conexão** usa o Bearer informado somente em memória: lê o contexto,
confere a persona selecionada, chama `diagnosticar_permissoes`, descobre fontes
concedidas e capacidades. Divergência de persona interrompe a descoberta. O teste
não executa SQL de negócio nem operações. Mudança de token/persona e desmontagem
descartam respostas antigas. Instruções copiadas contêm endereço/transporte,
nunca o Bearer.

O diagnóstico usa o mesmo serviço de visibilidade/autorização das consultas e
operações. Mostra nome/revisão somente quando o pacote e as dependências estão
autorizados; concessão bloqueada recebe motivo genérico seguro, sem revelar
recursos ausentes da visibilidade. Token inválido, expirado ou revogado é recusado.
Horário, versão, validade, capacidades, aprovação e limites de cruzamento são
apresentados. O diagnóstico local não verifica JWT Client, vínculo, policy nem
conectividade remota, e não reserva autorização.

**Verificar acesso à fonte** chama explicitamente `verificar_fonte`, somente com
metadados pelo hub/agente. A resposta precisa confirmar fonte/dialeto exatos e
indicadores de verificação somente por metadados. Resposta divergente não recebe
confirmação positiva. Cada skill mostra quantas fontes concedidas foram verificadas
nesta sessão, sem comprovar recursos da skill ou SQL. Limites efetivos retornados
pelo servidor são exibidos com rótulos e valores, sem recalcular concessões.
Nova tentativa descarta a confirmação anterior; troca de contexto limpa tudo.
Não valida SQL. Conexão autenticada, fonte verificada,
SQL validado e consulta executada são estados distintos. Execução e entrega
continuam revalidando autorização. Diagnóstico detalhado por portão e limites
das capacidades ainda não incluídas no diagnóstico precisam ser concluídos.

## Histórico administrativo

`GET /api/admin/personas/:personaId/progresso` retorna as oito etapas, horário,
motivo, ação e indicação de disponibilidade remota não verificada.
`GET /api/admin/personas/:personaId/historico` retorna até cinquenta eventos e
`nextCursor { at, id }`, em ordem decrescente de horário/identificador.
Filtros opcionais: `from`, `to` (ISO com fuso), `event` e `resourceId` (UUID).
Paginação exige `afterAt` e `afterId` juntos; deve manter os mesmos filtros.
O cursor conserva a precisão temporal do PostgreSQL, inclusive microssegundos.
Na interface, as datas do filtro são explicitamente UTC.

Ambas as rotas exigem responsável vigente, sessão, CSRF e Host/Origin usuais.
Eventos mostram somente IDs autorizados do autor/recurso, ação, resultado,
horário e versões registradas. Ausência de eventos/autoria/versões anteriores
não é reconstruída por suposição. Catálogos não são consultados por esse histórico.
Eventos de mutação são gravados na transação correspondente. Mutações
administrativas usam identidade transaction-local do responsável verificado;
eventos automáticos sem autor permanecem sem autoria. SQL, perguntas, parâmetros,
resultados, credenciais e formulários não fazem parte da auditoria.

A migration aditiva `0008_console_history.sql` acrescenta versões opcionais,
índice cronológico e origem transaction-local do responsável. Não altera migrations
anteriores nem promove/importa dados legados. Adoções de conhecimento só terão
eventos quando o fluxo executável for implementado; não existem eventos fabricados.

## Revisão de operações

O responsável pode listar preparações, filtrar os itens carregados por estado,
revisar conteúdo cifrado autorizado e aprovar as etapas/parâmetros exatos antes
da validade. A confirmação da tela não executa o lançamento. A aprovação envia
somente ID e fingerprint ao serviço existente, que revalida responsável, token,
publicação, fonte, conteúdo e prazo. Comprovante e conciliação são mostrados
separadamente; resultado desconhecido nunca oferece reexecução automática.

`GET /operations` devolve até 50 resumos e `nextCursor`; `?after=<UUID>` carrega
a próxima página por ordem estável de identidade, sem prometer ordem cronológica.
A listagem não decifra payloads. `GET /operations/:operationId` exige o responsável
e retorna o conteúdo para revisão; `POST /operations/approve` registra aprovação.
Essas rotas usam o mesmo prefixo, sessão, Origin e CSRF das rotas de tokens.

Preparação SQL nova continua nas tools MCP do consumidor. Ações externas têm
formulário de preparação pelo token, descrito abaixo. Execução, consulta ao
journal, cancelamento e conciliação de preparações existentes têm controles
próprios na [jornada do consumidor](#ações-do-consumidor-em-preparações-existentes),
com Bearer e confirmação separados da aprovação. Editores de consulta,
cruzamento, operação SQL e skill externa estão disponíveis em desenvolvimento;
suspensão/recuperação e rotação de integrações também estão disponíveis. Cadastro
direto de integrações também está entregue. Criação estruturada de preparações
SQL e aceite operacional integral ainda faltam.

### Preparar ação externa pelo consumidor

Em Integrações, informar Bearer apenas em memória e carregar as ações concedidas.
O console confirma a persona antes da descoberta/preparação. Nome, efeito e campos
vêm da publicação concedida, sem reutilizar rascunho administrativo. Campos opcionais
podem ser omitidos; booleanos e números seguem o contrato. Decimais exatos exigem
campo de texto treinado, sem conversão presumida.

A confirmação cria somente a preparação, com `expectedPublicationId`. O servidor
confere essa versão na transação e recusa mudança concorrente. Não aprova ou envia
ao provedor; execução continua no painel separado e aprovação na sessão Client.
Duplo clique/perda de confirmação não reenviam a tentativa. Conferir a lista
administrativa antes de iniciar outra preparação. Troca de token/persona descarta
campos, resultado e respostas atrasadas; navegação protege edição em memória.

## Exploração do conhecimento concedido

A área Conhecimento oferece busca lexical e grafo através das tools MCP do
consumidor. Usa o Bearer informado em Tokens e conexões, confirma a persona e
descobre apenas skills concedidas. Sessão administrativa não substitui esse token.
O Bearer permanece somente em memória ao navegar entre Tokens, Consultas e
Conhecimento da mesma persona; sai da memória nas demais áreas, troca de persona,
logout ou expiração. Nenhum material de conexão incorpora o segredo.

Busca apresenta referências/origem e distingue correspondência lexical de
cobertura semântica. Grafo tem lista acessível e diagrama após paginação completa;
não infere caminhos, resultados ou autoridade de execução. Mudança de termo,
skill, token ou persona limpa a apresentação aplicável e descarta respostas antigas.
Não há salvamento de perguntas nem execução SQL por esses controles.

## Curadoria de propostas

Biblioteca editorial do catálogo permite importar template/dataset JSON, salvar
versões por CAS, consultar histórico exato e criar rascunho de consulta com
persona/base/variante explícitas. DDL pode ser carregado como arquivo UTF-8 ou
texto; interpretação não executa nem salva. Aplicar a novo padrão protege edição
pendente e exige revisão posterior. [Contrato e limites](knowledge-library.md).

Ao abrir uma versão salva de template, **Criar dataset com formulário** permite
selecionar tabelas/campos livres, informar proveniência e editar linhas tipadas.
A versão de origem é fixa; decimais conservam texto, vazio e nulo são distintos.
Erros preservam edição e mudanças pendentes entram na proteção de navegação.
Texto respeita comprimento lógico declarado; arquivo DDL com UTF-8 inválido é
recusado antes do envio. JSON permanece como opção avançada e para novas versões.

No catálogo compartilhado, colaborador envia regra, exemplo, tabela/campos ou
relacionamento pelo formulário e acompanha somente sua autoria. Propostas de
estrutura carregam uma versão publicada e reutilizam seus editores; o envio exige
selecionar uma única definição. As outras edições locais não entram na proposta.
Trocar a versão exige carregamento explícito, com descarte confirmado se houver
edição estrutural pendente. Curadores/administradores revisam as propostas também
enviadas pelo MCP. A tela apresenta origem,
versão, pares/cardinalidade, SQL/parâmetros e proveniência sem executar conteúdo.
Revisão mostra o conteúdo resultante e diff do servidor, prazo, justificativa e
confirmação explícita. Incorporação atualiza apenas o rascunho CAS; publicação é
outra ação e exemplos novos permanecem candidatos. Edição pendente impede revisão
do padrão até salvar/descartar, e troca de catálogo protege a proposta em memória.
Dados e respostas tardias são descartados ao encerrar contexto/sessão.

Relacionamentos de negócio não recebem nome/estado de constraint física. Ao
trocar a origem para negócio, essas declarações são removidas. Origem banco
oferece nome e estado declarados, inicialmente desconhecido; não constitui prova
técnica e não habilita dependências sem inspeção autorizada.

Exemplos privados também têm estado editorial: novos começam candidatos;
publicar exige revisão explícita. Exemplos antigos sem estado mantêm seu contrato.
[Autoridade e contratos](shared-knowledge.md#curadoria-e-ferramentas-mcp).

A fonte com perfil publicado selecionado oferece **Curadoria de particularidades
físicas**. Regra, exemplo, tabela e relacionamento reutilizam os mesmos editores;
tabelas/relacionamentos permitem substituição comum explícita. A fila mostra
proveniência, identidade e versões. O servidor determina quem pode revisar;
colaborador acompanha só sua autoria. Preview, justificativa e confirmação
incorporam apenas ao rascunho; publicação/adoção continuam separadas. Exemplos
novos permanecem candidatos e impedem publicar enquanto não forem revisados.
Trocar fonte/perfil protege edição e descarta respostas antigas. Um conflito
pode ser rejeitado por versão sem aplicar seu conteúdo. Não é necessário JSON
para enviar os quatro tipos de proposta.
[Contrato físico](shared-knowledge.md#curadoria-de-particularidades-físicas).

## Feedback e calendário

Itens encontrados pelo consumidor oferecem feedback de erro, correção ou lacuna.
Texto fica só em memória até envio explícito; mudança de contexto protege edição.
Fila administrativa mostra origem/estado/conteúdo; encerrar não corrige treinamento.
Encaminhamento usa ID de proposta existente da mesma origem, sem criar/incorporar.

Versões do catálogo, perfil físico selecionado e skills publicadas oferecem
calendário. Formulário inicia sem data: curador/responsável escolhe próximo prazo
e justificativa. Revisão realizada é distinta de configurar prazo. Histórico é
paginado; conflito preserva edição para recarregamento explícito. Consumidor
consulta avisos das dependências concedidas. Vencimento não recusa execução.
[Contrato](shared-knowledge.md#feedback-e-revisão-temporal).

Publicação de padrão, perfil e skill pede **Prazo de revisão da publicação**,
inicialmente vazio. A prévia mostra a data exata; mudar o campo descarta a
confirmação local, e servidor recusa prévia com plano alterado. Publicação nova
recebe calendário na mesma transação. Delegado utiliza prazo escolhido antes pelo
responsável para a revisão atual. Calendários mostram notificações internas do
worker; marcar como lida não conclui revisão. Campos pendentes são protegidos ao
recarregar ou trocar contexto. [Worker e limites](review-worker.md).

## Identidade oficial e empacotamento

Origem: `D:\Developer\Data7\Expedicao\Icon Kitchen\web`. Os seis arquivos já
existentes em `web/public` são reutilizados, sem transformação. Correspondência:

| Arquivo original e local | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `favicon.ico`            | `ad5bbd023e36914b5484d47149c7e559be3eb628b3d175cb17b9ede1485f505e` |
| `apple-touch-icon.png`   | `15d560ca2b1288154f559bfaedbfbe5e12843e01ddc97615a037fd75edf4fedc` |
| `icon-192.png`           | `1ddb5242b7134d1113e80c713a0e6e1afe40613ddfa2e500d3cde12ce9243516` |
| `icon-512.png`           | `ca1293cfe8322f95d4617020a610c5197cce0accb55fb4161a9a8ffff45009ae` |
| `icon-192-maskable.png`  | `ac0c6232aed4ebd13891d7eb7e75ff7e124a3e119a7975a06f011b2e35e3024e` |
| `icon-512-maskable.png`  | `20d7e43e4a2314d6b72fe4a3b35752b3911c6c42674d00a40e7788a5e9480488` |

O símbolo normal é exibido com proporção preservada junto a **Se7e — Personas**,
com `alt=""` para evitar leitura duplicada. Maskable só é referenciado no
manifesto. `persona-v2.html` referencia favicon, Apple Touch Icon e o manifesto
próprio `persona-v2.webmanifest`, com início/escopo `/app/`. O manifesto legado
permanece intacto. Android/iOS e SVGs alternativos não são incorporados.

A API publica somente as sete rotas estáticas explícitas dos ícones/manifesto,
além dos bundles em `/app/assets`. Não expõe o diretório inteiro de distribuição.
Vite copia os arquivos para `web/dist`, que o Dockerfile já empacota. Build e
runtime não dependem da pasta externa. Não há service worker nem cache offline.
Os assets foram verificados na [imagem candidata local](validation/2026-10-19-candidate-distribution.md).
O aceite da distribuição final continua pendente.

## Editores de limites

O [setup de emissão limitada](oauth.md#setup-de-emissão-com-concessões-limitadas)
apresenta proposta fixa em listas: nome, prazo, fontes, skills, capacidades,
comandos, aprovação, limites e teto de delegação. Não aceita editar concessões
no POST; mudança exige outro link. Login/confirmação emitem o token uma vez,
sem invalidar o originador. O Bearer não é recuperável por GET ou MCP.

O [setup temporário de rotação do próprio token](oauth.md#setup-de-rotação-do-próprio-token)
usa formulário independente com reautenticação e confirmação explícita. O novo
Bearer é mostrado uma vez, mascarado, com cópia/revelação temporária e descarte;
resposta perdida exige rotação no console, sem recuperação pelo link consumido.

O [percurso Chromium pela cadeia persistente](validation/2026-10-15-hub-pin-real-console.md)
validou criação de persona, três bases, treinamento privado, publicação, token,
conexão e consultas PostgreSQL/SQL Server/SQL Anywhere, incluindo vazio e recusa
de escrita na consulta. Usa hub/autoridade e agentes reais de fixture em loopback;
não substitui HTTPS público, instalação do cliente ou acessibilidade integral.

O formulário de consulta publica limites opcionais. Emissão e gestão de tokens
oferecem tetos globais, por concessão e da delegação. Ativar o editor não preenche
defaults; campo em branco conserva o teto precedente. São aceitos somente inteiros
positivos dentro do máximo da plataforma. Edição fica protegida em memória e
limpa após descarte, troca de contexto ou emissão. Resultados mostram o orçamento
efetivo. O diagnóstico não reserva esses limites: o servidor revalida em cada
execução. [Contrato](source-queries.md#limites-redutíveis).

Os [setups de credenciais de integrações](oauth.md#setup-de-credenciais-de-integrações)
oferecem cadastro REST/MCP HTTP e rotação de Bearer, API key em header ou Basic.
O formulário independente reautentica o responsável, exige confirmação e descarta
segredos; rotação mostra destino/tipo/versão fixados. Resposta contém somente
ID/versão. Não testa conexão nem habilita operações. O painel
[Gerenciar integrações](external-integrations.md#gestão-de-integrações-no-console)
permite cadastro direto REST/MCP com reautenticação e confirmação do responsável,
sem operações ativas. Mostra o cadastro criado e conserva UUID da tentativa para
conferir confirmação perdida, sem recuperar credenciais ou repetir envio.
Lista estado/versões/impacto e permite suspensão, recuperação sem reativação e
rotação direta com reautenticação do responsável. Protege edição, limpa segredos
após tentativa e exige recarregar o impacto após erro/confirmação perdida.
Homologação de provedores reais continua pendente.

Em **Integrações**, o painel de ações externas lista preparações por cursor,
mostra parâmetros, efeitos, conciliação e validade e exige confirmação humana
antes da aprovação do fingerprint exato. Aprovar não executa nem amplia o token.
Estado desconhecido orienta investigação sem oferecer reenvio.
O detalhe apresenta a última evidência de conciliação registrada, seu horário e
classificação, sem alterar o comprovante ou permitir retry. A leitura externa
continua exigindo o token do consumidor; sessão Client não a substitui.
Expiração, clique duplo, troca de contexto e respostas atrasadas usam os controles comuns.
Operações SQL e externas mostram datas de remoção por retenção, mantendo o estado
e a identificação. O detalhe externo funciona com contrato/input/limites nulos
após expiração do payload. Ausência de conteúdo não significa rollback, resultado
vazio ou permissão para repetir. [Contrato](review-worker.md#retenção-de-operações).
Casos e relatórios externos possuem painel próprio com campos tipados,
obrigatoriedade, edição/remoção por versão, proteção de edição e histórico paginado.
Relatório obsoleto não libera publicação. Rodadas são executadas somente pelo
CLI do operador em fixture isolada; não há disparo de ações por esse painel.
Contrato externo tem editor em Treinamentos. A gestão inclui suspensão,
recuperação, rotação e cadastro direto pelo responsável; setups de consumidores
mantêm consentimento/delegação. A execução do
consumidor em preparações existentes está disponível conforme a jornada abaixo.
[Contrato de ações](external-integrations.md#preparação-e-aprovação-de-ações).

## Ações do consumidor em preparações existentes

Em Operações SQL e Integrações → Ações externas, selecionar uma preparação abre
o painel **Usar o token do consumidor**. O Bearer é preenchido somente no navegador
e fica na memória da sessão; não entra em URLs, armazenamento local ou cookies.
A revisão/aprovação administrativa continua separada e nunca executa uma ação.

**Verificar estado com este token** confere a persona e consulta o journal pelas
tools existentes. A sessão Client não substitui o token solicitante. A resposta
precisa corresponder ao ID/fingerprint exatos; nome, SQL, parâmetros e outros
campos da revisão não são enviados às tools de referência. Nenhuma preparação
nova ou publicação é criada implicitamente. Alterar token ou seleção descarta
estado/comprovante anteriores; respostas atrasadas são ignoradas.

- **Executar conteúdo preparado** exige estado vigente, aprovação aplicável,
  validade e confirmação explícita separada. Antes do envio, confere novamente
  persona/estado; o servidor revalida toda a autoridade. Clique duplo é bloqueado.
  Uma tentativa enviada fica marcada nesta tela, inclusive se a resposta se perder;
  a interface oferece acompanhamento, sem retry automático ou botão de reenvio.
- **Solicitar cancelamento** exige confirmação própria. SQL em execução pode
  registrar solicitação, sem provar rollback; ação externa só permite cancelar
  antes do envio. Estado terminal/incerto não vira preparação executável.
- **Consultar conciliação treinada** exige resultado desconhecido; o servidor
  ainda pode recusar se não houver procedimento publicado ou permissão. SQL usa
  seu contrato de marcador; externo registra evidência separada e relê o estado.
  Não altera receipt nem autoriza repetir efeitos.

Comprovante/evidência e resposta externa são texto escapado, sem HTML executável.
Remoção por retenção continua distinta de resultado vazio/rollback. Confirmações
pendentes protegem troca de seleção, navegação, persona e logout. Campos/ações
ficam bloqueados durante a requisição; falhas focam o resumo acessível. Preparações
SQL e externas possuem formulários próprios, descritos ao final deste documento.
O editor de skills
externas está descrito em [Editor de skills externas](#editor-de-skills-externas).
A [rodada de UI](validation/2026-10-17-console-consumer-operations.md) não certifica
efeitos reais ou a cadeia dos três motores. HTTPS/ChatGPT permanecem manuais.

## Editor de skills de operação SQL

Treinamentos inclui **Treinar operações SQL**, separado do editor de consultas.
O formulário cria/edita o rascunho com fonte/dialeto, finalidade, parâmetros
tipados, tabelas/colunas, identidade, concorrência, chaves únicas, etapas ordenadas,
bindings de parâmetros/saídas anteriores, limites, filtros adaptáveis, aprovação,
efeitos indiretos e marcador de conciliação. Aprovação humana é a seleção inicial.
Relacionamentos são editados visualmente com seletores físicos de tabelas/campos,
pares ordenados de chaves, cardinalidade, significado e associação inner/left.
N:N conserva IDs, intermediárias e elos diretos ordenados; mover/remover não
reescreve referências antigas. O diagrama tem alternativa equivalente em lista.
A declaração não comprova FK/UNICIDADE nem habilita JOIN ou escrita no lançamento.
JSON validado permanece como alternativa avançada.
Nada é convertido automaticamente entre motores ou reordenado por inferência.

**Conhecimento compartilhado desta operação** reutiliza seleção autorizada,
inspeção e comparação de padrão/perfil físico. Escolha tabelas/campos já declarados
no contrato; cadastre recursos faltantes antes de adotar. A aplicação exige prova
vigente da mesma fonte, compatibilidade e confirmação explícita. Atualiza
significados, grão, regras e relacionamentos; preserva tipos, identidade,
concorrência, chaves únicas, parâmetros, etapas, limites, aprovação e escrita.
Campos não livres, tipos incompatíveis e caminhos N:N incompletos são recusados.
PK/FK/UNIQUE e dependências exatas continuam sob validação do servidor ao publicar.

Selecionar versão não a adota; aplicar altera somente o rascunho. Remover o vínculo
mantém conteúdo privado e publicação ativa. Trocar fonte com vínculo/seleção
pendente exige confirmação, descarta seleção/inspeção e remove a referência apenas
do rascunho, sem reassociar perfil físico. Relatórios ficam obsoletos após salvar
alterações relevantes; novas versões exigem revisão, testes e republicação.
O seletor adia a leitura inicial se abrir durante outra requisição, descarta
respostas antigas e não escolhe/adota uma versão nova automaticamente.

Casos usam parâmetros, sementes e estado final sintéticos com tipos explícitos,
ou recusa de plano/condição/falha nativa. Inteiros e decimais permanecem strings;
nulo é explícito. Alterações/remoções usam a revisão CAS da skill e invalidam
relatórios/prévias anteriores, preservando o snapshot ativo. Conflito conserva
a edição local; recarregar exige descarte explícito. O responsável pode fechar
a edição de um caso sem salvar. Nenhum botão executa os casos ou aprova relatórios.

Relatórios paginados apresentam runner, horário, revisão, hashes e resultado por
caso; só conteúdo/revisão/dependências atuais podem atender à publicação. O
operador executa o runner em fixture dedicada, fora do navegador. Resultado
técnico aprovado não aprova o significado de negócio.

Com relatório obrigatório atual, escolha prazo futuro de revisão, gere a prévia
do servidor, confira diferenças/impacto e confirme a revisão semântica para
publicar. Prévia mantém validade de 15 minutos, hash e consumo único; o servidor
revalida tudo no commit. A publicação não amplia tokens nem aprova ou executa
lançamentos. Alterar rascunho/casos não muda nome, revisão ou contrato ativo.
A comparação destaca mudanças na ordem das etapas, mesmo quando mantêm os mesmos
IDs e conteúdo; a ordem de execução tem significado diferente de uma lista de tabelas.
Edição, confirmações e dados dos casos ficam somente em memória e são protegidos
ao navegar, trocar persona ou sair. HTTPS e ChatGPT continuam manuais.

## Conexões OAuth

Consultas elegíveis com cache/singleflight sinalizam leitura reutilizada, mantendo
o horário original e a completude. A permissão é revalidada; o aviso não afirma
que os dados permaneceram iguais. [Contrato do cache](query-cache.md).

Tokens e conexões inclui carregamento paginado dos consentimentos da persona,
estado local e revogação específica com revisão do conteúdo/hash. Não recupera
segredos ou testa o ChatGPT; confirmações pendentes são protegidas ao navegar.
Revogar não afeta o token originador/outras conexões ou desfaz operações.
Datas históricas não registradas aparecem como tal. [Contrato](oauth.md#gestão-administrativa-das-conexões).

Conflito de edição de uma base apresenta a recusa imediatamente, sem recarregar
o contexto em segundo plano. Campos pendentes ficam preservados; o responsável
decide quando recarregar e descartar a edição.

## Notificações externas

Operações inclui configuração explícita pelo responsável, seleção de eventos,
destino HTTPS e segredo próprio preenchidos no navegador. Exige confirmação/CAS,
protege edição, foca erro e descarta segredo após tentativa ou troca de contexto.
Lista metadados de entregas com paginação, sem corpo, endereço ou segredo.
Alterar cancela pendências anteriores; suspender persona desativa envios sem
reativação na recuperação. Não envia teste, executa SQL ou repete operações.
[Assinatura, orçamento e retomada](outbox.md).

## Editor de skills de cruzamento

Em **Treinamentos → Treinar cruzamentos**, o responsável cria ou seleciona um
rascunho. As consultas locais são escolhidas pelo nome e revisão do **snapshot
publicado**, fonte e dialeto. Uma edição posterior do nome da consulta não muda
essa identificação. Dependências indisponíveis permanecem visíveis como referência
pendente, sem substituição automática.

O contrato inclui finalidade, correspondência, normalização, ausência,
duplicidades/grão, unidades, moedas e calendário. Etapas ordenadas têm consultas
locais, INNER/LEFT com pares compostos e cardinalidade, união, projeção,
agregação e ordenação. Campos/etapas anteriores alimentam os seletores. Remover,
renomear ou mover não repara referências silenciosamente; o servidor verifica o
grafo inteiro. A saída e os limites redutíveis são explícitos. Mantêm-se os tetos
de quatro fontes, oito etapas e os demais limites do [contrato](federation.md).

Salvar usa CAS. Conflitos conservam a edição local. Alterações pendentes protegem
navegação, contexto e saída; prévias são invalidadas pela edição. JSON é somente
alternativa avançada, com o mesmo schema estrito utilizado pelo servidor.

Casos têm nome, obrigatoriedade, SQL/ parâmetros locais e resultado esperado:

- **SQL pelo transporte:** sementes por fonte/tabela e valores tipados, projeções,
  ordem e total esperados. O operador escolhe fixtures separadas das fontes reais.
- **Combinação sintética:** projeções/linhas por etapa, truncamento explícito e
  resultado ou erro esperado. Não comprova SELECT real ou os três motores.

Inteiros/decimais tipados preservam texto exato; nulo e vazio são distintos.
Exemplos não são capturados de consultas executadas. Casos antigos conservam seu
formato e plano. Refazer plano/entradas exige confirmação explícita e descarta os
valores locais; não converte formatos ou herda aprovação. Editar/remover usa a
revisão do rascunho e invalida relatórios/prévias aplicáveis.

Relatórios são paginados e somente leitura, com revisão, hashes, runner, horário
e resultado por caso. Console não dispara runner, injeta evidência nem aprova
relatórios. Publicação exige casos obrigatórios aprovados para revisão, conteúdo
e dependências atuais, prazo futuro escolhido pelo responsável, comparação do
servidor e confirmação humana do hash dentro dos quinze minutos da prévia.

Editar após publicar preserva ID, nome, revisão e conteúdo do snapshot ativo.
Publicar não executa o cruzamento nem concede fontes/skills aos tokens. Para
consultar, o consumidor precisa da skill de cruzamento, cada consulta/base
dependente e suas capacidades vigentes. A [evidência de desenvolvimento](validation/2026-10-17-console-federation-editor.md)
é parcial; HTTPS e ChatGPT são manuais, e deploy continua bloqueado.

## Editor de skills externas

O editor inclui [descoberta MCP e importação OpenAPI](external-integrations.md#descoberta-mcp-e-importação-openapi).
Escolha a integração, envie JSON ou solicite tools/list e selecione uma operação.
Aplicar prepara somente o formulário; salvar continua explícito. Operações fora
da gramática exibem impedimento, sem conversão de schemas. Propostas MCP exigem
revisão de efeitos/conciliação e começam com aprovação humana; descrições são
texto escapado, sem autoridade. Destino e credencial não vêm do arquivo.

O editor em **Treinamentos** não exige bases SQL. Oferece contrato REST/MCP,
campos tipados, efeitos, aprovação e conciliação por leitura treinada. Seleciona
conexão já cadastrada no navegador sem recuperar credenciais. Salvar não envia ações; descoberta explícita usa somente metadados MCP.
Schemas propostos localmente precisam corresponder ao remoto e não comprovam
suas capacidades. Edições e JSON avançado ficam somente na memória.

Antes da publicação, rascunho é editável por CAS. Casos e relatórios são os mesmos
do painel de Integrações, reutilizados na skill selecionada. Não é possível
executar ou aprovar testes pelo console. Mudança de contrato enquanto se lê
relatórios conserva o CAS anterior e exige recarregar explicitamente.

Prévia é produzida pelo servidor, com campos, destino, versão, efeitos, aprovação,
conciliação, casos e capacidades. Exige relatório atual, prazo humano e
confirmação do conteúdo exato. Publicação não aprova ações nem amplia tokens.
Contrato publicado fica somente leitura; outra versão exige nova skill/operação.
A cópia explícita não herda testes, publicação, concessões ou aprovações; ações
começam novamente com aprovação humana.

Confirmações e campos pendentes protegem navegação, contexto e saída. Erro ou
conflito mantém edição e foco no resumo acessível. Ações ficam bloqueadas durante
a requisição; respostas de contexto anterior são descartadas. Layout móvel mantém
rolagem horizontal restrita aos detalhes técnicos. [Contrato](external-integrations.md#editor-de-skills-externas)
e [evidência parcial](validation/2026-10-17-console-external-editor.md).
HTTPS/ChatGPT manuais e deploy bloqueado.

### Preparar operação SQL pelo consumidor

O console oferece formulário a partir de `listar_skills` e `obter_skill`, com
Bearer da persona. A listagem e a leitura devem conservar ID, publicação e hash;
mudança durante a descoberta exige nova leitura. Parâmetros usam os tipos
publicados, preservando inteiros/decimais textuais e nulabilidade. No modo
`sql_adaptavel`, SQL por etapa é opcional e continua sujeito à validação do
servidor; campo vazio usa o modelo treinado.

A confirmação chama somente `preparar_operacao` com a publicação exata. Aprovação
humana e execução são ações separadas. Troca de token/persona descarta conteúdo e
respostas atrasadas. Confirmação perdida impede reenvio da tentativa e orienta
conferir a listagem administrativa antes de iniciar outra preparação.

Validação dirigida de 2026-10-19: 19 testes de sessão de preparação SQL/externa
e acompanhamento passaram; tipos e build do console passaram. Essa evidência
unitária não certifica Chromium, DML ou a cadeia instalada. O percurso visual dirigido passou em Chromium com PostgreSQL e hub sintético ([evidência](validation/2026-10-19-sql-preparation-console.md)); casos ampliados e cadeia instalada permanecem pendentes. Nenhum gate foi encerrado.

A [rodada ampliada de preparação SQL](validation/2026-10-19-sql-preparation-expanded.md)
valida no Chromium os dois modos e confirmação perdida após persistência, sem
reenvio. Casos positivos/negativos do modo adaptável são cadastrados no editor e
aprovados pelo runner separado. A cadeia instalada e o aceite integral seguem
pendentes; essa rodada não substitui homologação nos três motores.
