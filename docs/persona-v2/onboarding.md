# Criar persona, conectar bases, treinar e consultar

O console `/app` da entrada `dev:persona-v2` oferece o fluxo inicial de consultas,
após `npm run web:build`. A entrada principal ainda é legada. Deploy permanece
bloqueado. Navegação, tokens, consulta paginada, execução de cruzamentos já
publicados e revisão/aprovação de operações estão no [contrato do console](console.md).
Cadastro e gestão de integrações, editores dos quatro tipos de skill e
concessões SQL/externas estão disponíveis em desenvolvimento. Manutenção
delegada, curadoria completa e aceite operacional permanecem no
[plano restante](remaining-plan.md).

O painel **Conhecimento compartilhado** permite criar catálogo privado, conceder
papéis, editar formulários estruturados ou importar JSON revisado, salvar/publicar
padrões, comparar versões
e suspender. A publicação exige curador e confirmação do conteúdo. A associação
executável de uma versão à fonte ainda depende da inspeção e conferência estrutural
pelo hub/agente; não copie um padrão para presumir compatibilidade ou autorização.
[Contrato e pendências](shared-knowledge.md).

## Percurso

Na **Visão geral**, o roteiro apresenta oito etapas derivadas dos registros
reais, com motivo e ação direta. Treinamento privado não exige catálogo Data7.
Conclusão histórica não prova disponibilidade atual; **Atualizar roteiro** não
executa SQL nem marca etapas manualmente.

Em **Tokens e conexões**, **Testar conexão** autentica o Bearer em memória,
confere a persona e descobre somente capacidades concedidas. Não executa SQL.
Use **Verificar acesso à fonte** para os portões remotos; depois escolha uma
consulta publicada e valide/execute explicitamente. **Histórico** permite
filtrar os metadados realmente registrados, sem revelar consultas ou segredos.
Detalhes e limites: [console](console.md#conexão-e-diagnóstico-do-consumidor).

1. Entre com a conta Client responsável; sessão administrativa de 15 minutos.
2. Crie nome, especialidade e orientações da persona, antes de qualquer fonte.
   A base técnica de SQL e uso do plug_server já está disponível automaticamente.
3. Adicione várias fontes com nome/finalidade/ambiente e `AGENT_ID`, `CLIENT_TOKEN`,
   `CLIENT_EMAIL`, `CLIENT_PASSWORD`, `DIALETO`. O banco vem da policy completa
   do agente; policy sem banco obrigatório é recusada. A API aceita `database`
   opcional para conferência exata, sem substituir a informação autorizada.
   O agente confirma motor e identidade física por `sql.describeSource` v1,
   encaminhado pelo hub. Dialeto divergente ou prova ausente/incompleta recusam
   cadastro. SQL Anywhere exige UUID provisionado manualmente pelo DBA, conforme
   [DV2-007](decisions.md#dv2-007--uuid-provisionado-no-sql-anywhere); locator ou
   marcador ausente/inválido são recusados, sem DDL automático.
4. Treine cada consulta escolhendo a fonte e informando tabelas, grão, colunas,
   significado/classificação, relacionamentos/pares/cardinalidade, regras,
   parâmetros, modelo SQL principal e exemplos adicionais. Não há catálogo de ERP semeado.
   Para views, selecione explicitamente **View** em **Tipo do recurso**. A seleção
   não descobre a estrutura nem substitui a permissão técnica sobre views.
   Para N:N, identifique os elos diretos e escolha intermediárias e elos na ordem
   do percurso. A associação conceitual não permite JOIN direto entre extremidades.
5. Salve o rascunho, revise o pacote/alterações e confirme publicação vigente.
   Ao importar template pela biblioteca, **Abrir treinamento criado** atualiza o
   destino e abre a revisão salva mais recente; não publica nem executa a skill.
   Se o rascunho veio de template com dataset associado, o editor de casos pode
   [carregar sementes para revisão](knowledge-library.md#preparar-sementes-de-um-caso-de-consulta),
   sem salvar casos, calcular resultado esperado ou executar o runner pela interface.
   Defina explicitamente a data futura da revisão; ela não recebe prazo padrão.
   Edição invalida preview; servidor verifica hash, revisão e prazo. Consultas
   sem casos mostram aviso; casos obrigatórios exigem relatório atual.
6. Para o primeiro teste, emita token selecionando explicitamente as fontes e
   skills de consulta publicadas, com `select`, sem administração ou escrita.
   O console também oferece outras concessões, sempre por escolha explícita.
   Usa capacidades da publicação ativa,
   inclusive quando houver rascunho posterior. Publicar não amplia tokens antigos.
7. Valide SQL pelo envelope vazio ou consulte registros reais pelo modelo/SQL
   adaptado. O console pagina até 100 linhas por página e informa origem, horário e completude.
   Resultado parcial não representa o total.
   Confira os parâmetros da publicação. Ao sair de Consultas, valores e escolhas
   de nulo/vazio/omissão são descartados e precisam ser informados novamente.

Senha e token da fonte são descartados após tentativa de cadastro. Bearer,
treinamento e resultados ficam só em memória. Troca de persona/logout/expiração
descartam contexto; edição pendente pede confirmação. Respostas atrasadas são
abortadas/ignoradas. Copie o Bearer antes de sair: não fica no storage do navegador.

## Roteiro de teste manual do treinamento

A [correção de troca de base e candidato atualizado](validation/2026-10-23-query-source-knowledge-reset.md)
identifica a imagem local mais recente, os 61 casos do console e a jornada
persistente de treinamento nos três motores. Para iniciar uma sessão humana,
use esse ID explícito e uma fixture nova; os ensaios automáticos foram encerrados.

A [consolidação do candidato](validation/2026-10-23-training-candidate-consolidated.md)
identifica a imagem local testada, revisões, resultados e limitações. Use o
procedimento de sessão com fixture nova quando iniciar o ensaio; os testes
automáticos não deixam uma sessão humana aberta nem removem o bloqueio de produção.

A [repetição integral das jornadas compartilhadas](validation/2026-10-23-shared-knowledge-journey-budget.md)
registra 85 casos aprovados na mesma imagem local, com os limites e a falha
anterior preservados. Use a identidade exata do candidato registrada na evidência;
uma aprovação automática não substitui a conferência humana deste roteiro.

Use a [distribuição candidata isolada](candidate-distribution.md), com hub,
agentes e bases dedicados. Confirme a revisão/ID da imagem antes de começar.
Este roteiro não libera produção e não substitui a matriz de aceite. HTTPS e
conexão ChatGPT têm validação manual própria no [contrato OAuth](oauth.md).

Primeiro percorra treinamento privado; catálogo Data7 é opcional e pode estar
vazio. Use estrutura e regras fornecidas e revisadas, sem inventar entidades
do ERP. Registre evidências com IDs/versões, horários, resultado e impedimento;
segredos entram apenas no navegador e não devem aparecer nas evidências.

| Ação manual                                     | Resultado a conferir                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Criar persona sem fonte                         | Persona recuperável e roteiro apontando o próximo passo, sem exigir base antecipadamente.                             |
| Cadastrar duas bases dedicadas                  | Cada vínculo mostra dialeto/identidade próprios; erro de uma não cria ou reassocia a outra.                           |
| Salvar treinamento de uma fonte                 | Tabelas, campos, grão, relacionamentos, exemplos e parâmetros permanecem no rascunho salvo.                           |
| Publicar com prazo humano                       | Preview corresponde ao conteúdo revisado; casos obrigatórios precisam de relatório atual do runner separado.          |
| Emitir dois tokens com fontes/skills diferentes | Descoberta de cada consumidor respeita as concessões; nova publicação não amplia token antigo.                        |
| Testar conexão e validar SQL                    | Autenticação/validação ficam distintas da execução; essas ações não produzem uma resposta comercial.                  |
| Executar consulta publicada e paginar           | Fonte, publicação, horário e completude acompanham os dados; confira valores com a referência autorizada da fixture.  |
| Editar rascunho após publicação                 | Nome, SQL e capacidades executados continuam sendo os do snapshot publicado até republicação explícita.               |
| Revogar um token                                | Próxima descoberta/consulta/download é recusada; o outro token independente permanece sujeito às próprias concessões. |

Para conhecimento compartilhado, acrescente inspeção, compatibilidade e adoção
explícita da versão no rascunho. Metadados insuficientes devem impedir a adoção
executável; nenhum aviso é licença para ignorar a prova. Revisão semântica e
execução técnica são confirmações diferentes.

Compare também vazio, falha técnica, recusa e resultado parcial: nenhum deve
virar zero, total ou valor presumido. A resposta da IA consumidora será avaliada
separadamente; a interface não hospeda IA. Lançamentos e ações externas exigem
seus ensaios próprios em fixtures e aprovação aplicável, sem DML experimental
em bases operacionais.

## Editar a persona e manter as fontes

Ao trocar a base no editor de consulta, confirme a remoção do vínculo
compartilhado anterior. Cancelar mantém a escolha original. Confirmar não
transfere a prova/perfil à nova fonte nem altera a publicação ativa; revise o
treinamento e faça nova inspeção/adoção quando necessária.

O console permite editar nome, especialidade e orientações da persona, inclusive
sem fontes. A edição usa `expectedVersion`: duas gravações da mesma versão não
se sobrescrevem. Atualizar a persona invalida previews anteriores e trabalho em
voo, mas não altera snapshots publicados nem amplia concessões dos tokens.

Em **Gerenciar base**, edite nome, finalidade, ambiente e recortes obrigatórios.
Salvar incrementa a versão da fonte e suspende suas publicações e cruzamentos
dependentes, preservando as fontes independentes e os vínculos de outras personas.
O rascunho é conservado; ajuste os filtros obrigatórios, revise e publique novamente.
Recortes exigem tabela/coluna físicas, parâmetro reservado `__scope_` e valor tipado.

**Trocar credenciais** recebe somente os novos e-mail, senha e client_token. O
agente, banco e dialeto são os do cadastro vigente, não editáveis por esse fluxo.
O servidor verifica as novas credenciais pelo plug_server/plug_agente fora da
transação MCP e revalida o responsável e a versão antes da gravação. A troca
incrementa as versões da credencial e da fonte, cifra os valores, descarta o JWT
da credencial editada e suspende as publicações dependentes até revisão.

Falha de autenticação/transporte preserva o cadastro. Prova de identidade física
divergente suspende os vínculos conhecidos e suas dependências, sem gravar novas
credenciais ou reassociar treinamento. Nesse caso, revise e cadastre uma nova
fonte. Suspensão, recuperação e substituição são ações explícitas com revisão
própria, descritas abaixo; não estão implícitas na edição.

Rotas adicionais sob `/api/admin/personas/:personaId`, somente pelo navegador
com sessão, Host/Origin e CSRF:

| Método | Sufixo                         | Entrada                                                                |
| ------ | ------------------------------ | ---------------------------------------------------------------------- |
| POST   | `/editar`                      | `expectedVersion`, `name`, `specialty`, `instructions`                 |
| POST   | `/fontes/:sourceId/editar`     | `expectedVersion`, `name`, `purpose`, `environment`, `rowRestrictions` |
| POST   | `/fontes/:sourceId/credencial` | `expectedVersion`, `email`, `password`, `clientToken`                  |
| POST   | `/fontes/:sourceId/suspender`  | `expectedVersion`                                                      |
| POST   | `/fontes/:sourceId/recuperar`  | `expectedVersion`, `credentials` opcional                              |
| POST   | `/fontes/:sourceId/substituir` | `expectedVersion`, `source` com o cadastro completo da nova base       |

Exemplo de edição de persona vazia; a resposta traz a persona e sua nova
`authorizationVersion`, usada como `expectedVersion` na edição seguinte:

```json docs:persona-update
{
  "expectedVersion": 1,
  "name": "Financeiro",
  "specialty": "Contas a receber",
  "instructions": "Responda com dados retornados e informe origem e limites."
}
```

Exemplo de alteração de fonte existente:

```json docs:source-update
{
  "expectedVersion": 1,
  "name": "ERP da empresa",
  "purpose": "Pedidos da empresa 7",
  "environment": "homologação",
  "rowRestrictions": [
    { "table": "dbo.pedidos", "column": "empresa_id", "parameter": "__scope_empresa", "value": 7 }
  ]
}
```

O console avisa sobre alterações pendentes ao trocar de persona e descarta
resultados/previews ao salvar. Credenciais antigas nunca são devolvidas para
preencher o formulário; os campos novos são limpos após a tentativa.
Conflito de edição preserva os campos locais e a versão originalmente editada.
Use **Recarregar base** para revisar o cadastro atual, com confirmação antes de
descartar alterações pendentes; o console não reaplica a edição automaticamente.

## Suspensão e recuperação da persona

No console, **Visão geral → Suspender persona** apresenta os efeitos antes da
confirmação. A sessão do responsável deve continuar vigente. As rotas
`POST /api/admin/personas/:personaId/suspender` e `.../recuperar` recebem somente
`{ "expectedVersion": 1 }`, com versão atual, Host/Origin, cookie e CSRF.
Não são tools do consumidor e não usam a permissão de publicar como aprovação.

Suspensão incrementa a versão de autorização, bloqueia consumidores,
suspende todas as publicações da persona e revoga concessões OAuth derivadas
na mesma transação. Preserva fontes, rascunhos, snapshots e referências históricas.
Sessões técnicas em memória das fontes são descartadas após o commit.
Efeitos já enviados às bases não são desfeitos; operações incertas não são reenviadas.

Recuperação exige a mesma identidade administrativa `hubOrigin + client.id`,
inclusive após mudança de e-mail, e CAS. Não remove suspensões, não altera fontes,
não recupera tokens/conexões revogados nem adota versões de conhecimento.
Tokens manuais não revogados conservam suas concessões explícitas; nenhuma
nova capacidade é concedida. Previews e contextos anteriores ficam obsoletos.
Revisar, testar quando aplicável e republicar as skills antes de executar.

Persona suspensa continua na listagem do responsável, identificada como suspensa.
Somente recuperação e leitura do histórico ficam disponíveis na sua área;
demais mutações permanecem recusadas. Os eventos `persona.suspended` e
`persona.recovered` registram autor e versões, sem conteúdo de treinamento.
O ciclo das fontes abaixo não transfere a autoridade da sessão administrativa
para tokens consumidores. Administração por token permanece na etapa própria.

## Suspensão, recuperação e substituição de fontes

Em **Bases**, cada vínculo oferece **Revisar suspensão**, **Revisar recuperação**
ou **Revisar substituição**, conforme seu estado. A revisão mostra publicações
diretas/transitivas e exige confirmação; consulta de impacto não reserva autoridade.
Versão divergente exige recarregamento explícito, preservando edição pendente.

Suspender não chama SQL nem desfaz efeitos já enviados. Incrementa a versão da
fonte e suspende suas publicações e dependências na mesma transação do histórico.
Outras fontes, inclusive vínculos da mesma base em outra persona, são preservadas.
Esta entrada serve para a suspensão ou recuperação sem novas credenciais:

```json docs:source-state
{
  "expectedVersion": 1
}
```

Recuperar exige fonte suspensa, responsável vigente e prova da **mesma** base,
motor e identidade pelo plug_server/plug_agente. Sem `credentials`, usa os
valores cifrados já cadastrados; pode receber `credentials` com `email`,
`password` e `clientToken`, preenchidos somente no navegador, para renovar a
conta técnica mantendo a identidade. Prova ocorre fora da transação MCP;
responsável, estado e versão são conferidos novamente antes de gravar. Falha
não troca identidade nem grava a credencial. Recuperação não remove suspensões,
não ressuscita concessões revogadas e não reenvia operações incertas. Revise,
teste quando aplicável e republique as skills.

Substituir recebe `source` com os cinco campos técnicos e nome/finalidade/ambiente
do cadastro normal. Verifica a nova fonte e cria outro ID e outra credencial.
Somente depois, na mesma transação, marca o vínculo anterior como substituído,
incrementa sua versão e suspende dependências. Falha desfaz também o novo cadastro.
Não reaproveita rascunhos, publicações, tokens ou concessões. Mesmo quando a
identidade física é a mesma, a substituta exige treinamento/publicação/concessões
explícitos. Conhecimento compartilhado pode ser adotado pelo fluxo próprio,
com inspeção, compatibilidade e publicação explícitas, sem cópia automática.

O vínculo anterior retorna `replacedBySourceId`, conserva sua identidade e
referências históricas e não pode ser recuperado ou substituído novamente.
A migration aditiva `0011_source_replacement.sql` impede ligação entre personas,
reativação de fonte substituída e alteração da referência histórica. Dados v2
anteriores permanecem privados e recebem referência de substituição nula.
Os eventos `source.suspended`, `source.recovered` e `source.replaced` guardam
somente autor, recurso e versões. Credenciais novas são descartadas após cada
tentativa no console; resultados e previews anteriores são descartados.

## Contexto para a IA cliente

### Administração delegada por consumidor

O responsável seleciona explicitamente no console o teto administrativo da
delegação do hub: `treinar`, `publicar`, `gerenciar_fontes`, `gerenciar_tokens`
e `gerenciar_integracoes`. Delegações anteriores continuam somente com
`gerenciar_fontes`; renovar não amplia tokens nem consentimentos existentes.
`gerenciar_integracoes` exige também IDs explícitos em `managedIntegrationIds`
em cada camada. A gestão não concede execução; adapters, contratos publicados,
setups e limites estão no [contrato de integrações](external-integrations.md).

Treinamento e publicação aceitam sessão Client, Bearer manual ou identidade OAuth
pelos mesmos serviços. Para consumidores, a prova do hub precede a transação;
locks ordenados de persona/tokens, consentimento, versão da delegação e prazos
são conferidos novamente antes do commit local. Não existe atomicidade entre
revogação no hub e commit MCP. Indisponibilidade bloqueia a ação, sem retry.

`treinar` permite listar/criar/editar rascunhos e registrar casos nas fontes
explicitamente concedidas; não executa SQL, aprova relatórios ou publica.
Também permite `criar_rascunho_de_template` (`skills/template` nessas rotas)
para versões/hashes exatos, quando o responsável mantém papel editorial no
catálogo. Fonte deve estar no token e consentimento; material selecionado não
abre navegação pela biblioteca. Exemplos adicionais ficam candidatos, dataset é
revalidado sem devolver linhas e nenhuma autoridade/caso é herdado.
[Contrato](knowledge-library.md#importação-por-consumidor-administrativo).
`publicar` permite preview, confirmação e suspensão nas mesmas fontes. O preview
fica vinculado ao consumidor/concessão, versões e delegação exatos; troca de
autoridade exige nova revisão. Publicar não concede execução ao próprio token.
Dependências de cruzamento também precisam de concessão às skills utilizadas.

`gerenciar_tokens` permite listar, editar e revogar outros tokens dentro dos
tetos do originador, da sua delegação, do consentimento e do hub. Não permite
autoedição, acesso a tokens superiores ou prazo além da autoridade recebida.
Emissão/rotação concluem-se somente no navegador autenticado. As tools
`iniciar_emissao_token_persona` e `iniciar_rotacao_token_persona` abrem setups
temporários com delegação e consentimento vigentes; não retornam o novo Bearer.
O responsável reautentica e confirma o conteúdo exato. Veja o
[contrato dos setups](oauth.md). Aprovação humana de lançamentos permanece
exclusivamente na sessão Client do responsável, separada de `publicar`.

As rotas sem segredos ficam em `/api/consumer/bearer/administration` e
`/api/consumer/oauth/administration`, com `skills` e `tokens`; não aceitam cookie
como substituto do Bearer. Aplicam Host/Origin e o contrato de cada ação.
Tools equivalentes: `listar_rascunhos`, `criar_rascunho_skill`,
`editar_rascunho_skill`, `registrar_caso_skill`, `revisar_publicacao_skill`,
`publicar_skill`, `suspender_publicacao_skill`, `listar_tokens_delegados`,
`editar_token_delegado` e `revogar_token_delegado`. São omitidas sem autoridade;
chamada direta não contorna os serviços. Auditoria registra autor token/OAuth e
versões, nunca SQL, parâmetros ou credenciais. Migration aditiva 0012 preserva
dados anteriores e distingue token autor do token que está sendo administrado.

`obter_treinamento_base` e `guia://persona-v2` incluem procedimentos comuns,
contratos de consulta/paginação, comandos usados do hub, erros e fidelidade dos
resultados. O dialeto pertence à fonte. A base comum não conhece o ERP particular.
`obter_skill` entrega também significados de tabelas e relacionamentos publicados.

`buscar_contexto({ pergunta })` pesquisa finalidade, significados, relacionamentos,
regras e exemplos aprovados dos snapshots concedidos. Até 64 termos e vinte
resultados, com referências e proveniência, sem SQL/valores nem aprovação semântica
de cobertura. `obter_grafo_conhecimento({skillId})` entrega o grafo paginado do
snapshot autorizado; não abre navegação pelo catálogo nem licencia JOIN direto
N:N. Não usa embeddings. [Busca e grafo](shared-knowledge.md#busca-lexical-e-grafo-concedidos).
Ausência de candidato exige conferir `listar_skills`.
Resource `fonte://{personaId}/{fonteId}` retorna
somente nome, finalidade, ambiente e dialeto concedidos, sem credenciais.

A IA responde fatos, valores e KPIs com resultados efetivamente retornados e regras
publicadas, sem preencher ausências por suposição. Zero linhas descreve apenas
aquela consulta/filtros/fontes; erro ou falta de permissão não prova ausência.
Página e truncamento devem ser informados. Avaliar a resposta final da IA é gate
separado dos testes do servidor.

## Identificadores e limites

A gramática do SELECT, os schemas qualificados e a recusa de binário estão em
[consultas](source-queries.md). Firebird mantém [gramática própria](firebird-sql.md).
Cadastro compara o dialeto declarado com o motor confirmado pelo agente.
[Identificação física](source-identity.md) descreve metadados, suspensão e o que
ainda bloqueia o aceite. Grafo, curadoria, tokens administrativos e as jornadas
ausentes do console estão no [trabalho restante](remaining-plan.md).

## Validação

### Roteiro manual de treinamento no candidato isolado

Para manter a cadeia local disponível durante o ensaio, usar a
[sessão contínua de fixture](homologation-chain.md#sessão-contínua-para-treinamento-manual).
Ela começa sem personas e tem prazo e limpeza explícitos. Os companions curtos
da suíte automatizada não são um ambiente contínuo de treinamento humano.

Preparar o ambiente conforme a [distribuição candidata](candidate-distribution.md),
com hub/agente e bases de homologação próprios. Registrar revisão/hash da imagem,
versões dos motores, data, responsável pelo ensaio e resultado de cada passo.
Não colocar senhas, Bearer, SQL com dados reais ou resultados privados no relatório.

1. Criar persona vazia e confirmar que nenhuma base é exigida nessa etapa.
2. Cadastrar duas fontes distintas pelos cinco campos técnicos; conferir motor,
   identidade e finalidade retornados pelo hub/agente.
3. Criar treinamento privado de consulta para cada fonte com tabela/colunas,
   significado, relacionamentos e parâmetros conhecidos da fixture. Não usar
   nomes ou relações Data7 presumidos.
4. Salvar rascunho e usar **Recarregar treinamento**. Conferir conteúdo e revisão;
   cancelar o descarte ou simular falha de leitura deve manter a edição local.
   Após conflito, confirmar releitura deve trazer a versão atual e limpar prévia
   e casos locais ainda não salvos, sem alterar a publicação ativa.
5. Cadastrar casos exigidos e executar o runner separado com manifesto de fixture.
   Conferir relatório atual, sem considerar sucesso técnico aprovação semântica.
6. Definir prazo de revisão, revisar prévia/diferenças e publicar com confirmação.
   Alterar depois um rascunho e conferir que o snapshot executável não mudou.
7. Emitir um token restrito à primeira consulta e outro às duas. Testar conexão;
   o primeiro não deve descobrir ou executar a segunda.
8. Validar e executar consultas com resultado conhecido e vazio, usando somente
   o token do consumidor. Conferir fonte, publicação, horário, paginação e
   completude; falha ou recusa não devem ser apresentadas como ausência de dados.
9. Retirar uma concessão e tentar novamente a descoberta e a chamada direta.
   Confirmar bloqueio desse consumidor e preservação do token independente.
10. Trocar persona, sair e expirar a sessão; conferir descarte de segredos,
    resultados antigos e ausência de dados sensíveis no armazenamento do navegador.

#### Biblioteca editorial e casos de consulta

Este ensaio é adicional ao treinamento privado e usa somente material sintético
ou explicitamente autorizado da fixture. Requer papel editorial vigente no
catálogo; não é necessário adotar padrão compartilhado para importar template.

1. No catálogo, preparar template revisado e duas versões de dataset vinculadas
   à mesma versão do template, com valores conhecidos diferentes. Não presumir
   tabelas, relacionamentos ou regras Data7. Conferir ID, versão e hash de cada
   material, sem inserir segredos.
2. Importar o template para a persona/fonte escolhida, com variante de dialeto e
   exemplos explícitos. Usar **Abrir treinamento criado**: conferir a persona,
   a revisão salva e a proteção de edição. Exemplos importados continuam
   candidatos; revisar seu significado antes de marcar para publicação.
3. Em casos da consulta, carregar as sementes de origem ou usar **Escolher outro
   dataset deste template**. Conferir que listar/selecionar não muda sementes ou
   grava o caso. Escolher uma versão antiga também deve manter sua referência
   exata, sem adotar a mais recente.
4. Preparar as sementes selecionadas. Cancelar a substituição deve conservar a
   edição; confirmar deve copiar os valores escolhidos, sem inventar parâmetros
   ou resultado esperado. Revisar esses campos e salvar explicitamente.
5. Reabrir o caso e conferir a origem registrada. Alterar uma semente, salvar e
   conferir que passou a diferir da origem; o dataset da biblioteca deve continuar
   inalterado. Trocar a origem exige escolha pelo console Client.
6. Executar o runner separado com a fixture e os casos salvos, conferir relatório
   atual e então seguir a revisão/publicação. Sementes iguais ao dataset ou
   gravação bem-sucedida não aprovam semântica ou execução. Revogação do catálogo,
   mudança da fonte ou conflito de revisão devem recusar a preparação/gravação,
   preservando a edição.

[Contrato da biblioteca e limites](knowledge-library.md#preparar-sementes-de-um-caso-de-consulta).
Datasets de operação/cruzamento não estão habilitados por esse fluxo.

Cada caso deve registrar aprovado/reprovado/não executado e uma referência de
evidência sem conteúdo sensível. O ensaio não altera o manifesto nem autoriza
produção. Uso da IA/ChatGPT precisa de avaliação própria de seleção de fonte e
fidelidade aos dados, conforme [aceite](acceptance.md); HTTPS/ChatGPT continuam
para validação manual. DML experimental permanece proibido nas fontes do usuário.

### Suítes automatizadas

`test:persona-v2:postgres` exige URL explícita `_test` e cria/remove apenas suas
bases aleatórias. `test:persona-v2:browser` usa Chromium e três bases PostgreSQL
próprias (MCP e duas fontes). SQL/persistência reais, hub/autenticação sintéticos.
Não herda `.env` nem utiliza fontes cadastradas. Ambiente obrigatório ausente
falha, sem skip. Não homologa hub/agentes reais, três motores ou IA consumidora.
