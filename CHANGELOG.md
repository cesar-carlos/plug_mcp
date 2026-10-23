# Changelog

Todas as mudanças relevantes deste servidor MCP ficam aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Categorias: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**.

Itens novos entram em **Unreleased**. Só promove para uma versão quando houver release explícito.

## [Unreleased]

### Added

- Baseline persona-v2 integrado aos caminhos reais de desenvolvimento, com pin
  revisado do hub e evidências dos gates. Entrada legada preservada e publicação
  de produção bloqueada até aceite integral.

- Medições por etapa e jornadas OAuth independentes na cadeia compartilhada,
  preservando verificações e prazo de 60 segundos. Matriz integral de 85 casos
  aprovada nos três motores; falha anterior e limites registrados na documentação.

- Homologação de views regulares nos três motores verifica inspeção, identidade,
  tipo publicado, paginação e recusas sem novo SQL para recursos não permitidos.

- Editor privado de consultas permite escolher tabela ou view, preserva o tipo
  na releitura/publicação e mantém a aplicação independente da policy da fonte.

- Editor de consultas permite identificar relações e editar intermediárias/elos
  ordenados N:N, reutilizando os campos das operações. Preserva referências
  pendentes; prévia continua recusando caminho incompleto ou JOIN direto.

- Jornada isolada `manual-publication` liga casos obrigatórios do console ao
  runner CLI real nos três motores, com publicação e relatório obsoleto após
  edição. Preserva o ensaio separado de consultas/tokens e as cotas do hub.
  Diagnóstico do CLI conserva códigos/origem seguros sem conteúdo upstream e
  sem autorizar repetição de efeitos.

- Editor de consultas permite recarregar o treinamento salvo no servidor, com
  descarte confirmado, preservação da edição em erro e reset de casos locais.
  Não publica nem altera o snapshot ativo; facilita recuperação após conflito.

- Ensaio Chromium da sessão manual verifica tokens distintos, omissão de skills,
  recusa MCP direta após retirada de concessão, consumidor independente e logout,
  pela cadeia persistente dos três motores. Emissão sucessiva aguarda o novo
  Bearer confirmado, sem registrar segredos nem liberar deploy.

- Sessão local descartável para treinamento manual de personas, com controle
  inicialmente vazio, cadeia real dos três motores, servidor/worker candidatos,
  prazo limitado, credenciais privadas e parada cooperativa. Não libera deploy.

- Editor de casos permite escolher uma versão autorizada de dataset do mesmo
  template, com paginação e preparação explícita das sementes, sem adotar a
  versão mais recente ou salvar o caso automaticamente.

- Casos de consulta preservam origem editorial do dataset e distinguem sementes
  editadas, com referências e hashes conferidos pelo servidor ao salvar pelo
  console Client. Não herda aprovação nem modifica casos antigos.

- Console prepara sementes tipadas do dataset associado ao template para revisão
  em casos de consulta. Exige sessão Client, origem/revisão e papel editorial
  vigentes; não salva/aprova casos nem executa SQL automaticamente.

### Changed

- Biblioteca oferece abertura explícita do treinamento importado na persona
  correta, com releitura autorizada, edição protegida e foco após carregamento,
  eliminando a necessidade de trocar o seletor de persona para atualizar a lista.

- Runner de homologação v2 registra e reconfere os arquivos efetivos de MCP,
  hub e agente, recusando divergência durante a rodada sem alterar os checkouts.
  Registro local não libera deploy nem substitui aceite dos gates.

- Editor de skills externas associa erros ao nome/identificador ou à seção do
  contrato, sem descartar rascunhos; API identifica o campo público `contract`.

- Editores de operação SQL e cruzamento associam recusas aos campos informados
  pelo servidor, com foco e descrição acessível, preservando a edição.

- Descoberta MCP e importação OpenAPI delegadas respeitam IDs de integrações
  concedidos e revalidam acesso antes da entrega das propostas.

- Tools MCP de skills externas e casos de rascunhos não publicados usam escopo
  editorial explícito; publicação conserva prazo humano e autoridade vinculada.

- Serviços/HTTP de rascunhos externos aceitam administração delegada limitada
  à integração; publicação vincula prévia à autoridade e exige prazo humano prévio.

- Console v2 permite selecionar integrações administráveis na emissão/edição
  de tokens; OAuth exige consentimento separado da execução, limitado aos IDs
  e à permissão administrativa oferecidos.

- Rotas Bearer/OAuth e tools MCP de gestão de integrações usam escopo explícito,
  revisão de impacto e CAS; sem entrada de credenciais ou ativação automática.

- Fundação da gestão delegada de integrações adiciona escopo explícito por ID,
  limites de delegação e filtragem no serviço, sem ampliar tokens/OAuth antigos.
  Exposição em rotas, tools e console permanece em implementação.

- Upgrade da outbox preserva notificações históricas e cifras até o prazo de
  limpeza; atualização sem mudança de estado não reinicia a retenção terminal.

- Retenção da outbox v2 remove metadados e cópias históricas de credenciais
  após 90 dias do encerramento registrado, preservando deduplicação e estado
  terminal. Migração aditiva e limpeza em lotes pelo worker.

- Recusa vigente do hub prevalece sobre aprovação histórica de acesso ao agente.
  A revalidação v2 bloqueia a entrega por perda de autoridade, sem classificar
  o conflito como capability ausente ou restaurar concessões.

- Cruzamentos recusam inteiros numéricos fora da precisão segura, evitando
  associar identificadores distintos após arredondamento. Texto exato é preservado.

- Cruzamentos conferem novamente o prazo após revalidar a autoridade, impedindo
  enviar a próxima consulta quando essa revalidação consumir o orçamento global.

- Editor de consulta associa erros seguros de nome/identificador aos campos
  e direciona recusas do conteúdo ao aviso de treinamento, preservando a edição.

- Emissão de token sem confirmação exige conferir os cadastros e iniciar nova
  emissão explicitamente, sem reaproveitar automaticamente as concessões do
  formulário anterior nem recuperar o segredo perdido.

- Gestão de tokens bloqueia novas mutações após confirmação perdida, limpa o
  Bearer exibido e exige releitura explícita antes de continuar; falha nessa
  leitura preserva edição e bloqueio, sem repetir a alteração.

- Console preserva nome e revisão nos seletores de consultas; a descrição
  adicional de efeitos fica nas concessões SQL/externas, sem alterar os rótulos
  usados pelo percurso de consulta e anexos.
- Console orienta conferir o estado após perder a confirmação de uma alteração,
  em vez de recomendar nova tentativa; detalhes de falhas de rede não são expostos.
- Console permite selecionar capacidades externas publicadas na emissão e
  edição de tokens, vinculando a operação exata e iniciando ações com aprovação
  adicional, sem conceder efeitos SQL.

- Console permite emitir e editar concessões de operações SQL a partir da
  publicação exata, com efeitos necessários e aprovação adicional inicial.
  Fontes continuam explícitas; selecionar a capacidade não executa lançamentos.

- Histórico e comparação de conhecimento agora incluem operações SQL concedidas, com autorização DML vigente e sem ampliar ferramentas editoriais ou permitir execução pela leitura.

- Comparação delegada de conhecimento por seção entre consultas concedidas do mesmo padrão, com referências publicadas exatas e sem ampliar acesso ao catálogo.

- Histórico de conhecimento homologado com duas versões adotadas pela cadeia
  persistente dos três motores, sem ampliar tokens antigos; suspensão e
  revogação removem apenas os acessos correspondentes.

- Consumidor MCP pode listar histórico de versões do mesmo padrão adotadas por
  consultas ainda concedidas, com paginação e referências exatas. Versões não
  adotadas, suspensas ou fora das concessões não são reveladas.

- Inativação editorial homologada por OAuth com hub persistente nos três motores:
  consentimento sem treinar/fonte e conexão revogada não alteram o rascunho;
  publicação ativa e demais acessos permanecem preservados.

- Homologação da inativação delegada de exemplos usa hub persistente nas adoções
  dos três motores, conferindo concorrência, preservação da publicação e recusa
  após revogação remota sem alteração indevida do rascunho.

- Administração editorial delegada pode inativar exemplo SQL no rascunho privado
  por ID e revisão, preservando conteúdo e publicação ativa. Concorrência, replay,
  falta de concessão e revogação são recusados pela unidade autorizada existente.

- Regressão de propostas físicas cobre conexões OAuth do mesmo token, paginação,
  cursores isolados, consentimento restrito e revogação individual, preservando
  a outra conexão e o Bearer. HTTPS público e ChatGPT continuam manuais.

- Lista delegada de particularidades físicas permite localizar propostas próprias
  por perfil concedido, com paginação, isolamento e acesso remoto revalidado;
  não expõe conteúdo, identidade interna ou fila do curador.

- Homologação persistente da lista de propostas próprias cobre duas páginas,
  isolamento de cursores e revogação remota nas adoções dos três motores,
  sem confundir o recorte com aceite integral.

- Gestão editorial delegada lista propostas próprias por skill/versão concedida,
  com paginação e cursores isolados por token/conexão, sem abrir a fila do
  catálogo ou devolver conteúdo e revisões do curador.

- Propostas de particularidades físicas permitem releitura editorial explícita
  pelo autor, com referências de perfil/base, isolamento da conexão e nova
  verificação de acesso remoto, sem delegar revisão ou incorporação.

- Cadeia persistente verifica releitura editorial de propostas compartilhadas
  nas skills adotadas dos três motores, incluindo outro token e revogação
  diretamente no hub com delegação local ainda ativa.

- Gestão editorial delegada permite reler o conteúdo originalmente enviado em
  proposta compartilhada, sob autorização vigente e isolamento da conexão
  Bearer/OAuth, sem expor revisões do curador ou abrir o catálogo.

- Exemplos SQL podem ser corrigidos pela administração delegada com substituição
  explícita por ID e revisão. A correção volta a candidato e preserva modelo,
  parâmetros e publicação ativa, sem execução ou aprovação herdada.

- Homologação da administração delegada de casos externos usa hub Prisma real,
  reconstrução do MCP e revogação remota independente do registro local;
  evidência editorial continua separada da execução de provedores externos.

- Administração delegada lê e edita casos de skills externas concedidas por
  MCP/HTTP, com contrato publicado exato, CAS e consentimento OAuth. Não executa
  provedor/runner nem aprova relatórios; edição preserva publicação ativa.

- Plugin privado persona-v2 orienta treinamento delegado, casos/relatórios,
  templates exatos e revisão/publicação pelas ferramentas já implementadas.
  Descoberta/permissões continuam obrigatórias; prazo humano fica no console e
  runners/aprovação de efeitos não são delegados pelo pacote.

### Fixed

- Instruções MCP v2 deixam de negar descoberta/importação administrativa já
  disponível e passam a orientar histórico de consultas e operações SQL,
  preservando o alcance editorial e as permissões existentes.

- Limpeza da fixture de contexto compartilhado aguarda as conexões PostgreSQL
  encerrarem antes de remover a base, sem FORCE; vazamento ou falha de observação
  reprova a rodada em vez de encerrar clientes à força e gerar erro não tratado.

- Inventários resolvem aliases de caixa e nome curto do Windows pela identidade
  nativa do diretório, preservando rejeição de links e verificação exata de raiz,
  conteúdo e hashes nas evidências de release e homologação.

- CI Windows prepara o checkout exato do hub e sua ancestralidade antes do gate
  de release e preserva os bytes LF do contrato durante esse checkout, sem
  normalizar hashes ou dispensar a verificação do contrato e do snapshot.

- Troca de base no treinamento de consulta exige confirmação e descarta o
  vínculo compartilhado anterior apenas do rascunho, sem reassociar perfil ou
  alterar a publicação ativa. Cancelamento conserva a base e o vínculo.

- Sair de Consultas limpa também os modos nulo/vazio/omitido dos parâmetros,
  evitando reutilizar escolhas antigas ao voltar para a mesma publicação.

- Orientação de treinamento v2 deixa de anunciar runners existentes como
  pendentes. Onboarding corrige o alcance de integrações, setups de tokens e
  busca/grafo, mantendo execução de testes separada e segredos no navegador.

- Homologação instalada privada do agente corrigiu isolamento do mutex auxiliar
  e compatibilidade do bootstrap com a checagem real de assets. Após falha
  registrada e limpeza, nova rodada UAC passou reparos, reinstalação e controles
  sem elevação; não certifica atualização automática nem libera deploy.

- Inspeção estrutural do console impede submissões duplicadas no mesmo evento
  e descarta tentativas cujo contexto mudou antes do envio, preservando a
  paginação e a autorização no servidor.

- Console permite conferir novamente a delegação após falha e bloqueia mutações
  até recuperar o estado, preservando edição e focando o erro. Confirmação perdida
  não repete a solicitação; rótulo de integrações distingue gestão de execução.

- Referência coordenada do hub revisada após CI aprovado, preservando os hashes
  do contrato público e do snapshot histórico. Homologação de reinício da cadeia
  passa a reservar tempo para as transições sequenciais, sem ampliar limites de SQL.

- Descoberta v2 anuncia OAuth e integrações externas conforme os serviços ligados
  ao endpoint, corrigindo indicadores falsos fixos. Orientação de verificação de
  fonte distingue metadados de dados de negócio e conserva o suporte aos três motores.

### Fixed

- Console v2 confere fonte, dialeto e indicadores da resposta antes de mostrar
  acesso remoto verificado; apresenta progresso das fontes por skill e limites
  efetivos legíveis, sem transformar diagnóstico em autorização de execução.

- Editor visual de casos de consulta inclui sementes/resultados tipados, parâmetros,
  proteção de edição, revisão concorrente e remoção confirmada, sem disparar runners.

- Console lê casos/relatórios de consulta por revisão, descartando resultados
  obsoletos em edição local ou concorrente, sem executar testes ou aprovar evidência.

- Edição delegada de casos de consulta aceita cadastro, correção e remoção por
  revisão/CAS, com formato do runner isolado e sem aprovação ou execução implícita.

- Consumidores com treinamento delegado podem ler casos e relatórios de consulta
  por MCP/HTTP, com fontes concedidas, paginação e indicação de evidência obsoleta,
  sem executar runners ou gravar aprovações.

- Leitura v2 de templates por MCP/HTTP delegado permite revisar versão/hash exatos
  antes da importação, com fonte, consentimento e papel editorial vigentes, sem
  devolver datasets ou conceder execução.

- Mapa de impacto v2 filtra tabela/schema/coluna pela dependência estrutural
  publicada, preservando dependentes indiretos e evitando homônimos indevidos.

- Fixture Chromium v2 passa a encerrar HTTP, pools e bancos próprios pelo ciclo
  do runner, evitando finalização retida no Windows após sucesso ou falha.

- Impacto de perfis físicos no console confere identidade/acesso atual e distingue
  dependências da particularidade de skills que adotam somente o padrão-base.

- Catálogo v2 mostra impacto paginado de versões do padrão sobre publicações das
  próprias personas, incluindo dependências indiretas e nomes dos snapshots.

- Console v2 compara versões publicadas de perfis físicos por diferenças calculadas
  no servidor, com identidade e autorização atuais, sem adoção automática.

- Administração delegada v2 expõe leitura de casos/relatórios e edição por revisão
  para operações SQL e cruzamentos via MCP/HTTP, reutilizando autorização vigente.
  Não executa runners ou concede aprovação de efeitos.

- Worker persona-v2 ganha probe de saúde somente em loopback, com ciclo completo,
  falha e atraso monotônico; compose verifica saúde e parada fecha o listener.
  Sem reinício automático, retry de efeitos ou liberação de produção.

- CI ganha produtor separado de imagem candidata v2 com ensaio de empacotamento antes de exportar; fixture fixa ID Docker local e recusa fallback. Artefato não autoriza publicação ou deploy.

- Promoção persona-v2 seleciona artefato aceito por ID e confere origem GitHub, commit, sucesso e digest; separa revisão de build da revisão de aceite, sem reconstrução ou fallback. Validação efetiva no GitHub permanece pendente.

- Release persona-v2: evidências v2 vinculam o ID da imagem a cada gate; CI/deploy recusam imagem divergente ou legada antes de publicação/envio. Promoção e aceite operacional permanecem pendentes.

- Console v2: preparação SQL pela publicação concedida, parâmetros tipados e adaptação por etapa, sem aprovação/execução automática. Validação visual integrada permanece pendente.

- Console v2: preparação de ações externas por campos do contrato concedido,
  Bearer e publicação esperada conferida na transação. Sem aprovação/execução
  automática; resposta perdida bloqueia reenvio da tentativa.

- Persona-v2: composição de produção separada, com imagem por digest, segredos
  externos obrigatórios e preflight local sem rede. Entrada legada preservada;
  runtime de produção, publicação e deploy continuam bloqueados até aceite.

- Reset de desenvolvimento: schemas de usuário como `pgx` não são mais confundidos
  com namespaces internos `pg_`; recursos estranhos bloqueiam a limpeza.

- Persona-v2: reset de dados separado para desenvolvimento, com simulação,
  confirmação exata, marca prévia de descarte e recusa de schema/conexões indevidos.
  Preserva migrations; não toca hub/agente/bases de negócio nem libera produção.

- Publicação aguarda todos os checks do CI e reutiliza a imagem testada por
  artefato com hash/revisão/identidade conferidos; deploy consome a mesma rodada,
  sem reconstrução ou pull por tag. Falha na detecção de alterações bloqueia.
  Manifesto e bloqueio de produção permanecem obrigatórios.

- Persona-v2: runner persistente aceita imagem candidata local por ID imutável
  para o percurso Chromium de criar persona, cadastrar três bases, treinar,
  publicar e consultar pela cadeia real. Sem simulação do gateway ou alteração
  de contratos públicos; aceite integral e deploy continuam bloqueados.

- Persona-v2: imagem candidata local com servidor, worker e migração explícita,
  composição PostgreSQL/Redis isolada e segredos obrigatórios. Startup não aplica
  DDL; produção continua recusada. Alvo padrão e distribuição legada preservados.

- Persona-v2: verificação de liberação exige relatórios íntegros dos treze gates,
  inventário do candidato e registro de aceite. Declarações no manifesto sem
  evidências não liberam publicação. Captura do candidato é somente leitura;
  homologação da imagem e aceite humano permanecem obrigatórios.

- Persona-v2: cadastro direto REST/MCP no console pelo responsável, com
  reautenticação Client, confirmação, credencial técnica cifrada e integração
  inativa. UUID estável impede duplicatas por replay; confirmação perdida exige
  conferir a lista. Credenciais são descartadas após tentativa. Não cria
  operações, publicações ou concessões. HTTPS/ChatGPT seguem manuais; deploy bloqueado.

- Persona-v2: gestão de integrações no console com estado/impacto, suspensão,
  recuperação sem reativação e rotação de credenciais mediante reautenticação
  do mesmo Client. Revisão/CAS, limpeza de segredos e migration aditiva preservam
  snapshots e journals; operações antigas não são restauradas. Deploy bloqueado.

- Persona-v2: descoberta MCP paginada e importação OpenAPI JSON no console,
  com seleção explícita, schemas preservados e recusa de restrições não
  suportadas. Produzem somente propostas/rascunhos, sem efeitos, publicação ou
  concessões. Revalidam autoridade e versão da integração; deploy bloqueado.

- Persona-v2: editor de skills externas com contrato REST/MCP, campos, efeitos,
  aprovação, conciliação, casos/relatórios e revisão/publicação. Rascunhos usam
  CAS e operação estável; contrato publicado exige nova skill/operação, sem
  testes ou concessões herdados. Console não envia ações ou aprova relatórios.
  HTTPS/ChatGPT seguem manuais e deploy permanece bloqueado.

- Persona-v2: editor visual de cruzamentos com dependências publicadas exatas,
  etapas, semântica e limites; casos sintéticos e de transporte editados por CAS,
  relatórios somente leitura e revisão/publicação com prazo humano. Preserva
  snapshots e permissões; console não executa runners nem aprova relatórios.
  HTTPS/ChatGPT seguem manuais e deploy permanece bloqueado.

- Persona-v2: cache Redis reconfere a entrada após obter o claim, evitando SELECT
  duplicado quando outra instância publica entre miss e lock. Envelope autentica
  criação e vencimento, respeitando o TTL menor de quem lê; namespace v3 impede
  reaproveitar formatos anteriores. Homologação passa a exercitar dois processos
  MCP com Redis, isolamento, revogação e falha após SQL. Deploy continua bloqueado.

- Persona-v2: anexos cifrados no PostgreSQL de controle podem ser recuperados por
  outra instância e após reinício, com origem/consumidor/concessão e prazo originais.
  Quotas globais transacionais, limpeza de expirados pelo worker e rotação do cofre
  preservam isolamento; download revalida autoridade e não repete SQL de negócio.
  Falha do armazenamento não usa fallback em memória. Deploy continua bloqueado.

- Persona-v2: correção do transporte binário real distingue discriminantes
  odbc_fast de códigos ODBC nativos por type_system. Criação exige teto de duas
  linhas e truncated:false explícito sem paginação gerenciada; cache usa namespace
  novo para não reaproveitar respostas anteriores. Fixture fechada dos três
  motores cobre bytes, isolamento, revogação e reinício; deploy continua bloqueado.

### Added

- Persona-v2: edição visual dos relacionamentos e vínculos de conhecimento das
  operações SQL, com pares compostos, caminhos N:N, padrão/perfil, inspeção e
  confirmação de adoção no rascunho. Preserva parâmetros, etapas, tipos, identidade,
  escrita e publicação ativa; seleção inicial aguarda o editor ficar disponível.
  JSON continua opcional; deploy permanece bloqueado.

- Persona-v2: editor de skills de operação SQL no console, com contrato estruturado,
  casos sintéticos por revisão/CAS, relatórios paginados e revisão/publicação por
  hash e prazo humano. Alterar contrato/casos invalida aprovação técnica anterior,
  preservando a publicação ativa. Testes continuam exclusivos do runner isolado;
  publicar não aprova ou executa lançamentos. Deploy continua bloqueado.

- Persona-v2: anexos binários de uma coluna física/registro completo, com contrato,
  MIME e capability próprios, metadados positivos e base64 canônico. Preserva
  tipo ODBC recebido do agente, bytes originais, isolamento e revalidação nos
  downloads HTTP/MCP. Console edita/publica e baixa; consulta comum/JSON não
  expõe a coluna. Sem conversão, cache, ampliação de tokens antigos ou deploy.

- Persona-v2: anexo JSON de SELECT fresco, com exportação explícita por campo,
  contrato publicado e nova capability concedida. Handle opaco/cifrado em memória,
  isolado por persona/token/concessão; HTTP/MCP/resources revalidam autoridade,
  policy, identidade, fence físico e estrutura relevante. Console publica contrato
  e cria/baixa arquivos; migration 0038 guarda somente metadados. Primeira entrega
  JSON, ampliada acima por contrato binário separado; sem retry ou persistência
  de anexos. Deploy bloqueado.
- Persona-v2: checagem de finalidade adicional das saídas passa a conferir todos
  os ramos posicionais de UNION, mesmo com aliases diferentes. Impede contorno
  de exportação ou dos usos exigidos pelas combinações entre fontes.

- Persona-v2: cache cifrado e singleflight local/Redis opt-in de consultas locais,
  com chaves HMAC, isolamento por consumidor/fonte/publicação e revalidação em
  cada hit/seguidor. Revisão física invalida vínculos entre personas sem compartilhar
  dados; operações pendentes/desconhecidas desativam reuso. Sem retry/takeover,
  preservando horário e completude. Guardas estruturais continuam no executor;
  deploy bloqueado.

- Persona-v2: responsável lista consentimentos OAuth e revoga uma conexão no
  console com confirmação, fingerprint e auditoria transacional. Preserva token
  originador e outras conexões; datas históricas ausentes não são inventadas.

- Persona-v2: outbox transacional de notificações externas com configuração humana
  no console, HMAC, HTTPS público/IP fixado, fencing/lease, orçamento e retomada.
  Envia só metadados de revisões privadas e estados SQL/externos; não repete ações
  nem exporta catálogo. Segredos entram no cofre e suspensões desativam envios.
  Desenvolvimento validado em fixtures; deploy permanece bloqueado.

- Persona-v2: rotação do cofre por operador com simulação somente leitura, lock
  exclusivo, lotes/CAS e retomada durável. Abrange credenciais, delegação,
  operações, setups, OAuth, outbox e biblioteca; preserva autoridade/estados.
  Guards vinculam exceções de cifra ao backend/transação e verificam chave ativa
  no startup/escrita. Não reutiliza IDs de chave nem libera deploy.

- Persona-v2: retenção de payloads/resultados por 24h e comprovantes por 90 dias
  do desfecho local conhecido, com lease/CAS, relógio protegido e identidade
  permanente contra repetição. Desconhecidos são preservados; API/console
  distinguem conteúdo removido, sem inventar dados ou habilitar reenvio.

- Persona-v2: manutenção de setups e prévias expirados pelo worker, com lease
  independente, lotes limitados e rollback por expiração do lease. Registros
  OAuth vinculados permanecem até o prazo da concessão para preservar replay;
  journals, publicações e permissões não são alterados. Deploy segue bloqueado.

- Persona-v2: runner CLI de ações/consultas externas com manifesto de fixture,
  journal de rodada, reprovação preventiva e limpeza confirmada; console oferece
  casos tipados por CAS e relatórios paginados, sem disparar ações pelo navegador.

- Persona-v2: conciliação explícita de ações externas por leitura treinada REST/MCP,
  chave original e evidência append-only; mantém comprovante/estado técnico e
  impede retry de efeitos incertos. Fixtures PostgreSQL/TLS exercitam confirmação
  perdida e reabertura do runtime; HTTPS público/ChatGPT continuam manuais.

- Persona-v2: ações REST/MCP remotas com preparação cifrada, aprovação Client no
  console, claim CAS antes do efeito e journal próprio aditivo 0025. Recuperação,
  revogação e perda de confirmação não autorizam reenvio; saída permanece cifrada
  e comprovante técnico não prova efeitos comerciais. Conciliação automática e
  homologação dos provedores continuam pendentes; deploy permanece bloqueado.
- Referência do hub revisada para `693da92a334c98ae911c329d52006456ce768b09`,
  preservando bytes do contrato, snapshot histórico e verificações estritas de
  ancestralidade/incorporação. HTTPS público e ChatGPT seguem para validação manual.

- Persona-v2: adapters REST GET e MCP remoto para consultas com contrato publicado,
  casos obrigatórios, prazo humano e concessões explícitas por operação/skill.
  DNS público fixado no TLS, respostas limitadas e revalidação antes do envio e
  entrega. Rotação bloqueia contratos antigos; nenhum retry ou efeito é habilitado.
  Consentimento passa a admitir gerenciar_integracoes dentro da delegação vigente.
  Console completo, ações externas e homologação pública continuam pendentes.

- Persona-v2: setups de cadastro e rotação de credenciais técnicas de integrações,
  com gerenciar_integracoes, consentimento/delegação, reautenticação, confirmação,
  uso único e CAS. Bearer/API key/Basic ficam cifrados; destino/tipo são fixos na
  rotação e operações permanecem inativas. Migração aditiva 0024 registra a
  integração/versão na auditoria sem segredos. Não habilita chamadas externas.

- Persona-v2: setup de emissão com proposta imutável e concessões/prazo limitados
  pelo originador, consentimento e delegação; revisão humana, consumo atômico e
  Bearer mostrado somente uma vez no navegador, sem ampliar o solicitante.

- Persona-v2: setup temporário para rotacionar o token originador, com
  reautenticação/confirmação humana, consumo transacional e revogação dos
  derivados OAuth; novo Bearer exibido somente uma vez no navegador.

- Homologação persona-v2: verificador HTTPS próprio, sem `.env` ou credenciais,
  para discovery, challenge, CIMD e pacote da geração correta; roteiro manual
  distingue conexão real de checks locais e mantém publicação bloqueada.

- Contrato do hub fixado no commit que incorpora o snapshot revisado; CI e
  `training:check` verificam sua presença sem reaplicar o patch histórico.
  Acrescentado percurso Chromium com cadastro, treinamento e consulta pela
  cadeia persistente dos três motores, sem hub sintético ou liberação de deploy.

- Persona-v2: fixtures privadas com CHECK de intervalo inteiro, cascatas
  compostas UPDATE/DELETE e triggers de cópia NEW/OLD; casos de contagem direta,
  preservação de tenant e rollback dos efeitos indiretos, sem SQL livre de setup.

- Persona-v2: matriz privada dos runners com BIGINT/decimal exatos, datas,
  booleanos, UUID, Unicode/nulos, PK/UNIQUE, FK composta e trigger de auditoria;
  falha nativa esperada exige rollback confirmado e preservação das sementes.

- Persona-v2: runners genéricos de publicação por manifesto de operador,
  com casos de consulta adaptável, operações e cruzamentos executados pelo
  hub/agente em fixtures vinculadas. Relatórios recebem evidência de versões e
  identidades, sem payload; falha, limpeza incerta ou alteração concorrente impede
  aprovação. Marcadores de conciliação usam UUID novo por execução. Deploy bloqueado.

- Persona-v2: limites redutíveis de consulta, lançamentos e cruzamentos por
  publicação, token e concessão, com consentimento OAuth restritivo, diagnóstico
  e editores do console. Orçamento DML integra o fingerprint preparado. Correção
  de paginação no agente usa aliases de saída comprovados, inclusive no cursor.
  Não amplia concessões, altera snapshots antigos ou libera deploy.

- Persona-v2: finalidades por campo nas consultas publicadas, com justificativa
  para pessoal/sensível, capacidades explícitas e validação de linhagem SQL e
  combinações. Console configura os usos e exibe concessões. Token/OAuth exige
  publicação integral; segredo/inferido, exportação e DML sensível não são liberados.
  Snapshots/migrations preservados; deploy permanece bloqueado.

- Persona-v2/agente: prova nativa limitada de PK/UNIQUE/FK declaradas no SQL
  Anywhere 16 por catálogos públicos e índices físicos, com guarda da configuração
  de integridade na conexão. Casos não comprovados continuam bloqueados.

- Persona-v2: operações SQL adotam relacionamentos compostos, reversos e caminhos
  N:N como dependências estruturais verificadas; não ampliam permissão de escrita
  nem admitem JOIN em DML. Enforcement desconhecido continua bloqueando adoção.

- Persona-v2: adoção compartilhada inicial em operações SQL fixa padrão/perfil,
  prova, dependências utilizadas e chaves comprovadas no pacote preparado.
  Revalida catálogo/publicações em autorização, aprovação e entrega; recusa
  estrutural persiste receipt e suspende a publicação afetada. SQL Anywhere com
  enforcement desconhecido e runners sem guarda real continuam recusados.
  Não amplia tokens nem libera deploy.

- Persona-v2: criação de datasets por formulário a partir de versão exata do
  template, com campos livres, proveniência explícita, valores tipados e edição
  protegida. Validação editorial confere comprimento Unicode sem truncar;
  importação de arquivo DDL recusa UTF-8 inválido. Não executa SQL nem herda
  casos/aprovações; deploy permanece bloqueado.

- Persona-v2: operações citam schema/tabela separadamente em PostgreSQL,
  SQL Server e SQL Anywhere; Firebird conserva recurso sem schema. Helpers,
  conciliação, recortes e adaptação mantêm alvo exato. Policy transacional do
  agente recusa homônimo e não usa cache/fallback legado. Não altera snapshots
  ou amplia concessões; adoção compartilhada em DML e deploy seguem bloqueados.

- Persona-v2/agente/hub: motivo de falha enumerado persiste no journal aditivo
  v3 e acompanha receipts no contrato 1.15.0 e no MCP. Reinício e duplicatas
  preservam a recusa; registros antigos não recebem causas inventadas. Sem
  mensagens nativas, retry ou mudança das garantias de incerteza; deploy bloqueado.

- Persona-v2: importação estrutural aceita constraints inline nomeadas e em
  sequência, preservando seus nomes. Recusa nomes explícitos repetidos na mesma
  tabela e evita colisão com IDs anônimos. Material continua inferido/unknown,
  sem execução, publicação ou autoridade herdada; deploy permanece bloqueado.

- Persona-v2/hub: contrato aditivo 1.14.0 transporta expectativa estrutural de
  lançamentos, exigindo capability exata e revalidação após esperas. Carrier MCP
  preserva a expectativa, confere leitura exata das dependências e orçamento
  nativo. Adoção/publicação compartilhadas em DML seguem pendentes; deploy bloqueado.

- Persona-v2: importação e adoção preservam IDs, intermediárias e elos N:N no
  contrato de consulta; a relação conceitual não autoriza JOIN direto. Prova de
  FK reversa usa a tabela filha; 1:1 exige unicidade e direção comprovadas.
  Snapshots compartilhados sem caminho explícito exigem revisão/republicação.
  Enforcement desconhecido permanece bloqueado e deploy não foi liberado.

- Persona-v2/agente: corrigida inspeção de views regulares SQL Anywhere usando
  o tipo legível do catálogo, sem tratar materialized views como views comuns.
  Homologação isolada ampliada para 16 recursos paginados, view com concessão
  explícita e drift de coluna treinada; alterações fora do treinamento devem
  preservar consultas independentes. Deploy permanece bloqueado.

- Persona-v2: importação de versões exatas de templates por Bearer/OAuth e MCP,
  com delegação vigente, fonte concedida e papel editorial no catálogo. Console
  permite selecionar exemplos adicionais compatíveis, sempre candidatos; datasets
  são revalidados na importação e DDL conserva precisão/escala no tipo lógico.
  Nenhuma publicação, caso aprovado ou concessão é herdada; deploy bloqueado.

- Persona-v2: composição explícita de páginas de inspeção por console e MCP,
  linhagem imutável e isolamento por fonte/versões/identidade (migration 0022).
  Preserva menor validade, cobertura e constraints desconhecidas; compara e
  publica/adota somente pelos fluxos próprios. Revalida sourceSchema v1 no hub.
  Contrato RPC permanece limitado a quatro recursos por página; deploy bloqueado.

- Persona-v2: datasets recusam tipos divergentes do template, tipos lógicos
  desconhecidos e decimais fora da precisão/escala declaradas, sem arredondamento.
  DDL importado respeita os limites estruturais compartilhados e recusa o marcador
  reservado de identidade. Mantidos rascunhos sem autoridade herdada e deploy bloqueado.

- Persona-v2: biblioteca editorial cifrada/versionada de templates e datasets,
  importação explícita de rascunhos com fonte/variante e exemplos candidatos,
  sem aprovação herdada. DDL estrutural usa gramática fechada e nunca executa ou
  comprova uma base (migration aditiva 0021). Deploy permanece bloqueado.

- Persona-v2: prazo futuro obrigatório na publicação de padrão, perfil e skill,
  vinculado à prévia e ao conteúdo; calendário gravado na mesma transação.
  Worker de revisão separado, com lease, retomada, tarefas únicas por calendário
  e notificações internas reautorizadas no console (migration aditiva 0020).
  Vencimento não suspende execução; deploy permanece bloqueado.

- Persona-v2: feedback por item concedido com autoria/proveniência imutáveis,
  fila editorial e encaminhamento explícito. Calendários por publicação com prazo
  escolhido pelo curador, CAS, histórico e avisos sob demanda, sem suspensão
  automática ou alteração dos snapshots (migration aditiva 0019). Console e MCP
  integram os fluxos; deploy permanece bloqueado.

- Persona-v2: curadoria de particularidades físicas com propostas imutáveis e
  previews próprios (migration aditiva 0018), tools MCP condicionadas à autoridade
  delegada e formulários no console. Curador com acesso vigente à mesma base
  incorpora por hash/CAS somente ao rascunho; versões publicadas permanecem
  intactas. Perfis recusam publicação com exemplos candidatos. Deploy bloqueado.

- Persona-v2: busca lexical de significados, relacionamentos, regras e exemplos
  aprovados com índice reconstruível por publicação/hash (migration aditiva 0017).
  Grafo MCP autorizado preserva recursos físicos, chaves e caminhos declarados,
  com paginação cifrada e proveniência; console usa token do consumidor. Nenhuma
  busca, desenho ou índice amplia concessões. Deploy permanece bloqueado.
  O console também envia propostas de tabelas e relacionamentos reutilizando os
  editores existentes e selecionando explicitamente uma definição da versão-base.
  Corrigida a criação de relacionamentos de negócio: eles não carregam estado de
  constraint física; trocar a origem remove declarações incompatíveis.

- Persona-v2: fila de propostas tipadas com proveniência imutável, revisão
  por curador autenticado e incorporação ao rascunho por hash/CAS de 15 minutos.
  MCP lê padrões somente pelo recorte das skills concedidas e recebe propostas
  mediante treinamento/delegação/papel vigentes. Exemplos SQL explícitos entram
  candidatos, sem execução ou aprovação automática; publicação exige revisão.
  Migration aditiva 0016 preserva conteúdo v2 existente. Deploy continua bloqueado.

- Persona-v2: console com inspeção estrutural paginada, diagnóstico de
  compatibilidade, edição/publicação de perfis físicos e adoção explícita no
  rascunho de consultas. Listagens autorizadas separam versões publicadas,
  rascunhos e suspensões por catálogo/base/padrão; alteração pendente é protegida.
  Aplicação preserva SQL, parâmetros e exemplos, sem atualizar skills ou tokens
  automaticamente. Deploy permanece bloqueado.

- Persona-v2: perfis físicos com rascunho CAS, substituições explícitas,
  revisão por curador com acesso vigente à mesma base, publicação imutável e
  adoção explícita pelas consultas. Migrations aditivas 0014–0015 preservam
  identidade interna/nativa; suspensão bloqueia dependentes. Contrato hub 1.12.0
  acrescenta `sourceConstraints` v1 para verificar PKs, índices únicos e FKs
  utilizadas antes/depois do SELECT na mesma conexão. SQL Anywhere mantém
  enforcement desconhecido, sem habilitar dependências não comprovadas.
- Persona-v2: inspeção estrutural pelo hub/agente nos quatro dialetos, evidência
  imutável e comparação técnica. Consultas podem adotar explicitamente versões
  compartilhadas, com hashes e colunas conferidas antes/depois do SELECT na mesma
  conexão. Revogação/suspensão bloqueia dependentes; constraints desconhecidas
  não habilitam execução. Contrato inicial hub 1.10.0. DML e editores de adoção
  permanecem pendentes; nenhum gate de release concluído.
- Agente: metadados usam consultas fixas por motor; transporte preserva nulos
  obrigatórios e separa paginação de metadados da paginação de resultados SQL.

- Persona-v2: teto administrativo explícito no hub/MCP, preservando fontes como
  único teto das delegações anteriores. Treinamento/publicação privados e
  manutenção limitada de outros tokens aceitam Bearer/OAuth com fontes
  concedidas, CAS, prazos, preview vinculado à autoridade e autoria transacional.
  Console oferece seleção de permissões/fontes/delegação. Integrações e setups
  delegados de emissão/rotação de tokens permanecem pendentes; deploy bloqueado.
- Transporte do hub: respostas HTTP sem conteúdo, incluindo revogação 204,
  deixam de causar erro local após a mutação remota já concluída.

- Governança persona-v2: guards e manifestos do hub/agente alinhados aos 14 gates
  do MCP, incluindo conhecimento compartilhado. Testes recusam omissão do gate;
  `ready: false` e zero gates concluídos continuam nos três projetos.

- Persona-v2: suspensão e recuperação de fontes por sessão Client/CAS, com prova
  da mesma identidade pelo hub/agente e credenciais opcionais renovadas no navegador.
  Substituição cria outro vínculo/credencial e preserva o anterior no histórico,
  sem transferir treinamento ou permissões. Migration aditiva 0011 impede
  recuperação de fonte substituída e referências entre personas. Console inclui
  revisão de impacto, edição protegida e descarte de segredos por tentativa.
  Homologação integral e deploy continuam bloqueados.

- Homologação persona-v2: configuração persistente do agente com repositório
  Drift e cofre Windows DPAPI real pelos adapters FlutterSecure. Reinício dos
  três processos recupera fontes, treinamento e tokens sem bootstrap; segundo
  reinício confere os quatro journals incertos e duplicatas pela cadeia real.
  SQLite não guarda segredos em claro. Bootstrap/instalador desktop e aceite
  integral continuam pendentes; deploy e imagens permanecem bloqueados.

- Homologação persona-v2: cadeia padrão com autoridade PostgreSQL/Prisma,
  bancos separados, aprovação real de ClientAgentAccess e processos HTTP
  independentes MCP/hub. Reinício verifica fontes, publicações e concessões
  nos quatro motores; sessões administrativas antigas são recusadas. O modo
  em memória continua explícito. Bootstrap desktop, matriz integral e deploy
  permanecem pendentes/bloqueados.

- Persona-v2: delegação opaca do responsável no hub, cifrada no MCP, CAS e
  revogação/renovação pelo console. OAuth pode consentir gerenciar_fontes para
  iniciar setups de cadastro/rotação de credenciais, com reautenticação no
  navegador, CSRF, prazo de 15 minutos, consumo e auditoria transacionais.
  Migration aditiva 0010; contrato aditivo do hub 1.7.0 e instruções do plugin
  sincronizadas. Demais permissões, instalação ChatGPT e aceite integral
  continuam pendentes; deploy/imagens bloqueados.

- Persona-v2: OAuth próprio opcional em `/mcp/chatgpt`, consentimento por
  fonte/skill/operação, PKCE S256, código único, refresh rotativo e revogação
  terminal da conexão atual. Stores cifrados, migration aditiva 0009, deadline
  do access revalidado e metadados OAuth no catálogo MCP. Candidato ChatGPT
  pode ser montado com ID real; console copia endereço sem token. Instalação
  privada, administração OAuth via delegação do hub e aceite integral pendentes;
  deploy/imagens permanecem bloqueados.

- Persona-v2: suspensão e recuperação administrativa com CAS, bloqueio de uso,
  suspensão das publicações, revogação das conexões derivadas e histórico na
  mesma transação. Console exige revisão explícita, protege edição e descarta
  contexto carregado. Recuperar preserva snapshots e não ressuscita concessões
  ou publicações; homologação persistente completa permanece pendente.

- Plugin Se7e: perfil local versionado valida manifesto, frontmatter, geração,
  ferramentas, referências, arquivos permitidos, marca oficial e inventário
  SHA-256. Skills legadas passam a ter pasta/nome iguais; montagem exige geração
  explícita, valida staging e recusa sobrescrita. Novo candidato v2 portátil e
  comando `plugin:check`; evolução OAuth v2 descrita acima, com homologação
  privada ainda pendente. Plano restante distingue implementação, homologação e dependências
  externas, incluindo delegação no MCP/hub. Deploy permanece bloqueado.

- Persona-v2: roteiro por registros reais, diagnóstico local de concessões e
  teste de conexão sem SQL; histórico administrativo paginado com autoria e
  versões transacionais, migration aditiva 0008. Revisão de publicação compara
  conteúdo anterior/proposto no servidor; editores exibem relacionamentos e
  sugestões conservadoras de exemplos duplicados. Inspeção/compatibilidade
  compartilhada e aceite integral continuam pendentes; deploy bloqueado.

- Persona-v2: revisão de impacto transitivo antes de alterar bases/credenciais,
  erros seguros por campo e cruzamentos publicados no console, com combinação
  fixa, SQL local adaptável, paginação final e revalidação por token. Emissão de
  token exige seleção explícita das consultas dependentes. Deploy bloqueado.

- Persona-v2: console separado por áreas, marca Se7e oficial, favicon e manifesto
  próprio sem cache offline. Proteção de edição/cadastro, nomes de snapshots
  publicados e consultas paginadas. Catálogo recebe editor estrutural mantendo
  importação JSON; compatibilidade e adoção executável continuam pendentes.
- Persona-v2: listagem/edição CAS/rotação de tokens, Bearer de uso único e
  invalidação de derivados. Console lista preparações e permite revisão/aprovação
  exata pelo responsável; demais jornadas continuam pendentes. Deploy bloqueado.

- Persona-v2: catálogo compartilhado privado, membros/papéis, padrões com
  variantes SQL e publicação imutável por preview/hash/CAS; console importa e
  revisa conteúdo JSON, compara versões e suspende publicações. Estrutura inclui
  tipos nativos, chaves e caminhos N:N explícitos. Consultas privadas aceitam vários exemplos validados
  e entregues em obter_skill. Associação executável ao padrão e inspeção pelo
  hub/agente seguem pendentes; novo gate mantém deploy bloqueado.

- Persona-v2: edição de persona e de fontes/recortes por versão, com rotação de
  credenciais verificada pelo plug_server/plug_agente e cifrada no cofre. Mudanças
  suspendem publicações dependentes e invalidam relatórios antigos sem ampliar
  tokens ou reassociar bases. Console inclui revisão e descarte de credenciais;
  deploy continua bloqueado até o aceite integral.

- Homologação persona-v2: runner explícito MCP → REST do hub → Socket.IO do
  agente → ODBC nos quatro motores, com publicação, aprovação Client, rollback,
  cruzamentos, identidade, revogação e commit incerto sem reenvio. Provisionamento
  e limpeza limitados a fixtures novas, com nomes próprios e portas locais.
  Corrigidos no agente a entrada `expectedSource`, a confirmação de completude
  para cruzamentos e o tratamento de perfil remoto incompleto. Deploy bloqueado;
  alcance e limites em `docs/persona-v2/homologation-chain.md`.

- Persona-v2: SQL Anywhere admite UUID provisionado manualmente pelo DBA
  (DV2-007), verificado na conexão executora. Tabela técnica reservada, sem DDL
  automático; permissões mínimas e procedimento para cópias/restaurações.
  Contrato aditivo do hub 1.6.0 e snapshot sincronizados. Deploy segue bloqueado.

- CI: validação documental offline em Linux/Windows e no release:check para
  links/âncoras, rules vinculadas ao AGENTS.md, exemplos JSON/contratos e cobertura
  dos gates na matriz de aceite. Decisões e relatórios históricos organizados
  sem alterar a autoridade ou o bloqueio de release da persona-v2.

- Persona-v2: identificação física/dialeto por RPC `sql.describeSource` v1 do
  hub/agente, sem conexão MCP/ERP. Migração 0005 põe fontes sem prova em
  quarentena; divergência suspende vínculos/publicações dependentes. Locator é
  recusado; SQL Anywhere admite somente o UUID provisionado conforme DV2-007.
  Identidade na conexão executora implementada; homologação integral pendente.

- Persona-v2: console inicial para persona vazia, várias bases, treino estruturado,
  preview/publicação e tokens restritos. Cadastro infere banco da policy a partir
  dos cinco campos de conexão. Contexto preserva significados dos relacionamentos;
  busca lexical/resources de fonte respeitam concessões. SELECT por schema exato
  com alias e policy sem equivalência pelo nome final. Guias v2 corrigidos para
  pageSize/pagination e orientações de resposta factual, vazios e incompletude.
  Base comum `persona-v2-source-onboarding-1`; previews/relatórios devem ser atuais.
  Entrada principal continua legada; deploy permanece bloqueado.

- Persona-v2: SELECT Firebird adaptável com parser próprio e gramática fechada;
  saídas de escrita SQL Anywhere recuperadas por chave UNIQUE/identidade na mesma
  transação, com SELECT concedido e bindings posteriores. Matriz ampliada de
  55 testes ODBC reais, sem liberação de deploy. Corrigido alias Firebird do
  envelope vazio; nova versão da base comum exige revalidação dos relatórios.

- Persona-v2: matriz obrigatória de 48 testes de lançamentos nos quatro motores
  ODBC reais; correções de identidade da base, DBN do SQL Anywhere e RETURNING
  interno PostgreSQL/Firebird. Prova e contagens entram no teto de 32 comandos.
  Node 24.21.0 local verificado, contrato hub 1.3.0 e snapshot reproduzível fixado;
  deploy e aceite integral permanecem bloqueados.
- Persona-v2: SQL adaptável de operações com gramática fechada por dialeto,
  reordenação de SET/AND e filtros restritivos publicados; valores, identidade,
  concorrência, recortes e saídas preservados. Runner exige casos aceitos/recusados.
  `conciliar_operacao` verifica marcador UUID único da transação; migration 0004
  mantém evidências imutáveis separadas do comprovante técnico, sem retry ou
  inferência de rollback. Produção e homologação ODBC permanecem bloqueadas.

- Persona-v2 em desenvolvimento: publicação imutável de operações SQL somente_parametros,
  recortes/colunas/identidade/concorrência, casos obrigatórios em PostgreSQL isolado
  com rollback, concessões por hash exato, preparação/aprovação e transporte REST v1
  concreto na composição nova. Estado desconhecido pode ser resolvido por consulta
  ao journal sem reexecução. Hub expõe capacidades autenticadas por vínculo.
  SQL adaptável de escrita, homologação dos quatro motores e deploy seguem bloqueados.

### Added

- Fundação de lançamentos persona-v2: serviço de preparação/aprovação com payload
  cifrado, claim único, comprovante e invalidação física; store PostgreSQL e migração
  0003 protegem conteúdo e transições. Journal Drift separado no agente e contratos
  aditivos `sql.operation.*` no hub (REST 1.2.0). Agente integra bootstrap/RPC,
  hash local, transação ODBC, parâmetros/outputs e guardas antes do commit.
  Negociação `sqlOperations` v1 e transporte REST/agents:command/relay implementados,
  com opt-in do agente desligado por padrão, limites, revalidação da sessão e
  ausência de reenvio por ACK. Comprovante preserva contagem nula e incerteza após
  perda da resposta. Harness Node/Dart isolado cobre journal temporário real e
  transação simulada. Publicação de operações, homologação e ligação padrão MCP
  permanecem pendentes; escrita no runtime padrão e deploy seguem bloqueados.

- Cruzamentos persona-v2 vinculados a skills publicadas: dependências imutáveis,
  concessões de todas as fontes/skills, SQL local adaptável com projeção fixa,
  combinação tipada, limites por skill/token/requisição e paginação final.
  `validar_cruzamento` usa envelopes vazios; `executar_cruzamento` exige entradas
  completas e revalida todas as leases antes da entrega. Runner separado de casos
  sintéticos com hashes de revisão/pacote/casos. SELECTs reais em duas bases
  PostgreSQL de teste; hub simulado. Deploy e aceite integral seguem bloqueados.

- Consultas persona-v2 por fonte: `consultar_dados`, `validar_consulta`,
  `verificar_fonte` e `obter_capacidades`, parâmetros tipados, database explícito,
  credenciais independentes, policy completa e revalidação antes da entrega.
  Recortes físicos dominantes com bindings reservados, limites/projeção e
  proveniência; testes SELECT reais em PostgreSQL efêmero com hub simulado.
  Corrigida detecção de LIMIT vazio do parser PostgreSQL para permitir paginação.
  Firebird, escrita e aceite integral continuam pendentes.

- Catálogo persona-v2 por fonte com rascunho CAS, casos, preview/diff/hash,
  publicação imutável, expiração/consumo único e suspensão. Novo MCP stateless
  expõe contexto e publicações concedidas em tools/resources nos dois protocolos;
  execução ligada na etapa de consultas por fonte. Migração aditiva `0002_catalog.sql` e testes
  PostgreSQL de concorrência, revogação, dependências e confirmação obsoleta.

- Fundação `persona-v2` em entrada separada de desenvolvimento: responsável Client,
  persona sem fonte, tokens explícitos, fontes com credenciais independentes,
  baseline novo, guardas de autorização e executor interno de cruzamentos.
  Testes PostgreSQL reais do baseline/administração e testes unitários de autorização,
  cruzamento e estados de lançamento. Escopo e pendências em `docs/persona-v2/README.md`.
- Bloqueio de publicação de imagem e deploy enquanto o manifesto `persona-v2` não
  tiver aceite completo. O runtime principal ainda é legado; escrita no agente,
  contratos novos do hub, execução MCP/OAuth/console e homologação de quatro motores pendentes.

- Console: temas Sistema/Claro/Escuro com tokens semânticos, menu móvel acessível, confirmações e componentes compartilhados; `web:check` com lint Vue/TypeScript, tipos, Vitest e build no gate de release. Suíte Chromium do console separada do OAuth com `FakePlugServer` e fixtures sintéticas em Linux/Windows.
- Console: tela **SQL de treino** (`/skills/sql`) lista o `sqlModelo` de cada skill desta persona e grava pelo mesmo `atualizar_skill`. O GET é `/app/api/skills/modelos`; a tool MCP `listar_skills` continua sem SQL.
- Console no navegador em `/app` (Vue 3 + Pinia): o usuário informa e-mail, senha, `agentId`, dialeto e `client_token` no formulário já seguro e mantém a persona, skills, grafo e operação pelos mesmos casos de uso das tools. Bearer só na memória da aba. Favicon e marca Se7e na aba e na navegação.
- BFF `/app/api` e `POST /setup/:code` com `Accept: application/json` devolvem `{ token, acessoId }` ou `{ code, message, hint }`, sem ecoar senha ou `client_token`.
- Procedimento para conferir a allowlist OAuth do piloto ChatGPT e recriar só o serviço `mcp`, sem imprimir segredos: `docs/operations/chatgpt-oauth-allowlist.md`.

### Fixed

- Persona-v2: comparação de publicação mostra a ordem das etapas de execução,
  mesmo quando IDs/conteúdo são preservados; reordenar SQL não equivale a
  reordenar uma lista de definições físicas.

- Persona-v2: console permite acompanhar, executar com confirmação, cancelar e
  conciliar preparações SQL/externas pelo token solicitante. Mantém aprovação
  humana separada, revalida persona/estado, envia só ID/fingerprint e descarta
  respostas antigas. Clique duplo/retorno perdido não oferece reenvio. Plano
  restante distingue funcionalidades entregues das lacunas; deploy bloqueado.

- Persona-v2: leases de manutenção e vencimentos de revisão passam a usar o
  relógio PostgreSQL, impedindo tomada/antecipação por relógios divergentes.
  Encerramento fica registrado antes do primeiro ciclo e interrompe novos
  jobs/claims, aguardando o atual. Homologação inclui dois processos, quedas,
  rollback e retomada real com receptor deduplicador; deploy continua bloqueado.

- Console persona-v2: conflito de edição de base não aguarda recarregamento
  automático nem troca a recusa por falha de atualização. Preserva os campos
  até a decisão explícita de recarregar.

- Referência coordenada do hub revisada para o commit aprovado `7695049`.
  Verificação histórica usa índice temporário do ancestral revisado, preservando
  patch/hash e exigindo checkout/candidato/contrato exatos, sem modificar o hub.

- Referência do hub e checkout do CI sincronizados com o commit aprovado
  `e8f56db8e0205b94b99b5ac7dabd41655f4fd2c0`; `training:check` restaurado,
  preservando contrato, snapshot histórico e verificações estritas. HTTPS
  público/ChatGPT permanecem manuais e o deploy continua bloqueado.

- Console: salvar antes de validar, preservar edições pendentes, separar rascunho/publicação ativa e impedir confirmações obsoletas ou envios repetidos. Consultas distinguem candidata de novo exemplo, preservam múltiplas skills e isolam inativação. Anotações preservam governança, grafo mantém destino e JOIN composto, escopo permite remover vínculos, operação carrega seções independentemente e respostas antigas são descartadas na troca de sessão.
- As páginas do plugin e do cofre usam o ícone Se7e de `/app/icon-192.png`. A CSP dessas respostas libera imagem só do próprio servidor.
- A marca Se7e do console é uma URL pública em `/app`, para o Vite não tratar o PNG como módulo e o build da imagem falhar.
- Criar outra persona no console mostra o Bearer novo sem trocar a persona da aba. Publicar skill só abre no passo `publicar_skill`, com o hash na memória. Params, anotações, escopo vinculado, JOIN, consulta inativada, alerta, lacuna e webhook passam a ter formulário.
- Push na `main`, após o CI verde, publica o container MCP por SSH somente quando o commit altera o runtime. A imagem é a `linux/amd64` já testada no CI, identificada pelo SHA que passou. A chave executa `/usr/local/sbin/plug-mcp-deploy`, fora do Git. Falha de `/health` ou `/ready` restaura a imagem anterior. O commit recebe o status `production/mcp` e o host grava `/var/log/plug-mcp-deploy.log`.

### Changed

- `inativar_consulta_aprendida`: o preview retorna o conteúdo canônico associado ao hash (acesso, consulta/versionamento/SQL/contrato/publicações/status e motivo), sem alterar confirmação, CAS ou campos existentes.
- SQL de treino abre os cartões fechados, filtra por trecho do SQL ou só os ilegíveis, mostra rascunho e publicação separados e grava um cartão sem apagar a edição dos outros. Em Consultas, abrir uma linha mostra o SQL do exemplo; a lista segue sem SQL e a troca continua no preview de `salvar_consulta`.
- O menu do console tem **Sair**: esquece o Bearer e a skill aberta nesta aba e volta à tela de colar o token. A persona e o catálogo permanecem.
- `listar_skills` e `obter_skill` seguem quando um `sqlModelo` não é interpretável: essa skill volta com falta `kind: sql` (`nextAction: atualizar_skill`, sem `podeLiberar`) e as demais permanecem na lista.
- `listar_acessos` devolve `escopoPadrao` e `timezone` do recorte vigente. O console de escopo abre com esses valores. Grafo, treino, consultas, verificação, painel e o diff de publicação mostram lista; o JSON fica recolhido.
- O console autenticado passa a mostrar a persona no menu e organiza acesso, catálogo e operação com o mesmo cabeçalho, selos de status e formulários agrupados. `unknown (vault)` na tela de acesso aparece como “não consultado”: o cofre não lê a policy ao vivo.
- As páginas em que o plugin ChatGPT recebe o token MCP usam o visual do console Se7e. O campo de senha, a conferência da persona e a recusa sem recursos externos permanecem.
- Os formulários de `/setup/:code` (cadastro, outra persona, credenciais e rotação), o Bearer mostrado uma vez e as recusas do cofre usam o mesmo visual. Campos, CSRF e a exibição única do token permanecem.
- A página `/app/conectar` agrupa conta do hub, acesso SQL e confirmação. O dialeto aparece com o nome do GDBR e a confirmação fica alinhada ao texto. O POST de cadastro permanece o mesmo.
- A inferência pelo nome só classifica segredo (senha, token, chave e equivalentes). Pessoal e sensível deixam de ser inferidos, inclusive texto livre e tipo `text`/`clob`, e a projeção desses campos volta a sair. Classe confirmada pelo usuário permanece.
- Neste servidor o MCP de produção passou a ser o serviço `mcp` do Compose (perfil `container`), em `127.0.0.1:3333`, com `restart: unless-stopped`. O PM2 deixa de subir `se7e-mcp`, para não disputar a porta com o Nginx.
- `.env.example` passa a listar `E2E_AGENT_ID`, `E2E_CLIENT_TOKEN`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD` e `E2E_DIALETO`, vazios. Sem esses valores, `npm run test:live` continua se pulando.

### Fixed — compatibilidade e validação do piloto ChatGPT

- CIMD com IP fixado, callback DNS all/scalar, família explícita, TLS/SNI e conexão nova; regressões com HTTPS nativo.
- securitySchemes principal e _meta no tools/list legado/moderno; desafios OAuth com descrição fixa e descoberta sem erro de token quando não há credencial.
- Formulários compatíveis com Origin do Chromium, callback externo sem Referer e CSP restrita ao destino validado.
- Unidade de trabalho autorizada substitui Proxy/regex SQL; rollback, publicação/remoção/rotação e revogação concorrente em PostgreSQL.
- Chromium/HTTPS/PostgreSQL efêmero no CI e comando read-only chatgpt:check; gate explícito de Node compatível.

### Added — plugin ChatGPT privado e delegação OAuth

- Endpoint opcional `/mcp/chatgpt`, autorização por token MCP no navegador, CIMD/PKCE S256, credenciais opacas com rotação/replay e revogação por acesso/concessão; migração aditiva 0034.
- Perfil estável, contexto de sessão e revogação própria; catálogo compartilhado com metadata OAuth, guards de entrega/mutação, cache/anexos/setup vinculados à concessão e quotas de sessões compartilhadas.
- Pacote privado/portátil com duas skills, montagem sem credenciais e comando local de rollback. Piloto real depende de HTTPS e conexão privada cadastrada; testes locais não o certificam.

### Fixed — integração das branches de CI

- Mescladas as atualizações para `actions/checkout` v7, `actions/setup-node` v7 e `docker/setup-qemu-action` v4, preservando todas nos conflitos do workflow.
- Formatação ignora o checkout auxiliar `plug_server_contract`; o teste de contrato carrega arquivos somente quando a suíte é executada, permitindo sua ausência no job Windows.
- Histórico da branch `epic/ciclo-treino-publicacao` reconciliado após verificar equivalência com o patch já integrado pelo PR #9, preservando o conteúdo atual da main.

### Added — treinamento compartilhado e curadoria

- Base SQL + plug_server 1.0.0 compartilhada por todas as personas: `guia://treinamento-base`, `guia://sql`, `guia://plug-server` e `obter_treinamento_base` no bootstrap; versão/hash, contrato empacotado e gate de consistência. `pre_treino` compõe contexto de sessão, sem treinamento de pesos.
- Curadoria paginada, aprovação por ID/múltiplas skills com preview/hash/CAS, inativação explícita, dedup por contrato/publicações e contagem de execução separada.
- Grão/chaves, constantes de negócio, metadados semânticos de métricas, feedback/revisão e diagnóstico consolidado.
- Casos sintéticos versionados, runner PostgreSQL separado e gates graduais de testes obrigatórios; templates/datasets confirmados sem autoridade herdada.
- Avaliador consome descoberta/resources/schemas reais, compara tipos/decimais exatos e registra ferramentas/duração/consumo; variantes explícitas sem alteração automática de invariantes.
- Migrações 0032/0033 preservam histórico e acrescentam CAS/revisões/recorrência, sem confirmação ou certificação retroativa.
- Tools de curadoria `listar_consultas_aprendidas`, `obter_consulta_aprendida` e `inativar_consulta_aprendida`; `confirmar_grao` distingue origem e resultado, e `confirmar_constante_negocio` admite somente constantes não sensíveis aprovadas no pacote.
- Casos de negócio: `registrar_caso_teste`, `atualizar_caso_teste`, `listar_casos_teste`, `obter_caso_teste` e `arquivar_caso_teste`. Relatórios do runner separado ficam disponíveis em `listar_relatorios_avaliacao`; testes obrigatórios reprovados ou obsoletos bloqueiam somente a nova publicação.
- Feedback e diagnóstico: `registrar_feedback_consulta`, `revisar_feedback_consulta` e `diagnosticar_treinamento`, sem aprovação automática de conhecimento. `exportar_template_skill` / `importar_template_skill` criam rascunhos no destino; `exportar_dataset_treinamento` entrega JSON/JSONL sintético aprovado, com manifesto e partições de treino/desenvolvimento/teste.

### Changed — atualização e autoridade publicada

- Documentação de setup/runtime revisada: Redis 7 separado do cliente npm 6.3.0, conexão host/container, overlay restrito a loopback e diagnóstico; modelo de dados alinhado a aprendizado governado, inspeção protegida e auditoria sem conteúdo sensível.
- Node 24.21 LTS, TypeScript 7 real (API 6 apenas para lint), SDK MCP v2 modular, Express 5/Zod 4/ESLint 10/Vitest 5 e dependências npm estáveis; lockfile e CI Windows/Linux/musl x64/arm64.
- Nova consulta ao npm atualiza `@types/node` para 26.6.4 e remove a exclusão de majors desse pacote no Dependabot; runtime permanece Node 24 LTS e novas APIs exigem compatibilidade com ele.
- Publicação ativa imutável separada da edição: consulta/resources usam snapshot, rascunho não interrompe a publicação anterior. Publish com CAS e confirmação ligada à versão/base; alterações de segurança/cardinalidade suspendem pacotes afetados.
- Aprendizado automático gera candidatas parametrizadas; reuso exige confirmação humana e publicações vigentes. Legados sem evidência viram candidatas, retenção 90 dias e falha de captura não perde consulta.
- Contratos de clientes: `salvar_consulta` sem `confirmacaoHash` retorna preview, inclusive na entrada legada por pergunta/SQL/skill; aprovação por ID ou múltiplas skills exige confirmação e publicações exatas. `obter_skill` lê a publicação ativa por padrão e aceita `revisao=rascunho`; `statusRascunho` é separado de `status`.
- `metricasSaida` inclui unidade/moeda, arredondamento, tratamento de nulos, aditividade, dimensões permitidas e calendário de negócio. `COALESCE`/`ROUND` são aplicados pela IR conforme o contrato; metadados documentais não reescrevem SQL livre.

### Security — isolamento e cofre

- Credenciais somente no navegador: tools de cadastro/manutenção recusam argumentos, retornam URL; GET não consome nem emite Bearer, POST exige CSRF/reautenticação/vínculo, código hash de 256 bits/15 minutos. Rotação invalida Bearer anterior só na conclusão. Envelope AES-GCM v2 com key ID e recriptografia verificável.
- Recortes obrigatórios por lógica da AST, SQL somente leitura com funções permitidas e limites de complexidade, ambiguidade/fanout recusados. Inspeção/perfil omitem valores não classificados/pessoais/segredos; anexos vinculam origem física/publicações, quotas de bytes e autorização revalidada.
- Três portões vigentes em cache/exportação/entrega; Redis lease com proprietário e renovação atômicos, sem consulta concorrente após timeout com lease válido. Sessão MCP legada fixa; protocolo 2026-07-28 por requisição, Origin/Host/proxy configurados.

### Added — avaliação e migração

- 100 cenários sintéticos versionados, resultados PostgreSQL, harness explícito de IA consumidora com modelo registrado e critérios 100% segurança/lacuna e 95% suportados. Ensaio do harness não certifica modelo.
- Migrações 0028–0031: baseline técnico/suspensão de pacotes inseguros, setups legados invalidados, candidatos governados e snapshots imutáveis. Ensaios de banco novo e upgrades 0023/0027. Dependabot por PR, sem merge automático de majors.

### Added — operação confiável

- Migrations `0027`: caixa de alertas por acesso, webhook cifrado e outbox com lease/retry/dead-letter.
- Worker `worker:operacoes`, SLO configurável por ambiente, fila de revisão no fuso do acesso e tools de alerta/webhook confirmadas.
- Singleflight para consultas agregadas e certificação de migrations limpa + upgrade a partir de `0023` na CI.
- Propriedades determinísticas ampliadas para IR v1/v2 e dialetos suportados.

### Added — consultas inteligentes e governança

- IR semântico v2 (agregação/listagem) com compatibilidade v1, preflight compartilhado, `planoConsulta`, recomendações de orçamento e diagnóstico factual de cobertura.
- Governança temporal de anotações (`fonteTipo`, responsável, vigência/status) e `atualizar_anotacao` com confirmação.
- Preview/diff/hash SHA-256 e snapshots versionados para publicação atômica; deriva de schema com deltas e impactos.
- Auditoria estruturada, métricas por skill/origem/erro/cache e timings do hub amostrados por `PLUG_SERVER_TIMINGS_SAMPLE_PERCENT`.
- Contrato REST do hub gerado do OpenAPI (`plug_server/contracts/plug-mcp-rest-v1.json`) e verificação cross-repo na CI.
- Agenda opcional de revisão de conhecimento (`revisarEm`/`periodoRevisaoDias`) e fila segura em `listar_anotacoes`; não altera a vigência nem a autorização de consulta.
- Fixture sintética de consulta, testes gerativos determinísticos do IR, painel operacional anônimo em `listar_metricas_agente` e gate `npm run release:check`.
- Baseline de compatibilidade de campos de resposta do contrato REST: remoção silenciosa falha em `contract:check` e no teste MCP ↔ hub.

### Added

- Token MCP **por acesso** (`acesso.token_hash`): cada `CLIENT_TOKEN` ganha um Bearer distinto. `registrar_acesso` com identidade autenticada no navegador e token novo emite outro acesso; `adicionar_acesso` devolve `setupUrl` da persona nova **sem** trocar a sessão atual. A migration histórica `0023_token_por_acesso.sql` preservou o Bearer do acesso mais antigo e criou entregas legadas em `mcp_setup`; o fluxo atual utiliza `setup_operation` com validade de 15 minutos.
- Entrega persistida legada em mcp_setup foi substituída por setup_operation; 0029 invalida códigos pendentes, preservando Bearers existentes.

### Changed

- O Bearer autentica **exatamente um** acesso (sessão `(usuarioId, acessoId)`). Tools omitem `acessoId`; `acessoId` de outra persona → `VALIDATION_ERROR`. `listar_acessos` / `rotacionar_token_mcp` / `remover_acesso` / `initialize.instructions` / `skill_`* / resources são só desta persona. Não há inferência N>1 nem sufixo `_acesso8` no caminho autenticado. Auth deixa de usar `usuario_mcp.token_hash` (coluna removida no cutover). Cada persona no Cursor é **uma entrada de servidor MCP**.
- Catálogo de treino (skill, grafo, anotações, consultas aprendidas, sinônimos, lacunas, FTS) passa a ser por `acesso_id` — **1** `client_token` **= 1 persona = 1 catálogo**. Unique slug `(acesso_id, slug)`. Mesmo e-mail/`agentId` + outro token (`adicionar_acesso`) começa vazio e não vê as skills do primeiro. Resource `skill://{acessoId}/{slug}` (não `agentId` na URI). Cache `mcp:query:acesso:{acessoId}:`. Hub SQL continua `agentId` + `client_token` daquele acesso. Cutover `0022_catalogo_por_acesso.sql`: um acesso no `agentId` anexa; vários duplicam cópias independentes; órfãos (zero acessos) ficam com `acesso_id` NULL e são registrados em `NOTICE` (`grafo_dialeto`/`grafo_lock` apagam órfãos).
- `remover_acesso` in-memory apaga o catálogo daquele `acesso_id` (skills, grafo, anotações, consultas aprendidas, sinônimos, lacunas, snapshots, dialeto/lock), alinhado ao `ON DELETE CASCADE` do Postgres.

### Fixed

- `notifications/tools/list_changed` só acorda sessões **deste** `usuarioId` **e** `acessoId` (não quem só compartilha `agentId` nem persona irmã).
- Escritas do grafo chaveadas por UUID (`listColunas` / `mergeColuna` / `deleteRelacionamento`) recusam mutar linha de outro `acesso_id` mesmo com UUID furtado.
- Falha de rede até o hub (`ECONNREFUSED` / `fetch failed`) deixa de virar `INTERNAL_ERROR` opaco: a IA recebe `PLUG_SERVER_ERROR` + `source: plug_server_http` (retryable, **não** reescrever SQL). HTTP 400 e JSON-RPC `-326xx` também são transporte. Firebird/Sybase `Column unknown` / `not found` apontam `mapear_tabela` com o texto do motor.
- Envelope de erro da tool também preenche `structuredContent` com o mesmo JSON de `content[0].text` (`domain.toJson()`), sem vazar segredos.
- O consumo legado de setup por GET foi substituído: `GET /setup/{code}` somente apresenta o formulário; a conclusão exige POST autenticado, CSRF e claim atômico. Sessão legada fixa usuário/acesso e recusa troca de Bearer para outra persona no mesmo `mcp-session-id`; é necessária nova sessão.
- Wrap genérico do driver (sem detalhe ODBC) no `engineMessage` pede `mapear_tabela` / `obter_skill` e **não** reescrever SQL por `plug_server_http`. `SQLSTATE` `42703`/`42P01` entra no hint quando o motor já mapeia identificador Postgres.

### Added

- Envelope de `buscar_contexto` com cobertura `composta` e `fatias[]`: pergunta de gestão (vendas + receber + pagar) orquestra várias `consultar_dados` em vez de um único `SKILL_GAP`. Não cruza SELECT entre skills. Eixos sem skill ficam em `gap.termosAusentes`.
- `consultaSemanticaSugerida` de listagem certificada (`modo: listagem`) só com dimensões/filtros; `metricasSemOverlay[]` quando a medida não tem `definicao`. Não inventa overlay de `PrecoVenda`/`ValorTotal`.
- Tool `atualizar_persona`: `nomePersona` (teto 80) + `instrucoesPersona` (teto 4000) no **acesso** (usuário+agentId+token). Confirmação obrigatória; string vazia ou `null` limpa o campo; recusa texto que pareça senha/token/JWT. `listar_acessos` / `verificar_acesso` / resource `persona://{acessoId}` (Bearer) devolvem nome+instruções. `initialize` / `pre_treino` sempre um chapéu (`blocoPersonaUnico`): sem Bearer = só SQL; com Bearer = SQL + persona **deste** acesso. `adicionar_acesso` não troca o Bearer atual (o host pode manter `instructions` do chapéu 1 até reconectar; este token nunca ganhou um segundo chapéu). **Várias personas = vários acessos = vários Bearers**. O mesmo `agentId` entre usuários MCP diferentes pode ter textos diferentes. Persona oriente tom/uso; não recorta skills **neste acesso** (catálogo é por `acesso_id` — outro token é outro catálogo) nem licencia tabela/JOIN/`consultaPermitida`. Migration `0021_acesso_persona.sql` (colunas nulas).
- Tool `exportar_anexo`: converte 1 handle de `consultar_dados` (jpeg/png → conteúdo MCP `image`; PDF → `resource`). Mesmos portões de consulta. Inspeção devolve stub **sem** handle; handle legado de inspeção → `MIDIA_ORIGEM_INVALIDA`. Pessoal/segredo → `PRIVACIDADE_NEGADA` (não use inspeção como segunda via). Cap 64 handles/usuário em memória.
- `GET /docs/mcp/error-mapping.md` serve a matriz de erros (mesmo path de `documentationUrl`). Sem HTML extra.
- `faltas[]` de medida (`kind: kpi`, `nextAction: atualizar_skill`) quando há agregação/`SUM` sem `definicao` — **não** bloqueia `podeLiberar` nem o pacote mínimo. CAST de data/`Situacao` não conta como KPI.
- `publicar_skill` sem `politicaConsulta` devolve o default (`maxRows: 500`, `timeoutMs: 30000`) no `resumoPublicacao`; na confirmação o servidor grava esse default. Sem recorte empresa/filial nem `exigirRecorteTemporal`.
- Envelope de `TABELA_FORA_DO_ESCOPO` / `COLUNA_FORA_DO_ESCOPO` / `JOIN_DESCONHECIDO` com `category`, `nextAction` e `documentationUrl`. `inspecionar_consulta` devolve `columnsMetadata`.
- Envelope de `MULTI_SKILL_PARAMS` e `DIALECT_UNSUPPORTED` com `category`, `nextAction` e `documentationUrl`.
- Resources: `initialize` declara `capabilities.resources`; instructions citam `guia://paginacao`, `guia://dialeto/{mssql|sybase|postgres|firebird}` e `skill://` (só publicada) como chão comum de todo consumidor. Os guias (e prompts `pre_treino` / `consultar_com_skill` / `cadastrar_skill`) entram no bootstrap sem Bearer — `resources/list` já lista `guia://`. `skill://` e tools de skill continuam exigindo Bearer.

### Fixed

- `acesso_id` NULL no catálogo deixa de virar tenant `""`: órfãos ficam `null` e não entram em listagens por string vazia.
- `anotar_grafo` e `registrar_aprendizado` (anotação/sinônimo) recusam `skillId`/`alvoId` de outro acesso (`SKILL_NOT_FOUND`). `consultar_dados.aprendizado[]` com `skillId` de outro catálogo **não** falha a consulta: aviso `APRENDIZADO_IGNORADO` e o item não é gravado (o SQL que já rodou continua no envelope).
- `resolver_conflito` e `remover_anotacao` só aplicam ids do acesso resolvido: tabela/coluna/JOIN/anotação de outro catálogo (mesmo e-mail/`agentId`, outro `client_token`) não muta o outro grafo.
- `confirmar_coluna` com `confirmadoPeloUsuario` aplica `sensibilidade` (origem `confirmado_usuario`) mesmo se a coluna já for `validado_execucao`. Perfil/`enriquecer=completo` posterior **não** rebaixa a classe. Se a classe não gravar, a tool recusa com `VALIDATION_ERROR` em vez de `success: true` opaco.
- Lista após “não autoriza cruzar vendas, compras nem títulos” sai do haystack de cobertura: o segundo (e demais) termos da cláusula negada **não** entram em `termosEncontrados`. “Não agrega estoque” continua fora. `SKILL_GAP` por termo só negado não pede sinônimo.
- Descrições de `treinar_com_sql` / `validar_skill` diziam Firebird SQL livre → `DIALECT_UNSUPPORTED` (falso vs o use-case). Treino parseia o `sqlModelo` no dialeto do acesso; `FIRST`/`TOP`/`LIMIT` no modelo é `INVALID_SQL`. `DIALECT_UNSUPPORTED` continua só em `consultar_dados` / `inspecionar_consulta` / `validar_consulta` **com** `sql` depois de publicar.
- `atualizar_skill` com SQL novo apagava tabelas/colunas/JOINs extra do pacote (só reaplicava overlay de KPI). Agora une o AST ao rascunho persistido, como `validar_skill`. Grafo só `inferido` não entra. A revisão editável volta a `rascunho`; havendo publicação ativa utilizável, `status=publicada` e a consulta continua no snapshot anterior até republicação.
- Envelope `PACOTE_INCOMPLETO`: `nextAction` era o fallback `validar_skill`; agora é o da primeira falta bloqueante em `details.faltas[]`.

### Changed

- `parseSqlModelo` / `tryParseSelect` recebem `acesso.dialeto` no treino/criar/validar/atualizar (postgres `LIMIT`/`ILIKE` vs mssql; Firebird via parser transactsql, sem `FIRST` no modelo).
- Params: falta não bloqueante `kind: param` quando `tipo` ficou no default `string` (não impede `podeLiberar`). Passo 4 do pre-treino pede `tipo`.
- `confirmar_relacionamento` sem `skillId` devolve hint: o validador publicado não vê o JOIN até ele entrar no pacote.
- Treino: aviso `PAGINACAO_MODELO` se o `sqlModelo` já declara TOP/LIMIT/FIRST (`options.page` será recusado).
- Pre-treino e docs: identificar o GDBR do acesso e emitir SQL compatível é treino + IA — o `plug_server` (hub) não reescreve dialeto nem trata erro de linguagem SQL; `sql_engine` vem do motor/GDBR via `plug_agente`.
- `validar_skill` une o escopo do `sqlModelo` ao pacote já persistido (não reconstrói o allowlist pelo SELECT). Fotos/JOINs de `confirmar_coluna` / `confirmar_relacionamento` sobrevivem à validação.
- `IN (:lista)`: `validar_consulta` também expande o array; teto documentado de 64 itens (`VALIDATION_ERROR` `source: mcp`) — recorte a lista, não interpole literais. Transporte ODBC/hub de listas grandes permanece no `plug_agente`.
- `consultaSemantica` honra `tipoJoin` do pacote (`LEFT JOIN` se left; `INNER JOIN` se inner/ausente). `validar_consulta` aceita `options.page`/`page_size` e aplica a mesma regra de `consultar_dados` (TOP/LIMIT no SELECT externo incompatível com página). `consultaSemantica.limite` + `options.page` recusa misturar os dois padrões de corte.
- `enriquecer=completo`: até 16 `sql.execute` com concorrência 4 (`PERFIL_SQL_CONCURRENCY`), sem fundir `getPolicy` e sem retry. Falha isolada continua aviso; o teto 16 e o fail-closed não mudam.
- Cliente REST do hub: AbortSignal de `sql.execute` acompanha o wait do bridge (`options.timeout_ms` + 5s, teto 360s) — não corta em 35s; `PLUG_SERVER_HTTP_TIMEOUT_MS` é piso de login/policy (teto Zod 60s). Dois `http(s).Agent` (auth 4 / SQL 16). Probe TCP keepalive 30s (`keepAliveMsecs`); idle até o peer (Nginx `keepalive_timeout`). Sem retry de SQL. Borda Nginx (`proxy_read_timeout`, ex. 180s) ainda corta skills ~≥175s mesmo com abort MCP ~310s.
- Pre-treino (`initialize.instructions` / `pre_treino`): base comum = SQL no plug-server no dialeto configurado no acesso (`sybase`/`mssql`/`postgres`/`firebird` — não assumir mssql) + guias públicos + pacote publicado (fail-closed, sem embeddings). Estrutura via `obter_skill` / `skill://` (treino: `explorar_tabelas` / `mapear_tabela`); Firebird só consulta exemplo. Papel = persona do acesso (tom) + skills publicadas (pacote); SQL primeiro, persona depois; conflito → pacote. Canal com o hub é REST (Socket/relay de consumer fora de escopo). Clientes legados reconectam para recarregar `initialize.instructions`; no protocolo 2026-07-28 o contexto autenticado é recomposto por requisição.
- Pre-treino: nomeia `MULTI_SKILL_PARAMS` no cruzamento; a IA pergunta cardinalidade **e** tipo de JOIN (INNER vs LEFT) e passa `tipoJoin` em `confirmar_relacionamento` (omitir preserva o tipo do SQL/grafo). Continua agregar no banco e params `:nome`.
- Resource `guia://paginacao`: bloco comum distingue `truncated` (teto `max_rows`, caminho sem página) de `paginacao.hasNextPage` (próxima página).
- Mapper e `source`: `-32009` `invalid_payload` → `PLUG_SERVER_ERROR` + `plug_server_http` (reason ganha; não reescrever SQL). Haystack de motor só vira `INVALID_SQL`/`sql_engine` se reason ≠ `invalid_payload`. `-32001` ramifica (`missing_client_token` vs assinatura). Motor `-32101`/`-32102`/`-32107` → `INVALID_SQL`/`QUERY_TIMEOUT` + `sql_engine`. HTTP 404 de agentId nunca registado → `AGENT_UNAVAILABLE` sem retry (`verificar_acesso`). Instructions: `sql`/`sql_engine` corrige no pacote; transporte/`invalid_payload` não reescreve; 429/503 ≠ policy. SQL falho não persiste.
- Validador do pacote (`SELECT *`, AST, `COLUNA_FORA_DO_ESCOPO`, `JOIN_DESCONHECIDO`, `CONSULTA_SEM_RECORTE`, orçamento, `parseSqlModelo`, `DIALECT_UNSUPPORTED`, gates, `expandir_escopo`) preenche `source: sql` (`DomainError.pacote`). `PERMISSION_DENIED` do treino tagueia `client_token_rpc`.
- Hints de `TABELA_FORA_DO_ESCOPO` / `COLUNA_FORA_DO_ESCOPO` / `JOIN_DESCONHECIDO` / `CONSULTA_SEM_RECORTE` / `MULTI_SKILL_PARAMS` / `DIALECT_UNSUPPORTED` / `FANOUT_NAO_DECLARADO` dizem o que ajustar e para não repetir o padrão recusado.
- Falta `kind: kpi` também quando a coluna no pacote tem `papel=medida` e não há overlay em `metricasSaida` (hint via `atualizar_skill` / `registrar_aprendizado tipo=metrica`). `alvo` é `tabela.coluna`; duas tabelas com a mesma medida geram duas faltas. Overlay com o alias (mesmo sem `definicao`) continua só a falta de agregação. Não bloqueia `podeLiberar`. CAST, papel não-medida e quantidade/parcelas/`NroParc`/`NumParc`/`Qtde` não entram.
- Hint de cruzamento em `SKILL_GAP` (`Não cruze skills`) só quando a pergunta parece cruzamento (`cruzar`/`juntas`/`única consulta`). Skill publicada irrelevante (ex. faturamento) pede `listar_skills` sem esse sufixo.
- `consultaSemanticaSugerida`: IR só se o alias for medida no pacote; alias de quantidade fora salvo a pergunta falar de volume; score 0 sem IR certificado omite o esqueleto (não cai no primeiro `SUM`). Empate: IR, depois `definicao`, depois ordem.
- `fluxoTreino.pacoteMinimo` ignora aliases que não são medida (agregação). JOIN isolado coberto por composto vira `nextAction: remover_relacionamento` em vez de `confirmar_relacionamento`.
- FTS: stopwords `tente`/`fazer`/`erro`/`servidor`; `consultasAprendidas` genéricas (“tente fazer a consulta agora”) não entram no envelope. Continua **não** RAG.
- Cobertura certificada de `buscar_contexto` usa conjunto de stems portugueses (inflexão `titulo`/`titulos` pode autorizar `completa`); tokens extra na pergunta continuam a impedir. `candidatos[].termosAusentes` e hint de parcial citam até 3 stems. `params.tipo` sai do haystack JS (alinhado ao FTS). Telemetria `busca.skillNotPublished`. `skill_gap` continua sem insert quando já há skill publicada.
- `listar_lacunas` default só `status=aberta`. `buscar_contexto` faz upsert da `skill_gap` e arquiva quando a pergunta passa a `SKILL_NOT_PUBLISHED` ou consulta permitida.
- Após `initialize` autenticado, se SHA/versão mudou, o servidor envia `notifications/tools/list_changed`.
- `mapear_tabela` / deriva: assinatura no recorte do pacote (`validada`/`publicada`/`rascunho_revalidacao`). Remap de tipo compatível com o papel (ex. uuid→date) **não** rebaixa a skill.
- `inspecionar_consulta`: `SELECT *` cru de **uma** tabela do allowlist (`validada`/`publicada`/`rascunho_revalidacao` do acesso), sem WHERE; o servidor injeta TOP/LIMIT (teto 100, sem `options.page` e sem máscara). Colunas novas entram no grafo como `inferido` (`colunasNovasNoGrafo[]`) — `confirmar_coluna` (lote `colunas[]`); skill **publicada** já consulta, senão republicar. JOIN inventado continua recusado. Célula binária vira stub `kind: anexo` (sem blob). Treino e `consultar_dados` seguem nomeados + recorte.
- `INVALID_SQL` do motor (`-32009` com haystack de engine / `-32101` / `-32102`): `hint` e `details.engineMessage` trazem a mensagem (coluna/objeto inválido → `nextAction: mapear_tabela`). `-32009` `invalid_payload` não entra neste caminho.
- `consultar_dados`: `skillIds` opcional (omitido = união das skills **publicadas** deste acesso; se vierem, recortam). Sem SQL/IR/id, `sqlModelo` só com uma skill âncora. `consultaAprendidaId` reexecuta o SELECT gravado (exclusivo com `sql` e IR). Envelope `skillIds` = skills cujas tabelas estão no SQL.
- `confirmar_relacionamento` sem `tipoJoin` **não** grava `inner` por default por cima de LEFT já inferido do `sqlModelo` ou do grafo — preserva o tipo. `tipoJoin` explícito continua a valer.
- `consultaSemantica` v1: `metricas[]`, filtros `like`/`is_null`/`between`, `having[]`, `limite` (TOP/LIMIT, sem `options.page`).
- `confirmar_coluna` aceita `colunas[]` em lote e devolve `fluxoTreino`. Skill **publicada** consulta a coluna na hora (hint de inspeção não pede republicar).

### Fixed

- Migration `0022_catalogo_por_acesso`: o fan-out de catálogo para acessos extras copia `agent_id` nos INSERTs enquanto a coluna ainda é NOT NULL (depois o SQL a remove). Sem isso, `tabela_grafo` (e as demais tabelas do grafo) recusam a duplicação.
- `confirmar_coluna` `livre` não volta a `pessoal`/`segredo` no perfil (`enriquecer=completo`): só origem `confirmado_usuario` altera a classe; o segundo merge `validado_execucao` não reinfere privacidade.
- SQL Server **4104** (`multi-part identifier`) no wrap de paginação gerenciada entra no mesmo ramo de **1033**: `INVALID_SQL` `sql_engine`, hint TOP n sem `options.page`, `nextAction: consultar_dados` (não `validar_consulta`). O rewrite do wrap continua no `plug_agente`.
- Negação na descrição da skill (“Não agrega estoque”) não entra em `termosEncontrados` da cobertura certificada. Cláusulas compostas (“não … e não …”) não deixam o segundo complemento no haystack. `SKILL_GAP` por termo negado não pede sinônimo.
- `expandir_escopo` sem igualdade coluna=coluna aponta `nextAction: confirmar_coluna` (tabela isolada) em vez de convidar JOIN inventado.
- `npm run build`: `ToolContent` de resource exige `blob` ou `text` (união, como o SDK MCP). PDF de `exportar_anexo` já enviava `blob`.
- `expandir_escopo` em skill publicada não copia JOIN só `inferido` (`herdar_catalogo`) para o pacote: mesma origem mínima de `criar_skill`/`validar_skill` (`confirmado_usuario` / `validado_execucao`). O validador só autoriza o JOIN depois de `confirmar_relacionamento`.
- `descobrir_tabela` recorta colunas e arestas ao pacote publicado (fingerprints como `obter_skill`), sem vizinhança extra do grafo.
- Merge de relacionamento: origem mais fraca não sobrescreve `tipoJoin` (LEFT confirmado não vira `inner` de template).
- `treinar_com_sql` poda JOIN isolado coberto por composto no grafo (como `confirmar_relacionamento`).
- Envelope de anexo alinhado ao mapa: `PRIVACIDADE_NEGADA` só pessoal/segredo; handle de inspeção (legado) é `MIDIA_ORIGEM_INVALIDA`. `MIDIA_TIPO_RECUSADO` / `MIDIA_ORIGEM_INVALIDA` levam `source: mcp` / `stage: anexo` (tipo recusado é `category: validation`, não privacy). `CONSULTA_ORCAMENTO` de mídia aponta `omitir_coluna_ou_reduzir` (não agregar). Inspeção omite handle no stub (sem `put`).
- Detecção de anexo: coluna tipada (`image`/`blob`/`bytea`/`varbinary`/grafo `binario`) extrai sem piso de 96 chars; `Buffer`/`Uint8Array` reais não vazam via `JSON.stringify`; zip/ole sem magic não devolvem 2048 chars de base64. Handle de `inspecionar_consulta` não é exportável; pessoal/segredo não emitem handle nem bytes. `PRIVACIDADE_NEGADA` não aponta `inspecionar_consulta`. Teto local de mídia é `CONSULTA_ORCAMENTO` com `source: mcp` / `stage: anexo` (não o validador SQL). Store de handles cap por `usuarioId`; estouro de pixels vira `MIDIA_TETO`.
- Gzip do hub: após `gunzipSync`, o cliente HTTP remove `content-length` junto com `content-encoding` (o length era do corpo comprimido).
- `compose().close()` destrói o pool `http(s).Agent` do hub (`destroyHubHttpAgents`).
- Envelope: `JOIN_DESCONHECIDO` aponta `nextAction: obter_skill` (não `confirmar_relacionamento` — confirmar JOIN só no hint se o usuário ensinar). `DIALECT_UNSUPPORTED` aponta `inspecionar_consulta` sem `sql` (Firebird: consulta exemplo; não reenviar SQL livre).
- `consultaSemantica` reescreve alias do `sqlModelo` (`cr` / `[cr]`) na `expr` certificada para o nome físico da tabela no pacote. Não inventa JOIN.
- `validar_consulta` / `validar_skill`: o wrap `_validacao` tira o `ORDER BY` externo (SQL Server 1033). `ORDER BY` em `OVER (...)` permanece.
- `TABELA_FORA_DO_ESCOPO` em `descobrir_tabela` aponta `explorar_tabelas`; no validador SQL aponta `obter_skill`.
- `documentationUrl` do envelope deixa de apontar para 404: a matriz é pública no mesmo origin do `/health`.
- `consultar_dados` aceita `columnsMetadata` só com `name` (`type`/`nullable` opcionais no `outputSchema`). O MCP preenche as chaves (`null` ou tipo/`nullable` do grafo, também no alias de `column_ref`). `type` vazio do hub cai no grafo; CAST/agregação não copiam tipo.
- `consultar_dados.avisos` de `REGRA`/`METRICA`: com `tabelaId`, a tabela tem de estar no SQL mesmo se o `skillId` bater; teto de 3 `REGRA` ranqueia por overlap com tabelas/aliases do SELECT. Globais de processo e regras de outro domínio não entram.
- `skill://` não embute guia sybase quando não há acesso daquele `agentId`: omite `guiaDialeto` e avisa `DIALETO_AUSENTE` (não mente o dialeto). Com acesso, usa o dialeto real.
- `consultar_dados` com `page`+`page_size` em mssql: SQL Server 1033 do wrap gerenciado vira `INVALID_SQL` (não `PLUG_SERVER_ERROR`), com hint de `TOP n` sem `options.page`. O rewrite `OFFSET`/`FETCH` continua no `plug_agente`.
- `descobrir_tabela` omite nome que não é identificador SQL (título de anotação não vira coluna). `registrar_aprendizado` tipo=dicionário com título inválido grava a nota e não cria coluna no grafo.
- `buscar_contexto` com cobertura completa devolve `fluxoTreino` da skill publicada (`publicar_skill` feito). `SKILL_GAP` sem skill em andamento que cubra a pergunta omite o checklist (não finge `criar_skill` pendente) e o hint não pede sinônimo. Hint de cruzamento só na pergunta de cruzamento.
- `consultaSemanticaSugerida` ignora CAST/data em `metricasSaida`; só agregação. Sem medida certificada, sem overlap e sem IR no pacote, o esqueleto é omitido.
- HTTP 429/503 do hub usam `source: plug_server_http` (não `client_token_rpc`). HTTP 5xx com haystack `denied`/`permission` e sem RPC de policy fica `PLUG_SERVER_ERROR` + `plug_server_http` (não `PERMISSION_DENIED`). `consultar_dados` preserva `source`/`stage` no wrap de SQL não classificável.

### Security

- Controlador de treinamento manual confere a ACL Windows antes de gravar
  credenciais ou iniciar serviços, inclusive fora do lançador. Pastas com
  permissões adicionais são recusadas sem alteração automática das permissões.

- `sanitizeEngineMessage` redige JSON `"client_token":"..."` (aspas na chave), além de `client_token=` / Bearer / JWT.

## [0.2.0] - 2026-08-30

### Added

- Telemetria de `buscar_contexto` em `audit_log` (counts/enums: conhecimentos, slot narrativo, cobertura, permitida, gap, `listarSkills`) **sem** a pergunta. `listar_auditoria` devolve `telemetria` só nessa tool; `listar_metricas_agente.busca` agrega totais.
- `buscar_contexto.consultaSemanticaSugerida`: esqueleto (`metrica`/`dimensoes`/`colunaData`) só se `consultaPermitida` e houver KPI (`consultaSemantica` persistida ou `metricasSaida`). Entre skills com cobertura `completa`, escolhe o haystack de KPI (alias+definição+grão) com mais tokens da pergunta; empate: IR persistido, depois ordem. Prefira `consultar_dados.consultaSemantica`.
- `fluxoTreino.pacoteMinimo`: orientação para publicar uma tabela com WHERE ou agregação. **Não** afrouxa os gates (JOIN sem cardinalidade continua bloqueado).
- Template `herdar_catalogo`: tabela `pagar` e JOINs compostos empresa+filial (`pares[]`). Só grafo. Envelope `origem: "inferido"`, `publicaSkill: false` — não autoriza consulta.
- `buscar_contexto.conhecimentos[]`: evidência léxica ranqueada (regra, glossário, métrica, pergunta aprendida, skill, tabela). Teto 8 (1 slot reservado para regra/glossário/métrica com `skillId`), trecho truncado. Hit FTS entra mesmo sem substring JS; `ts_rank` desempatra. **Não** autoriza SQL — `consultaPermitida` continua só com cobertura certificada. FTS (`portuguese` + `unaccent`) + `ILIKE` no Postgres; sinônimo resolve skill por id/slug/nome **sem** concatenar UUID na tsquery. Nota com `skillId` inclui a skill em `candidatos` mesmo se o nome não bater. Após deploy, reconectar o cliente MCP.
- Tools `listar_conflitos` e `remover_relacionamento` (este com confirmação): o agente lista ids de conflito e apaga um JOIN pelo fingerprint, em vez de adivinhar.
- `faltas[]` (`kind`, `alvo`, `nextAction`) em `listar_skills` / `obter_skill`. `publicar_skill` sem confirmação devolve `publicado: false`, `resumoPublicacao` e `faltas[]` — não invente o resumo.
- Health injeta `GIT_SHA` / `SOURCE_COMMIT` / `GITHUB_SHA` no `sha` (PM2, Docker, CI). Snapshot de `tools/list` no teste de integração. Após deploy, reconectar o cliente MCP.
- Rate limit da tool MCP preenche `source: "mcp"` e `stage: "rate_limit"` no envelope de erro. Não varre todos os `DomainError`. `CACHE` continua aviso; `SKILL_GAP` de `buscar_contexto` permanece no envelope de sucesso.

### Changed

- Hint de `buscar_contexto` cita até 3 `consultasAprendidas[].id` para reuso em `obter_skill.consultasExemplo`. Cobertura parcial pede `registrar_aprendizado tipo=sinonimo` mesmo sem slot narrativo. Skill puxada só pela nota (cobertura `desconhecida`) com regra em `conhecimentos[]` também pede `obter_skill`. `McpServer.version` lê `buildInfo().version`.
- Busca de `consulta_aprendida` ranqueia só a **pergunta** (não o SQL) e só status `ativa`. Cobertura certificada segue nome/slug/descrição/params/`metricasSaida`/sinônimos — corpo e título de regra não completam cobertura. Postgres: `ORDER BY ts_rank` (score até `conhecimentos[]`); `ILIKE` de skill lê nome/descrição de params e alias/definição/grão de `metricasSaida` (não dump JSON nem `expr`). Tsquery vazia cai só no `ILIKE`. `grafoParaTreino.anotacoes` recorta tabela pela policy (id irresolvível omite); nota sem tabela só entra se for global ou a `skillId` estiver nos candidatos.
- `buscar_contexto` **não** devolve `sqlModelo` nem SQL de `consultasAprendidas` (só id/pergunta/skillIds/execucoes/status). O SELECT está em `obter_skill` (`consultasExemplo`). Após deploy, reconectar o cliente MCP.
- Skill `validada` com perfil incompleto: `fluxoTreino.proximoPasso` aponta a tool da primeira falta (`confirmar_relacionamento`, `mapear_tabela`, `listar_conflitos`…) e nunca fica `null`.
- JOIN composto substitui pares isolados (subconjunto) no grafo e no pacote. `uniaoEscopos` também descarta o subconjunto.
- `mapear_tabela` substitui tipo físico incompatível (ex. uuid vs data) sem apagar descrição, dicionário ou `sensibilidade` confirmada. Gate de publicação trata papel `data` em família uuid como falta de perfil.
- `inspecionar_consulta` aceita skill `validada` e `rascunho_revalidacao`; recusa rascunho. `descobrir_tabela` continua só em skill publicada.
- `buscar_contexto` mede cobertura por nome, slug, descrição, params e `metricasSaida` — **não** pelo `sqlModelo`. `SKILL_NOT_PUBLISHED` só se a skill em treino cobre a pergunta.

### Security

- Migration `0019_drop_unused_vector.sql`: `DROP EXTENSION IF EXISTS vector` (pgvector de `0008` nunca usado; busca é FTS).
- Migration `0017_fts_hardening.sql`: `SET search_path = pg_catalog, public` em `mcp_unaccent` / `mcp_skill_search_vec`; GIN composto `(agent_id, search_tsv)` com `btree_gin`.
- Migration `0018_fts_rank_trgm.sql`: pesos FTS A/B/C em `mcp_skill_search_vec` (nome/slug, descrição/params, métricas) e `pg_trgm` em nome/slug/pergunta. O papel da migration precisa de `CREATE EXTENSION` (`unaccent`, `btree_gin`, `pg_trgm`).

### Added

- Overlay de KPI (`metricasSaida[]`) em `criar_skill` / `atualizar_skill`: só aliases já no pacote (`definicao`, `grao`, dimensões, status, `colunaData`). Alias/expr inventados → `COLUNA_FORA_DO_ESCOPO`. `registrar_aprendizado` com `tipo=metrica` + `skillId` usa o mesmo overlay.
- `confirmar_coluna.skillId` persiste a coluna no pacote e sincroniza com o grafo. `sensibilidade` só com `confirmadoPeloUsuario`.
- Tool `despublicar_skill`: publicada → validada sem apagar pacote, params nem consultas aprendidas.

### Changed

- `listar_skills` devolve status, `motivoRevalidacao`, `podeLiberar` e `fluxoTreino` (sem `sqlModelo`). `rascunho_revalidacao` pede `validar_skill` e depois `publicar_skill`.
- Rename de `slug` em `atualizar_skill` exige confirmação; conflito → `CONFLICT`; não rebaixa status. Patch de KPI também preserva status.
- Perfil/`validado_execucao` não apaga `sensibilidade` confirmada pelo usuário.

### Fixed

- Typecheck: telemetria de `buscar_contexto` é espalhada em `Record<string, unknown>` antes do `LoggerPort`.
- JOIN composto: se o pacote tem `pares[]` com mais de um par, o `ON` incompleto é recusado (fallback v1 só quando não há composto). Evita consulta que “passa” com chave parcial.
- Pacote da skill recebe cardinalidade/tipo do grafo (`sincronizarEscopoComGrafo` em criar/validar/mapear/confirmar/treino); `uniaoEscopos` não apaga cardinalidade já gravada. Fan-out deixa de dar falso positivo em JOIN já perfilado.
- `PERFIL_TETO` é retomável: pula JOIN/coluna já perfilados (`details.retomavel: true`).
- Privacidade resolve alias → tabela física; `segredo` nunca sai (nem em `MAX`/`MIN`); `pessoal` só em `COUNT`. Fan-out também no `sqlModelo` (consulta exemplo / `skill_*`).
- Cache de consulta: chave e deriva usam prefixo `mcp:query:{agentId}:` — invalidar um agente não limpa os outros.
- `IN (:lista)` com array em `params` vira um placeholder por valor; lista vazia é `VALIDATION_ERROR`. Compilador semântico qualifica colunas quando há JOIN.
- `inspecionar_consulta` no Firebird executa a consulta exemplo (sem `sql`); SQL livre continua `DIALECT_UNSUPPORTED`.

### Added

- `sqlAccessState` / `sqlAccessSource` em `listar_acessos` (só cofre) e `verificar_acesso` (hub + policy).
- Envelope de erro com `source`, `stage`, `category`, `nextAction`, `documentationUrl` e `details`.
- `buscar_contexto.blockingReason: SKILL_NOT_PUBLISHED` distinto de `SKILL_GAP`.
- Pré-check `PRIVACIDADE_NEGADA` antes do hub; inspeção continua mascarando pessoal/sensível.
- Compilador semântico emite JOIN a partir de `pares[]`; IR persistido em `criar_skill` / sucesso de consulta.
- Contrato KPI em `metricasSaida` e `politicaConsulta` (migration `0015_politica_lacuna.sql`). Erros `CONSULTA_ORCAMENTO` e aviso `KPI_DESALINHADO`.
- Resources `guia://paginacao` e `guia://dialeto/{dialeto}`; `skill://` inclui IR, política e guia.
- Tools `listar_metricas_agente`, `registrar_lacuna_ferramenta` e `listar_lacunas`.

### Changed

- `publicar_skill` / `podeLiberar` bloqueiam `PERFIL_AUSENTE` (faltas de tipo/cardinalidade).
- Fan-out só nos JOINs do AST ∩ pacote; regex `valor|saldo` é fallback sem `metricasSaida`.
- Deriva automática após `mapear_tabela` (e treino se a flag estiver ligada); primeiro snapshot não rebaixa skill.
- Relacionamentos compostos nativos (`pares[]` + uma cardinalidade) no grafo, no pacote v2 e em `confirmar_relacionamento`. Migration `0014_relacionamento_composto.sql` com backfill do par legado.
- Tool `inspecionar_consulta`: amostra de até 100 linhas, finalidade obrigatória, mascaramento de PII/segredos por linhagem SQL, sem cache/aprendizado/paginação. `SELECT *` é expandido para colunas conhecidas.
- Tool `descobrir_tabela`: estrutura de skills publicadas (colunas, tipos, chaves, sensibilidade, relacionamentos) sem linhas nem DDL.
- Classificação persistida de coluna (`livre`/`pessoal`/`sensivel`/`segredo`) e mascaramento determinístico por sessão.
- Consulta semântica versionada (`consultaSemantica`: métrica, dimensões, filtros, período, ordenação) compilada só com elementos certificados no pacote.
- Detecção de deriva de esquema (`detectar_deriva_esquema`): impacta só as skills da tabela, invalida cache e move para `rascunho_revalidacao`. Não repara schema automaticamente.
- Progresso/cancelamento cooperativo de perfilamento (`cancelar_operacao`) e flags `MCP_INSPECTION_ENABLED`, `MCP_DISCOVERY_QUERY_ENABLED`, `MCP_SEMANTIC_QUERY_ENABLED`, `MCP_SCHEMA_DRIFT_ENABLED`.
- `GET /health` versionado (versão, SHA, buildTime, uptime) e `GET /ready` quando há banco.
- Erros `FANOUT_NAO_DECLARADO`, `FEATURE_DESLIGADA`, `OPERACAO_CANCELADA`. Códigos reservados `PRIVACIDADE_NEGADA` e `SCHEMA_DRIFT` (deriva devolve `drifted` sem throw; inspeção mascara em vez de recusar).

### Changed

- Validador de JOIN exige o conjunto de igualdades (com fallback legado de pares isolados). Cardinalidade composta é perfilada no recorte de empresa/filial.
- `confirmar_relacionamento` grava o recorte em que a cardinalidade foi validada (`escopoValidacao`).

### Security

- Inspeção e descoberta estrutural não persistem amostras. Segredos saem `[redacted]`; PII é pseudonimizada por sessão (`p_<hmac>`); texto livre sai `[texto oculto]`. Auditoria de inspeção grava só metadados (skill, finalidade, colunas).

### Added

- `confirmar_relacionamento.cardinalidade` opcional (`1:1`, `1:N`, `N:1`, `N:N`) para persistir a cardinalidade confirmada no grafo e no pacote de skill.
- Pacote versionado (`pacoteVersao`), `graoPorTabela`/`graoResultado`, `metricasSaida` no escopo da skill. Conhecimento skill-scoped (`anotacao_grafo.skill_id`) e `consulta_aprendida_skill` (multi-skill). Migration `0013_pacote_conhecimento.sql`.
- Validador fail-closed em UNION/INTERSECT/EXCEPT, subqueries em HAVING/JOIN/ORDER, alias desconhecido e coluna ambígua. Tokenizer ignora `::cast`, `@@var` e comentários.
- Erros `ALIAS_DESCONHECIDO`, `COLUNA_AMBIGUA`, `PACOTE_INCOMPLETO`, `MULTI_SKILL_PARAMS`, `METADATA_CONTRATO`.
- `columnsMetadata` (nome/tipo/nullable) no resultado, inclusive com zero linhas. Cache de consulta inclui `usuarioId`, token e versões da skill.

### Changed

- Perfilamento completo inclui colunas usadas em filtros do escopo e `PERFIL_TETO` informa fase, orçamento e pendências; `mapear_tabela` completa tipo/formato físico ausente sem rebaixar a origem validada.
- Cutover quebrável: `obter_skill` e `skill://` usam só o pacote da skill (não o grafo inteiro). Publicadas entram em `rascunho_revalidacao` no backfill (`npm run db:backfill-escopo`), que reconstrói o AST, associa consultas/anotações e limpa o cache `mcp:query:*`.
- Treino grava só nomes físicos (aliases/expressões viram métricas). `criar_skill`/`publicar_skill` exigem fatos confirmados no grafo do escopo. `confirmar_relacionamento` com `skillId` persiste o JOIN no pacote (só o grafo não libera consulta).
- `consultar_dados.pergunta` obrigatória. Cruzar skills exige SQL. Params opcionais viram `null`. Defaults de empresa/filial são imutáveis. Paginação exige metadata do agente.
- `buscar_contexto` ranqueia cobertura; SKILL_GAP da busca por termos pede `listar_skills` antes de desistir.

### Security

- Cache de consulta deixa de ser compartilhado só por `agentId`; isola usuário/token/policy/skill.

### Fixed

- Persistência Drizzle passa a atualizar cardinalidade de relacionamentos já existentes, alinhada ao repositório em memória.

### Added

- Tools dinâmicas `skill_{slug}` por skill publicada, com `tools/list_changed` ao publicar.
- Resources `skill://{agentId}/{slug}` e prompts `consultar_com_skill` / `cadastrar_skill`.
- Anotações MCP nas tools, `structuredContent` tabular, truncagem de células e teto `max_rows`.
- Validação de `Origin` (403), `WWW-Authenticate` RFC 6750, metadata de recurso sem AS, TTL do token MCP (`MCP_TOKEN_TTL_DAYS`).
- Rate limit por tool (tetos distintos para bootstrap, listagens e consulta/`skill_*`/`treinar_com_sql`).
- Coluna JSON `params` na skill (migration `0010_skill_params.sql`) e checklist `fluxoTreino` nas tools de treino/skill.
- `params[].tipo` (`string` / `number` / `date` / `boolean`); JSON antigo sem tipo vira `string`. Tools `skill_*` e `consultar_dados` recusam valor incompatível.
- `publicar_skill` exige `confirmadoPeloUsuario: true` depois do resumo no chat.
- Pre-treino de sessão: consultor; SQL no escopo; **aprendizado constante obrigatório** (`pergunta` em `consultar_dados`, `registrar_aprendizado` / `aprendizado[]`).
- Tool `atualizar_dialeto`: muda o lock do `agentId` e rebaixa skills a rascunho (exige `confirmadoPeloUsuario`).
- `consultar_dados` devolve `sqlExecutado`, `paramsUsados`, `asOf`, `recorte`, `escopoAplicado` e `avisos` para citar o número.
- Erros de skill/coluna/tabela inexistente sugerem nomes próximos (distância de edição).
- `consultar_dados` grava o SQL que funcionou (`consulta_aprendida`) e aceita `pergunta` + `aprendizado[]`. Tools `salvar_consulta` (exemplo curado) e `registrar_aprendizado` (regra/dicionário/sinônimo) permanecem para o que o servidor não infere do SELECT.
- Migrations `0011_conhecimento.sql` (`skill.escopo`, papel/perfil/cardinalidade, `acesso.escopo_padrao`/`timezone`) e `0012_aprendizado.sql` (`consulta_aprendida`, `sinonimo`, `lacuna_consulta`).
- Parser AST (`node-sql-parser`) no caminho de SQL livre. Firebird permanece só com consulta exemplo (`DIALECT_UNSUPPORTED`).
- Flag `MCP_SKILL_TOOLS_ENABLED` (default **desligado**) para tools dinâmicas `skill_`*. Cache de resultado agregado (`QUERY_CACHE_TTL_MS`; Redis se `REDIS_URL`).
- `treinar_com_sql enriquecer=completo`: cardinalidade, tipo/formato, perfil min/max/nulos e candidatos a dicionário (teto de 16 queries; falha vira aviso e não desfaz o treino). `validar_skill` aceita o mesmo `enriquecer=completo` para skills já publicadas.
- Persistência preguiçosa de `skill.escopo` derivado do `sqlModelo` (e script `npm run db:backfill-escopo`) para skills antigas com JSON vazio. `escopo.grao` sai do SELECT (GROUP BY ou colunas físicas).
- Suíte adversarial do validador de escopo (CTE, subquery, JOIN inventado no pacote, `SELECT *` aninhado, segundo comando). Teto de `GROUP BY` e aviso `LITERAL_TEXTO`.
- `obter_skill` inclui `consultasExemplo` no pacote. `asOf` usa o timezone do acesso. Aviso `PERFIL_AUSENTE` quando tipo/formato/cardinalidade estão vazios.
- Tool `remover_skill`: apaga a skill (rascunho ou publicada) com `confirmadoPeloUsuario: true`, libera o slug e desvincula consultas/sinônimos. O grafo do `agentId` permanece.
- `consultar_dados` devolve `paginacao` (`hasNextPage` / `hasPreviousPage`) quando `page`+`page_size` vão ao hub. `truncated` continua sendo só o teto de `max_rows` (caminho sem página).

### Changed

- Pré-treino de sessão e description de `consultar_dados` distinguem `truncated` (teto `max_rows`) de `paginacao.hasNextPage`, mandam `:nome` no fio e os dois padrões de corte (TOP/LIMIT vs `page`+`page_size` com só `ORDER BY`).
- Pré-treino de sessão (`initialize.instructions` / prompt `pre_treino`) passa a cobrir params nomeados (`:nome`/`@nome`, `:empresa`/`:filial`), os dois padrões de corte (TOP/LIMIT vs `options.page`+`page_size` com só `ORDER BY`), recorte/WHERE e leitura do retorno (`truncated`, `avisos`, tipos).
- `consultar_dados` exige skill **publicada**. Sem `sql`, executa a consulta exemplo; com `sql`, valida o SELECT da IA contra o escopo. Toda execução bem-sucedida persiste `consulta_aprendida` (envie `pergunta`). `asOf` no fuso do acesso.
- `buscar_contexto` devolve `consultaPermitida`, `consultasAprendidas` e `gap.code = SKILL_GAP` quando não há skill publicada capaz (o grafo fica só em `grafoParaTreino`). Se houver consultas aprendidas, o hint pede para reutilizar esses SQLs. Rascunhos vêm em `skillsParaTreino`; se houver skill em andamento, o gap pede para continuar o `fluxoTreino.proximoPasso`.
- `validar_consulta` liga placeholders ausentes a `null` no dry-run.
- `PLACEHOLDER_ESCOPO` só avisa se o grafo tem a coluna empresa/filial e o SQL não usa `:empresa`/`:filial`.
- Tools `skill_*` desligadas por default (`MCP_SKILL_TOOLS_ENABLED=true` para ligar). Resource `skill://` e `obter_skill` permanecem.
- Consulta ao ERP é **enforced** pelo escopo da skill publicada; grafo não licencia JOIN inventado.
- `buscar_contexto` casa a pergunta por termos (OR + ranking), incluindo `sqlModelo` e contrato de `params`.
- `treinar_com_sql` sempre grava origem `validado_execucao` após execução; `confirmadoUsuario` saiu da tool (`confirmar_coluna` segue para significado).
- `validar_skill` / `treinar_com_sql` aceitam `params` nomeados (ausentes → `null` na validação).
- `criar_skill` exige tabelas do SQL no grafo; `publicar_skill` só libera skill validada com params descritos, sem conflito pendente e com `confirmadoPeloUsuario`.
- `atualizar_skill` só volta a rascunho se o SQL mudar (e recusa tabelas fora do grafo); patch de nome/descrição/params **não** demove `validada`/`publicada`.
- `validar_skill` recusa params sem descrição. Skill **já publicada** permanece publicada após revalidar (`statusPreservado`).
- `consultar_dados` pede `max_rows + 1` ao hub e marca `truncated` só quando veio linha a mais.
- `treinar_com_sql` e `buscar_contexto` apontam a skill em andamento mais relevante (SQL igual ou tabelas do rascunho ⊆ SQL atual / ranking da query).
- JOIN sem igualdade no `ON` é recusado; CROSS JOIN não grava relacionamento `*`.
- SQL que o plug não classifica (`-32002` + classification) vira `INVALID_SQL` (não `ACCESS_REVOKED`); o hint de `consultar_dados` cita as tabelas enviadas. Paginação exige `ORDER BY` também no `sqlModelo` e só encaminha `page` com `page_size`.
- `mapear_tabela` agrupa o catálogo (uma linha por coluna), infere papel/formato e avisa `CATALOGO_TIPOS_AMBIGUOS` quando o JOIN de tipos explode (sybase em SQL Server). JOIN `mssql` usa `user_type_id` e `system_type_id`.
- `buscar_contexto` em pergunta de período (com `consultasAprendidas`) pede para reusar esses SQLs (params de data ou `OVER`/`LAG`) em vez de reinventar a comparação.

### Removed

- Alias `SERVICE_AUTH_EXPIRED` (401 do hub = só `USER_AUTH_EXPIRED`).
- Authorization Server / OAuth 2.1 próprio do MCP.
- Catálogo seed `Fonte` (`vendas` / `produtos` / `clientes`).
- Client de serviço (`PLUG_SERVER_CLIENT_*`) no ambiente de runtime.
- Variáveis `EMBEDDING_*` (config morta; busca semântica não está implementada).
- Código `ACESSO_PENDING` (nunca lançado; o real é `AGENT_ACCESS_PENDING`).

### Fixed

- Placeholders `@nome` no SQL enviado ao hub viram `:nome` (só params conhecidos; `@@variavel` intacta). Sem isso o agente não fazia bind de `@nome`.
- Paginação com `page`+`page_size` recusa também `OFFSET`/`FETCH`/`START AT`/`FIRST` no SQL, não só `TOP`/`LIMIT` do AST.
- `consultar_dados` com `options.page`+`page_size` deixava de falhar no hub: o adapter só envia `execution_mode: preserve` quando não há paginação (com paginação o hub usa `managed`). SQL com `TOP`/`LIMIT`/`FETCH`/`FIRST` e `page` é recusado no validador, sem round-trip.
- HTTP 401 do hub: `withHubAuth` invalida o JWT, reloga com a senha do cofre e **repete a operação uma vez** — a tool não falha no primeiro token vencido. Senha do cofre recusada vira `CREDENTIAL_STALE`.
- `putClientToken` deixa de ser API morta: roda após `registrar_acesso` / `adicionar_acesso` e quando `verificar_acesso` vê `approved`. Falha do PUT não desfaz o cofre; 403 com acesso `pending` é esperado.
- Tools de SQL/policy fazem **um** refresh do status no hub se o cofre ainda está `pending`, para não bloquear depois da aprovação do dono.
- Skill parametrizada (`:nome` / `@nome`) passa em `validar_skill` (envelope vazio) e só publica com `params.descricao`.
- Colunas do `ON` entram no grafo da tabela dona; SELECT sem qualificador quando há JOIN é recusado (`INVALID_SQL`).
- Expressão no SELECT sem `AS` é recusada em vez de gravar alias lixo no grafo.
- `tools/list_changed` notifica sessões que compartilham o `agentId`, não só o usuário que publicou.
- Rate limit por tool lê o IP no AsyncLocalStorage (sem corrida entre requests).

### Security

- Pino (e o logger de testes) redigem `senha` / `*.senha`. Instruções das tools pedem para a IA não ecoar senha nem `client_token` (o host MCP ainda pode logar argumentos).
- Origin mismatch no Streamable HTTP → 403. Bearer expirado → 401. Sessões MCP continuam in-memory (1 instância PM2).
- Imagem Docker deixa de usar `node:*-alpine` (1 crítica + 7 altas no npm/yarn empacotados). Runtime passa a ser Alpine 3.24 com o binário Node 24.19.0 musl, sem npm/npx/yarn.

## [0.1.0] - 2026-08-16

### Added

- Commit inicial do servidor MCP Se7e (Streamable HTTP, Express, Drizzle).

### Persona-v2 — identidade na conexão executora (em desenvolvimento)

- Contrato aditivo do hub 1.5.0: expectedSource e sourceIdentity v1 negociada,
  com recusa no MCP e no dispatch para agentes incompatíveis.
- SELECT dedicado no agente verifica hash/dialeto antes do SQL e da entrega;
  lançamentos verificam na conexão da transação antes de qualquer etapa.
- Prova esperada integra hash local e escopo do journal. Nenhum fallback ou
  retry sem prova; SQL Anywhere locator permanece recusado no fluxo v2.
- Deploy bloqueado; aceite integral e cadeia real ainda pendentes.
