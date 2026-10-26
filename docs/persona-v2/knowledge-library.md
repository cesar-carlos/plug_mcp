# Templates, datasets e DDL estrutural persona-v2

Biblioteca editorial do console de desenvolvimento. Não é publicação executável,
relatório aprovado, prova técnica ou concessão. Catálogo privado exige papel de
administrador, curador ou colaborador autenticado. Leitor e consumidor MCP comum
não recebem esse material editorial. Revogação bloqueia acesso e novas importações.

## Versões e API

Migration aditiva 0021 cria identidades, versões imutáveis com CAS e origem dos
rascunhos. Payload é cifrado no cofre v2 e seu hash SHA-256 é conferido na leitura.
Dataset referencia template/versão/hash exatos do mesmo catálogo; constraints
recusam vínculo entre catálogos e dataset como template. Nada antigo é compartilhado.

Importação recebe `slug`, `name`, `expectedVersion` e `payload`. Novo material usa
versão esperada zero; próxima versão exige a atual, sem mudar tipo/slug. Limite:
50 KiB UTF-8, dentro do teto HTTP JSON de 64 KiB. Auditoria transacional guarda
somente IDs/evento/autor, sem conteúdo, SQL ou linhas. Não captura consultas.

| Método | Rota abaixo de `/api/admin/catalogos/:catalogId` | Comportamento                                               |
| ------ | ------------------------------------------------ | ----------------------------------------------------------- |
| GET    | `/biblioteca?beforeId=...`                       | Vinte materiais, versão atual e cursor validado no catálogo |
| POST   | `/biblioteca`                                    | Cria identidade e versão 1                                  |
| GET    | `/biblioteca/:id?version=...`                    | Versão exata; sem versão, retorna a atual                   |
| POST   | `/biblioteca/:id/versoes`                        | Acrescenta versão por CAS                                   |
| POST   | `/importar-ddl`                                  | Interpreta declarações sem executar ou salvar padrão        |

Sessão Client, Host/Origin, CSRF e autoridade vigente são obrigatórios. ID/hash
não concedem acesso. Conflito preserva edição local; histórico não é sobrescrito.

## Templates

Payload `{kind: "template", content}` reutiliza a estrutura tipada do padrão,
com tabelas, campos, relações, regras e exemplos/variantes. Valida referências,
SQL e ausência de segredos. Exemplos importados ficam candidatos mesmo quando
a origem declara aprovação. Não converte SQL automaticamente entre motores.

POST `/api/admin/personas/:personaId/skills/template` recebe `catalogId`,
`templateId`, `templateVersion`, `templateHash`, `sourceId`, `sourceVersion`,
`dialect`, `exampleId`, `slug`, `name` e opcionalmente `dataset: {id,version,hash}`.
`additionalExampleIds` permite selecionar até 99 outros exemplos explicitamente,
sem repetição. Cada um precisa de variante no dialeto escolhido e do mesmo
contrato de parâmetros do principal (nome, tipo, obrigatoriedade e significado;
ordem não importa). Contrato diferente exige outro rascunho, sem conversão.
Responsável precisa administrar a persona e acessar o catálogo editorial.
Fonte ativa deve corresponder à versão/dialeto escolhidos explicitamente.

Cria **novo rascunho privado de consulta**, com origem/mapeamento na mesma transação
e exemplos selecionados candidatos. Variantes não selecionadas permanecem na biblioteca.
Não herda publicação, casos, aprovação semântica,
relatórios, prazo, credenciais, recortes de outra base ou permissões. Não adota
`sharedKnowledge` implicitamente. Versão nova não modifica rascunhos/skills antigos.

Revisar candidatos, conferir a base e testar/publicar são ações posteriores.

Após uma importação confirmada, **Abrir treinamento criado** leva à revisão
salva mais recente na persona de destino, inclusive se outra persona estiver
selecionada no console. A ação relê a lista autorizada de personas, fontes,
rascunhos e publicações antes de substituir o contexto. Destino suspenso ou
indisponível preserva a edição atual. Alterações pendentes exigem confirmação;
cancelar não muda a persona. A troca limpa token de teste, resultados e prévias,
sem publicar, executar SQL de negócio ou conceder permissões.

O campo de nome recebe foco quando o editor estiver disponível e desbloqueado.
Não há espera fixa, navegação automática após importar nem repetição da criação
do rascunho. A confirmação do POST valida identidade da persona, tipo e ID da
skill; resposta inválida orienta conferir a lista antes de outra importação.
Essas leituras de metadados não comprovam disponibilidade remota nem substituem
a validação vigente antes da consulta. A referência de abertura fica só em memória.

Adoção de padrão/perfil permanece no fluxo de inspeção/compatibilidade, separado
da cópia explícita de template editorial. Dataset associado registra material
de teste, sem criar/aprovar casos; seu conteúdo é revalidado contra o template
também ao importar. Runners genéricos continuam separados; nenhum runner pode
ler material sem reautorizar o catálogo.

## Importação por consumidor administrativo

Antes de importar, `obter_template_treinamento` lê uma versão editorial exata.
POST `/api/consumer/bearer/administration/templates/ler` (ou o mesmo caminho
com `oauth`) recebe `catalogId`, `templateId`, `templateVersion`, `templateHash`,
`sourceId`, `sourceVersion` e `dialect`. Não aceita seleção implícita da versão
atual. Exige `treinar`, delegação/consentimento, fonte ativa concedida e papel
editorial do responsável no catálogo, sob a transação autorizada.

Retorna nome, versão/hash de origem e estrutura declarada do template; exemplos
incluem somente variantes do dialeto escolhido. `executable: false` distingue
material editorial de pacote publicado. O hash identifica o original, não o
recorte de variantes retornado. Não devolve cifras, autoria privada ou linhas de
datasets; IDs de dataset são recusados. Não lista o catálogo, testa a conexão,
inspeciona estrutura, executa SQL, importa ou publica. Revogação/indisponibilidade
bloqueia a leitura; ler não reserva autoridade para a importação posterior.

`criar_rascunho_de_template` e POST
`/api/consumer/bearer/administration/skills/template` (ou `/oauth/administration/skills/template`)
usam o mesmo contrato de versões/hashes acima. Exigem `treinar` no token, teto
vigente da delegação no hub e consentimento OAuth quando aplicável. A fonte de
destino deve estar em todas as concessões, antes de procurar material editorial.
O responsável precisa manter papel colaborador, curador ou administrador naquele
catálogo; conhecer IDs/hashes não substitui esse acesso.

A persona é a autenticada, sem parâmetro para administrar outra. Criação do
rascunho, origem e auditoria compartilham a transação autorizada e sua revalidação.
Revogação, expiração ou autoridade indisponível impedem novas importações.
O consumidor recebe somente o rascunho e seus exemplos selecionados; não recebe
linhas do dataset. A operação não lista nem lê a biblioteca completa, administra
membros, publica catálogo ou concede execução. A gestão editorial, leitura de
versões e interpretação de DDL continuam no console autenticado. Essa importação
limitada não conclui o consumo delegado geral nem os runners.

Importação preserva IDs, intermediárias e sequência dos elos dos relacionamentos
N:N. Não transforma a relação conceitual em JOIN direto; faltas no caminho
impedem compilar a consulta. As declarações copiadas continuam sem prova técnica
ou autoridade herdada. [Contrato](shared-knowledge.md#relacionamentos-reversos-e-caminhos-executáveis).

## Datasets

### Preparar sementes de um caso de consulta

No editor de casos da consulta importada, **Carregar sementes do dataset de
origem** lê o dataset associado explicitamente à importação. POST
`/api/admin/personas/:personaId/skills/:skillId/sementes-dataset` recebe
`expectedRevision`, opcionalmente `dataset: {id,version,hash}`, e exige sessão Client, Host/Origin/CSRF, administração da
persona e papel editorial vigente no catálogo de origem. Não é tool MCP nem
rota Bearer/OAuth; não abre listagem ou leitura de outros datasets.

A origem persistida fixa fonte/versão/dialeto, template/versão e dataset/versão.
A leitura confere esses vínculos, hashes e integridade cifrada, incluindo o
hash do template referenciado pelo dataset. Fonte alterada, outra persona,
acesso revogado ou revisão divergente recusam a sugestão. Não há mudança de
origem automática. O vínculo continua usando o registro de origem 0021;
a migration 0043 acrescenta somente o índice da seleção paginada.

### Escolher uma versão de dataset

**Escolher outro dataset deste template** consulta POST
`/api/admin/personas/:personaId/skills/:skillId/datasets-caso`, com
`expectedRevision` e cursor opcional `after: {id,version}`. Retorna até vinte
referências de versões imutáveis, ordenadas por ID e versão decrescentes,
`nextCursor`, fonte e template fixados. Não retorna linhas, cifra, autoria
privada ou total global. O cursor precisa pertencer ao mesmo catálogo e à mesma
versão de template; cada página revalida sessão, fonte, revisão e papel editorial.
Índice aditivo 0043 sustenta o filtro/paginação sem reescrever dados existentes.

A lista inclui versões antigas e não escolhe a mais recente automaticamente.
Somente datasets vinculados à versão exata do template de origem são oferecidos;
outro template exige outro rascunho e mapeamento explícito. A lista comprova só
a referência declarada, não compatibilidade dos dados com o treinamento atual.

Selecionar uma opção não altera o caso. **Preparar sementes do dataset selecionado**
envia ID/versão/hash à leitura de sementes e exige confirmação para substituir
sementes existentes. O servidor revalida o conteúdo e seu enquadramento nos tipos,
campos livres e limites atuais. Hash incorreto, outra versão de template, fonte
alterada ou catálogo revogado recusam a leitura; a edição é preservada. Não há
conversão SQL ou de dados. Rascunho importado sem dataset inicial também pode
escolher um; sem escolha, a leitura padrão informa que não há dataset associado.
O botão de origem continua lendo a versão originalmente fixada na importação.

Escolha/carregamento não salvam casos, alteram a origem da importação, concedem
acesso ou produzem relatórios. A nova referência só entra no caso ao salvar
explicitamente. Trocar o dataset de um caso já vinculado exige sessão Client;
Bearer/OAuth conservam a origem salva e não podem reassociá-la. Listagem e leitura
de sementes continuam restritas ao navegador, sem tools de datasets.

Retorna referências exatas, `origin` e `fixtures` tipadas, com `executable: false` e
`technicalApproval: false`. Somente tabelas declaradas com nomes físicos e campos livres presentes
no treinamento atual; views, recursos duplicados, nomes incompatíveis e tipos
fora do runner são recusados. O limite menor do runner prevalece: dezesseis
tabelas e cem registros por tabela, sem truncamento. Inteiros seguros viram
texto exato; decimais, Unicode, booleanos e nulos conservam o valor. Datas e
datetime usam o envelope `date` existente do runner, sem modificar o texto;
formatos não aceitos e ponto flutuante exigem revisão, sem conversão implícita.
`generated` começa vazio e requer revisão humana, sem inferir identidade.

A interface copia as sementes e sua referência editorial para o formulário em memória; pede
confirmação antes de substituir sementes existentes e conserva a edição em
falha/recusa. Nome, parâmetros e resultado esperado não são inventados. A origem
exibida identifica o material carregado, não comprova que valores posteriormente
editados continuam iguais. Salvar o caso é ação separada por CAS; o caso guarda
os valores escolhidos, sem criar dependência executável ou relatório da biblioteca.
Essa leitura não altera revisão, casos, publicações ou concessões e não executa
SQL. O runner separado continua executando somente casos salvos e vinculados
às fixtures autorizadas; nunca lê a biblioteca implicitamente.

### Origem editorial no caso salvo

Casos de consulta podem guardar `editorialOrigin` no conteúdo de teste existente,
sem migration ou alteração retroativa dos casos anteriores. O formato
`dataset-case-origin-v1` fixa catálogo, fonte/versão/dialeto e referências
ID/versão/hash do template e dataset. `sourceSeedsHash` identifica as sementes
tipadas de origem; `caseSeedsHash`, as sementes escolhidas para o caso.
`modified` informa se os dois conjuntos diferem, sem julgamento semântico.

Cadastro de origem exige sessão Client. Cadastro e edição exigem nova conferência da origem
da importação, fonte, catálogo, papel e versões na mesma transação do caso.
O servidor ignora hashes/status alegados pelo navegador e recalcula ambos.
Referência falsa, origem indisponível ou fonte alterada recusam a gravação sem
alterar revisão/caso. Omitir a referência ao editar conserva a já registrada;
não há remoção ou reassociação silenciosa. Remover o próprio caso continua uma
ação separada autorizada, sem necessidade de reler as linhas do dataset.

O console mostra a referência ao reabrir o caso e distingue o estado da última
gravação das alterações ainda em memória. Bearer/OAuth não acrescentam origem a
casos: usam o console Client para isso. Edição delegada de caso já vinculado
preserva a referência e recalcula os hashes, com `treinar`, fonte/skill,
delegação/consentimento e papel editorial vigentes; não devolve linhas novas da
biblioteca. Casos antigos sem
origem continuam válidos, sem backfill ou autoria presumidos. A referência entra
no hash dos casos e portanto exige novo relatório quando alterada; não concede
autoridade, aprova testes ou cria dependência executável do catálogo. O runner
usa as sementes salvas e não relê linhas da biblioteca implicitamente.

A integração cobre sementes, escolha de versões do mesmo template e linhagem de consultas.
Operações e cruzamentos têm recortes próprios abaixo; não se presume suporte completo.

### Sementes editoriais para casos de operação SQL

O editor de caso SQL oferece **Usar dataset editorial nas sementes**. A seleção
explícita começa por uma consulta importada da biblioteca, na mesma persona,
fonte e dialeto da operação. Consultas sem origem de importação são recusadas;
sem dataset original associado, é necessário escolher uma versão. Listar consultas
não afirma que todas tenham material compatível.

POST `/api/admin/personas/:personaId/skills/:skillId/sementes-dataset-operacao`
recebe `expectedRevision`, `querySkillId`, `queryRevision` e, opcionalmente,
`dataset` com ID/versão/hash da mesma versão de template. Exige sessão Client,
CSRF, persona administrável, fonte ativa e papel editorial vigente no catálogo.
O console permite usar o dataset original ou **Escolher outra versão de dataset**.
A listagem reutiliza `datasets-caso` da consulta de origem, com revisão exata e
paginação explícita; limita as opções à mesma versão de template. O seletor não
escolhe automaticamente a versão mais recente. Preparar envia ID/versão/hash da
opção escolhida, que o servidor reconfere. Trocar consulta/versão ou reler a lista
descarta somente a prévia; não altera as sementes já aplicadas ao caso.
Falha mantém o caso e exige nova tentativa explícita; não reaproveita uma prévia
antiga como se fosse da nova seleção. Respostas de outro contexto/revisão são
descartadas, e nenhuma listagem ou preparação salva casos.

O seletor compartilhado de operações/cruzamentos invalida respostas e erros em
voo a cada mudança de persona, skill, revisão, fonte, publicação, consulta ou
dataset, inclusive quando a seleção volta ao valor anterior. A prévia e o erro
anterior são limpos imediatamente; as sementes já aplicadas ao caso permanecem.
Fechar o editor descarta a entrega tardia. A leitura pendente não é repetida nem
prometida como cancelada; outra tentativa exige sua conclusão e ação explícita.

O servidor reaproveita a leitura editorial autorizada, não o contrato de consulta.
Compara tabelas físicas e colunas declaradas com a operação, inclusive datasets
vazios/colunas só com nulos. Tipos precisam coincidir, sem coerção decimal/inteiro,
inferência de alias ou ampliação de escrita. Campos não livres são recusados;
o limite desta preparação continua em 16 tabelas/100 linhas por tabela.

A prévia retorna `executable:false` e `technicalApproval:false`. Aplicar substitui
somente sementes locais, preservando nome, parâmetros, resultado esperado e SQL
do caso. Salvar é separado, usa CAS e reconfere toda a origem. O formato próprio
`operation-dataset-case-origin-v1` fixa consulta/revisão, catálogo, fonte/versão,
dialeto, template/dataset por ID/versão/hash e hashes de sementes. O servidor
recalcula hashes e `modified`, ignorando essas declarações do cliente. Editar
sem reenviar a origem preserva a referência existente; não apaga a linhagem.

Cadastro/edição de casos SQL com essa origem são exclusivos do console Client;
Bearer/OAuth não podem acrescentar, reassociar ou editar esses casos vinculados.
Remoção autorizada continua separada, sem reler datasets. Casos sem origem
continuam válidos. Não há backfill, nova migration, relatório herdado, publicação
ou execução automática. O runner usa somente sementes salvas; alteração de caso
invalida a evidência anterior pelo hash/revisão existentes.

Esse caminho usa consulta importada como origem editorial. A alternativa direta
abaixo dispensa essa consulta. Cruzamentos usam o recorte por fonte posterior.

### Importação direta de sementes para operação SQL

**Importar sementes diretamente da biblioteca** permite selecionar catálogo e
dataset sem criar consulta intermediária. A listagem existente da biblioteca é
paginada e retorna metadados; páginas sem datasets ainda podem oferecer mais
itens. O console oferece a versão listada e permite indicar explicitamente uma
versão anterior. Preparar lê essa versão e envia sua referência exata; não adota
atualizações posteriores automaticamente nem mistura datasets.

POST `/api/admin/personas/:personaId/skills/:skillId/sementes-dataset-operacao-direto`
recebe `expectedRevision`, `catalogId` e `dataset: {id,version,hash}`. Exige sessão
Client, CSRF, administração da persona e papel colaborador/curador/administrador
vigente no catálogo. Fonte ativa e dialeto vêm do treinamento da operação; o
dataset deve referenciar template íntegro do mesmo catálogo, com versão/hash
exatos. O serviço valida tabelas físicas, colunas livres e tipos da operação,
inclusive sem linhas, reutilizando os limites de 16 tabelas/100 linhas por tabela.
Não infere alias, converte tipos ou amplia recursos/escrita.

A resposta `executable:false`, `technicalApproval:false` traz prévia e origem
`operation-direct-dataset-case-origin-v1`: catálogo, dataset/template imutáveis,
fonte/versão/dialeto e hashes das sementes. Não inclui consulta ou publicação
fictícias. Aplicar substitui somente sementes locais e sua referência editorial;
preserva parâmetros, SQL, nome e resultado esperado. A gravação do caso é uma
ação separada por CAS e reconfere acesso editorial, fonte, material e compatibilidade.
Hashes/`modified` enviados pelo cliente são recalculados. Omitir a origem ao editar
preserva a salva; revogação ou fonte alterada recusam a edição sem apagar o caso.

Cadastro/edição vinculados são exclusivos do Client no navegador; Bearer/OAuth
não recebem nova capacidade. Remover o caso continua possível com autorização
própria, sem reler material revogado. Casos antigos e o caminho por consulta
permanecem válidos, sem backfill ou migration. Runners usam as sementes salvas,
sem reler biblioteca, executar testes ou produzir relatórios durante a importação.
Mudança no caso exige nova evidência pelos hashes/revisão existentes.

Este recorte cobre sementes de operações, não importação de contratos/steps.
A composição e a origem direta de cruzamentos têm contrato próprio abaixo;
homologação ampliada nos três motores continua pendente.

### Datasets por fonte em casos de cruzamento

Somente casos **SQL pelo transporte em fixtures isoladas** aceitam origem
editorial. Em cada base, o responsável escolhe uma consulta publicada que já
participa do cruzamento, lista sua consulta importada e seleciona o dataset
original ou uma versão do mesmo template. Preparar e aplicar são ações separadas;
aplicar substitui apenas as sementes daquela base. Não altera SQL, parâmetros,
plano, resultado esperado nem as sementes/origens das demais fontes.

POST `/api/admin/personas/:personaId/skills/:skillId/sementes-dataset-cruzamento`
recebe `expectedRevision`, `publicationId`, `querySkillId`, `queryRevision` e
`dataset` opcional (ID/versão/hash). Exige sessão Client/CSRF, mesma persona,
acesso editorial vigente, fonte ativa e todas as dependências do cruzamento
vigentes. A consulta escolhida deve corresponder à publicação fixada no contrato;
treinamento atual divergente do snapshot publicado é recusado, sem reassociação.
Essa conferência compila o grafo com entradas vazias, sem enviar SQL às fontes.

Cada fonte recebe `federation-source-dataset-v1`, com consulta/revisão,
publicação/hash, fonte/versão/dialeto e referências imutáveis de template/dataset.
O caso agrega essas referências em `federation-dataset-case-origin-v1`, uma por
fonte, até quatro. Pode misturar fontes com sementes manuais e editoriais, mas
não funde automaticamente vários datasets da mesma fonte. Nova escolha substitui
somente a origem dessa fonte.

Salvar reconfere CAS, plano, fontes exatas sem duplicatas, publicações, papel
editorial e material original. Recalcula `caseSeedsHash`/`modified` por fonte;
hashes enviados não certificam nada. Omitir referências anteriores não apaga sua
linhagem. Cadastro/edição vinculados exigem Client; remoção autorizada é separada.
Mudança de fontes que torne a linhagem incompatível exige novo caso, sem converter
silenciosamente o histórico. Casos sintéticos de combinação recusam esse formato.

Não há migração, publicação, relatório ou execução automática. Runner continua
usando apenas sementes salvas em fixtures próprias. Importação direta e combinação
explícita são alternativas descritas abaixo; homologação ampliada nos três motores
continua separada.

### Composição explícita e importação direta para cruzamentos

O seletor direto da biblioteca agora está disponível também em cada fonte dos
casos de transporte de cruzamento. Escolher a consulta publicada fixa o escopo
exato de tabelas/colunas livres daquela publicação; não exige consulta importada
nem usa alterações ainda não publicadas do rascunho. Todas as dependências do
cruzamento precisam permanecer vigentes. A escolha não concede execução.

Em operações e cruzamentos, **Adicionar versão à combinação** fixa catálogo e
ID/versão/hash do material em uma lista local ordenada, com até quatro itens por
fonte. A mesma versão não pode aparecer duas vezes. O responsável pode remover
itens e escolher outros catálogos com acesso vigente. **Preparar combinação de
datasets** reconfere o conjunto; selecionar/adicionar/preparar não altera o caso.
Aplicar substitui somente as sementes/origem daquela fonte; salvar é separado.

POST `/api/admin/personas/:personaId/skills/:skillId/compor-sementes-datasets`
recebe `expectedRevision`, `materials: [{catalogId,dataset:{id,version,hash}}]`
e `publicationId` obrigatório para cruzamento, ausente para operação SQL. Exige
Client/CSRF, responsável da persona, revisão atual e papel editorial em cada
catálogo. Para SQL, confere os tipos declarados na operação; para cruzamento,
confere o escopo publicado e tipos editoriais do template, sem alegar prova de
tipos físicos que o contrato da consulta não contém.

Tabelas diferentes são reunidas. Tabela física repetida só concatena linhas
quando catálogo/template/versão/hash e nomes/tipos das colunas são idênticos.
Preserva a ordem de seleção e de linhas, inclusive linhas repetidas; não deduplica,
faz JOIN, infere identidade ou resolve conflitos. Essas linhas podem representar
casos deliberados de falha de constraint; somente o runner isolado poderá prová-los.
Tipos incompatíveis, templates distintos para tabela homônima ou excesso de
16 tabelas/100 linhas por tabela recusam toda a preparação, sem truncamento.

SQL usa `operation-dataset-composition-v1`; cada fonte direta de cruzamento usa
`federation-source-dataset-composition-v1`, dentro do agregado já existente.
Ambos guardam fonte/versão/dialeto, todas as referências editoriais e hashes de
cada material e da combinação. Cruzamento fixa também publicação/hash. Salvar
reconfere o conjunto, plano/fontes, autoridade e ordem; recalcula hashes/`modified`
em vez de aceitar os enviados. Omitir origem preserva a salva. Revogação de
qualquer catálogo ou dependência bloqueia edição; não apaga histórico nem permite
retry de efeitos. Não há migration, nova capability ou execução automática.

O console oferece **Criar dataset com formulário** ao abrir uma versão salva de
template. A referência ao ID/versão/hash é fixa; o formulário seleciona somente
campos livres com tipos lógicos reconhecidos. Proveniência e eventual referência
de autorização são explícitas. Valores vazios não viram zero/nulo; nulo requer
escolha própria e coluna anulável. Booleanos são selecionados e decimais conservam
texto exato. Edição fica em memória, participa da proteção de navegação e é
preservada em erros do servidor. JSON continua disponível como opção avançada,
inclusive para editar versões existentes. O formulário não executa SQL nem cria
casos ou relatórios aprovados.

Payload fixa template/versão/hash, proveniência e tabelas lógicas. Proveniência
é `synthetic` com descrição ou `authorized` com descrição e `authorizationRef`
explícita. Declaração exige revisão humana; não comprova automaticamente a origem.

Tabelas têm `tableId`, `columns: [{name,type}]` e `rows` na ordem exata. Apenas
campos `livre` do template são admitidos. Até mil linhas acumuladas, vinte mil
células e 50 KiB. Recusa duplicações, colunas ocultas, linhas desalinhadas e
valores incompatíveis. Nulo exige coluna anulável; inteiro deve ser seguro,
data válida, datetime UTC e decimal usa texto exato, sem float. Não extrai
material de logs, auditoria ou consultas operacionais.

O tipo de cada coluna deve corresponder ao tipo lógico do template, mesmo em
datasets sem linhas. Aceita `string`/text/char/varchar/nchar/nvarchar (também com
comprimento), integer/int/smallint/bigint, decimal/numeric (também com precisão e
escala), number/real/float/double, boolean, date e datetime. Tipos desconhecidos
ou ambíguos como `timestamp` exigem revisão explícita do tipo lógico; não se
presume a interpretação de outro motor. Isso não converte SQL ou tipos nativos.
Precisão/escala decimal declaradas são conferidas como texto, sem arredondar
ou truncar. Essa validação editorial não comprova todos os limites nativos,
constraints, unicidade ou compatibilidade com a base real.

Comprimento lógico explícito de texto também é conferido, contando pontos de
código Unicode (não bytes nativos, unidades UTF-16 ou grafemas). Declarações de
comprimento zero, maior que 2.147.483.647 ou inseguro são recusadas mesmo sem linhas.
Não há truncamento automático. Charset, collation e limites nativos dependem
da inspeção e dos testes no motor de destino.

```json docs:knowledge-dataset
{
  "kind": "dataset",
  "templateId": "11111111-1111-4111-8111-111111111111",
  "templateVersion": 1,
  "templateHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "provenance": { "kind": "synthetic", "description": "Material artificial" },
  "tables": [
    {
      "tableId": "orders",
      "columns": [
        { "name": "id", "type": "integer" },
        { "name": "amount", "type": "decimal" }
      ],
      "rows": [[1, "10.25"]]
    }
  ]
}
```

IDs/hash são ilustrativos, sem correspondência com ERP ou catálogo real.

## Gramática de DDL

Entrada `{system,label,dialect,ddl}`: arquivo UTF-8 ou texto, até 50 KiB. Parser
próprio não tem executor ou conexão; não interpreta um motor por fallback de outro.
Qualquer trecho fora da gramática recusa integralmente o arquivo.
O carregamento de arquivo no navegador exige UTF-8 válido; bytes inválidos são
recusados sem substituição silenciosa de caracteres ou perda do texto em edição.

Suporta nos quatro motores `CREATE TABLE`, colunas, PK/UNIQUE/FK inline ou de
tabela, constraints nomeadas, chaves compostas e `ALTER TABLE ... ADD` dessas
constraints em tabela declarada no mesmo arquivo. Nomes canônicos minúsculos,
também em aspas duplas/colchetes; comentários simples e `;`. MSSQL aceita `GO`
entre declarações. Tipos comuns: int/integer/smallint/bigint, decimal/numeric,
char/varchar/character varying, real/float/double precision, date/time/timestamp.
Variantes explícitas incluem UUID/boolean/text no PostgreSQL, nchar/nvarchar/
datetime no MSSQL e boolean/blob no Firebird; conjunto fechado no interpretador.

Constraints inline aceitam `CONSTRAINT nome PRIMARY KEY`, `CONSTRAINT nome UNIQUE`
e `CONSTRAINT nome REFERENCES tabela(coluna)`, também em sequência na mesma
coluna, depois da nulabilidade opcional. O nome declarado é preservado. Nomes
explícitos repetidos na mesma tabela, inclusive entre chave e FK ou entre
CREATE/ALTER, recusam o arquivo inteiro. IDs de chaves anônimas não colidem com
nomes explícitos posteriores. A PK declara nulabilidade e grão, mas seu status
continua `unknown`; nenhuma dessas declarações comprova enforcement no banco.

Comprimento e precisão/escala são declarações. Defaults, CHECK, identidade,
sequências, índices, views, tipos de usuário, funções, strings, scripts, DML,
DDL destrutivo e extensões fora dessa lista são recusados. Não equivale a aceitar
toda a gramática nativa. O arquivo nunca é executado.

Precisão/escala decimal e comprimento explícitos são conservados também no tipo
lógico declarado (`decimal(18,2)`, `varchar(40)`), além da representação nativa.
Assim, depois da revisão humana, um dataset não perde o limite decimal recebido
do arquivo. Isso continua sendo declaração, sem prova do banco.

Retorna conteúdo, hash do arquivo, avisos, `technicalEvidence: false` e
`semanticReview: false`. Campos ficam `inferido`; constraints, `unknown`.
PK declarada fornece grão declarado; sem PK, grão fica vazio e exige escolha
humana antes de salvar padrão/template. FK conserva pares ordenados e associação
declarada N:1, ainda sujeita a revisão e prova. Não infere N:N ou significado.

O resultado respeita os limites do modelo compartilhado: nomes e IDs limitados,
até dezesseis pares por FK e até 128 relacionamentos. A tabela técnica reservada
`se7e_source_identity` não pode ser importada como conhecimento de negócio.

Console aplica somente a novo rascunho em edição após confirmação de descarte.
Não salva/publica/adota sozinho. Existência, tipos e enforcement precisam de
inspeção pelo hub/agente antes da adoção executável. Não habilita DDL de negócio.

Aceite integral para clientes permanece bloqueado; o servidor de teste segue
DV2-017. [Plano restante](remaining-plan.md) e [aceite](acceptance.md) conservam
os demais gates.
