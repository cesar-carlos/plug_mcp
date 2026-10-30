# Catálogo e publicação em desenvolvimento

## Qualidade do treinamento e semântica comercial

Novos previews/publicações de consulta com agregação, GROUP BY, JOIN (inclusive
em CTE/subconsulta/UNION) no modelo ou exemplos, ou com métricas declaradas,
exigem pelo menos um caso obrigatório e relatório atual do runner isolado.
A verificação ocorre novamente ao publicar. Casos opcionais não satisfazem
essa exigência. Rascunhos continuam editáveis e os runners podem compilar sem
relatório prévio para produzir a evidência. Publicações existentes não são
reescritas, suspensas ou certificadas retroativamente. A política classifica o
SQL treinado; não certifica toda adaptação futura nem significado comercial.

`training.semantics` opcional usa `version: 1`, `synonyms` (até 30 termos) e
`metrics` (até 50 definições). Cada métrica fixa `id`, `name`, `definition`,
`aggregation` (sum/count/count_distinct/min/max/average/ratio/classification),
`inputs` e `grain` como pares `{table,column}`, `unit`, `timePolicy`, `filters`,
`nullPolicy`, `negativePolicy` e `reconciliation`. Referências devem ser únicas
e apontar a campos executáveis treinados. IDs e sinônimos duplicados recusam.
Não são expressões SQL executáveis: fórmula, calendário e conciliação são
declarações editoriais que exigem revisão e casos. Não inferir equivalência
entre SQL adaptado e uma métrica apenas por seu nome.

O console permite editar essas definições no rascunho. Elas integram o hash do
contrato e a comparação de publicação; mudanças exigem nova concessão exata,
sem ampliar tokens existentes. `obter_skill` entrega a semântica concedida.
Busca lexical indexa sinônimos e nome/definição/unidade das métricas somente no
pacote autorizado. Não indexa SQL nem consulta catálogo não concedido.

Para ABC, os casos devem incluir mais de uma página, empates, cortes definidos,
zero/negativos e conciliação. JOIN exige casos que evidenciem multiplicação e
grão correto. A exigência de ao menos um caso é um mínimo técnico, não prova
automática de cobertura dessas famílias. Avaliação da conversa é separada:
[avaliador consumidor](consumer-evaluation.md).

## Orientações ao consumidor

As instruções MCP refletem as capacidades anunciadas, sem substituir a
autorização. Descoberta/importação administrativa pode usar
`propor_contrato_externo` quando disponível, com escopo, versão e revalidação;
o resultado continua sendo proposta, sem salvar, publicar ou executar ações.
[Contrato](external-integrations.md).

`listar_historico_conhecimento` admite skills concedidas de consulta ou operação
SQL. O contexto de ambos os tipos é lido por `obter_skill`; `obter_padrao`
conserva seu alcance editorial de consultas. Histórico não abre o catálogo
integral, adota versões ou concede execução. [Contrato](shared-knowledge.md).

## Casos e relatórios por administração delegada

Sessão Client do console usa GET `/api/admin/personas/:personaId/skills/:skillId/testes-consulta`
e POST `/api/admin/personas/:personaId/skills/:skillId/casos-consulta`, com os
mesmos serviços de leitura/CAS e guardas administrativos Host/Origin/CSRF. O
painel visual apresenta casos/relatórios e edita casos declarativos por revisão.
Não executa o runner nem transforma sucesso de gravação em aprovação técnica.

O console pode preparar sementes a partir do dataset associado à importação do
template, com sessão Client e papel editorial vigente. É uma leitura explícita,
sem salvar caso, inventar resultado ou aprovar relatório. Não está disponível em
MCP/Bearer/OAuth. [Contrato e limites](knowledge-library.md#preparar-sementes-de-um-caso-de-consulta).

O caso salvo pode conservar `editorialOrigin`, com referências e hashes
recalculados pelo servidor. Nova origem é registrada pela sessão Client;
edição delegada de caso já vinculado conserva a origem sob revalidação vigente.
Não buscar linhas da biblioteca por tool nem tratar correspondência das
sementes como aprovação. [Linhagem e limites](knowledge-library.md#origem-editorial-no-caso-salvo).

`obter_testes_skill({skillId,kind,after?})` lê casos, revisão, hashes, relatórios
paginados e situação atual de aprovação técnica. `kind` aceita `consulta`,
`operacao_sql`, `cruzamento` e, quando o serviço externo está ligado, `acao_externa`.
A leitura de consultas usa a mesma compilação do
pacote e compara revisão, hash do pacote e hash dos casos; relatórios antigos
permanecem no histórico com `current: false`. Até vinte relatórios por página,
com cursor UUID. Não ter casos obrigatórios não é aprovação técnica comprovada.

`editar_caso_skill` aceita os tipos disponíveis e recebe esses identificadores, `expectedRevision`,
`required`, `content` e, para alteração/remoção, `id` e `remove`. O conteúdo segue
o mesmo schema do editor; remoção não dispensa revisão nem visibilidade da fonte.

Para ação externa, leitura e edição exigem `treinar`, delegação vigente e
publicação/skill/operação concedidas integralmente no token e no consentimento
OAuth. O contrato do rascunho deve ter hash idêntico ao publicado; integração
suspensa ou credencial/contrato divergente bloqueia. Não abre edição de contratos
novos ou navegação em integrações não concedidas. Paginação externa tem até
cinquenta relatórios, com cursor próprio. Entradas usam o schema externo de caso;
salvar incrementa revisão e invalida relatórios, sem alterar o snapshot ativo,
executar o provedor ou aprovar testes. Mesma regra nas rotas administrativas de
consumidor Bearer/OAuth. Criação/publicação de contratos e runner continuam nos
fluxos separados. [Contrato externo](external-integrations.md).

Para consulta, o conteúdo usa `queryPublicationCaseSchema`: nome, parâmetros,
SQL opcional, sementes tipadas de fixture e colunas/linhas/ordem esperadas.
Não converte casos antigos ou fabrica relatórios. A alteração incrementa a revisão
e invalida a atualidade das evidências anteriores; CAS concorrente aceita somente
uma mudança. Caso inexistente recusa e reverte a revisão na mesma transação.
O cadastro armazena uma declaração de teste, não executa o SQL informado nem
comprova sua segurança, semântica ou compatibilidade. O runner continua separado.

As rotas equivalentes são GET/POST
`/api/consumer/{bearer|oauth}/administration/skills/:skillId/testes`; GET recebe
`kind`/`after` na query e POST recebe `kind` junto ao caso. Exigem Bearer próprio,
Host/Origin válidos, `treinar`, consentimento quando OAuth e teto/delegação atuais
do responsável. Cookie não substitui essa autoridade. Tipo incorreto ou fonte
não concedida são recusados; revisão obsoleta não sobrescreve edição.

São os mesmos serviços transacionais do console. Não executam SQL, runner, ação,
publicação ou aprovação humana; não permitem gravar relatórios. Casos alterados
exigem nova evidência do runner de operador. Publicar catálogo compartilhado
continua reservado ao curador autenticado no navegador.

O catálogo funciona na entrada principal persona-v2 e em `dev:persona-v2`.
O deploy de teste tem contrato próprio; aceite integral para clientes continua
bloqueado. A migração
`0002_catalog.sql` acrescenta previews, fingerprint de fonte e proteção de
imutabilidade das dependências; não converte registros antigos.
Startup/readiness exigem todas as migrations e checksums empacotados, sem DDL.

## Fluxo administrativo

Feedback explícito não altera o pacote publicado. Calendário separado exige prazo
escolhido pelo curador/responsável, CAS e justificativa, sem data padrão ou
suspensão por idade. [Contrato](shared-knowledge.md#feedback-e-revisão-temporal).
Novas publicações exigem prazo futuro vinculado ao conteúdo e à prévia. Worker
v2 separado registra tarefas e notificações internas, sem concluir revisões.
[Publicação com prazo e worker](review-worker.md).

O treinamento/publicação privados também podem ser administrados por Bearer ou
OAuth com permissão explícita e delegação ativa do hub. As rotas consumidoras e
tools próprias ficam no [contrato de administração delegada](onboarding.md#administração-delegada-por-consumidor).
Esse fluxo não aprova relatórios nem lançamentos, não expõe rascunhos de fontes
não concedidas e vincula preview à autoridade exata. As rotas de console abaixo
continuam exigindo sessão Client.

Todas as rotas abaixo exigem sessão do responsável Client, `Origin`, `Host` e
`X-CSRF-Token`. O perfil é revalidado no hub antes da transação local. Senhas,
JWTs e client_token não são campos de treinamento.
GET de navegador pode omitir `Origin` somente com `Sec-Fetch-Site: same-origin`
e Host exato, mantendo sessão e CSRF. POST não recebe essa exceção.

Prefixo: `/api/admin/personas/:personaId/skills`.

| Método | Sufixo                    | Entrada e resultado                                                                               |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------- |
| GET    | —                         | Lista rascunhos e IDs das publicações ativas                                                      |
| GET    | `/:skillId/publicacao`    | Publicação ativa não suspensa ou `null`; leitura administrativa para concessões                   |
| POST   | —                         | `slug`, `kind`, `name`, `training`; cria revisão 1                                                |
| POST   | `/:skillId/rascunho`      | `name`, `training`, `expectedRevision`; salva por CAS                                             |
| POST   | `/:skillId/casos`         | `required`, `content` com `name`, `input`, `expected`                                             |
| POST   | `/:skillId/prazo-revisao` | `{dueAt}` UTC futuro; humano define plano para revisão/hash atuais                                |
| POST   | `/:skillId/preview`       | `{reviewDueAt}` UTC futuro, ou plano humano já configurado; pacote, diff, avisos, hash e validade |
| POST   | `/:skillId/publicar`      | `confirmationHash`; publica o conteúdo confirmado                                                 |
| POST   | `/:skillId/suspender`     | `{}`; suspende a publicação ativa imediatamente                                                   |

Tipos aceitos em `kind`: `consulta`, `cruzamento`, `operacao_sql`, `acao_externa`.
`consulta`, `cruzamento` e `operacao_sql` têm compilador/publicação nesta etapa. Cruzamentos
exigem dependências exatas e casos obrigatórios aprovados por runner separado:
[contrato de cruzamento](federation.md). Operações usam contrato declarativo
`somente_parametros` ou `sql_adaptavel` restrito, casos SQL obrigatórios em fixture PostgreSQL isolada e o
[fluxo de lançamentos](sql-operations.md). `acao_externa` publica pelo
[serviço específico de integrações](external-integrations.md), com casos e
aprovação aplicável; não usa a publicação SQL por fonte. A matriz ampliada dos
runners permanece no plano restante. Adaptação exige casos obrigatórios de SQL aceito e
recusado; conciliação exige caso positivo do marcador transacional único.

Exemplo de treinamento, depois de cadastrar uma fonte sintética:

```json docs:query-draft
{
  "slug": "pedidos",
  "kind": "consulta",
  "name": "Pedidos",
  "training": {
    "sourceId": "11111111-1111-4111-8111-111111111111",
    "dialect": "postgres",
    "purpose": "Consultar pedidos da fonte treinada",
    "sqlModel": "SELECT p.id, p.amount FROM orders p WHERE p.id > :minimum ORDER BY p.id",
    "tables": [{ "name": "orders", "meaning": "Um pedido por identificador", "grain": ["id"] }],
    "columns": [
      { "table": "orders", "name": "id", "meaning": "Identificador", "classification": "livre" },
      {
        "table": "orders",
        "name": "amount",
        "meaning": "Valor em reais",
        "classification": "livre"
      }
    ],
    "relationships": [],
    "rules": ["Valores em BRL"],
    "parameters": [
      { "name": "minimum", "type": "number", "required": true, "meaning": "Identificador mínimo" }
    ]
  }
}
```

Substitua `sourceId` pelo vínculo real da persona. Os nomes do exemplo não são um
catálogo do ERP. Credenciais permanecem no navegador.

`examples` opcional registra vários exemplos adicionais com `id`, `purpose`,
`sql` e `explanation`. Usa a mesma fonte, dialeto e parâmetros do modelo principal.
Todo SQL é validado, inclui o contrato publicado e aparece em `obter_skill`.
Editar os exemplos não muda uma publicação ativa e exige nova concessão do contrato
quando republicado. SQL consultado não é capturado automaticamente como treinamento.
Biblioteca compartilhada: [contrato](shared-knowledge.md), com adoção inicial
executável em consultas e requisitos próprios de inspeção/publicação.

Relacionamentos declaram `from`, `to`, `keys` (pares `from`/`to`), `join`
(`inner`/`left`), `cardinality` e `meaning`. `id` é opcional para relações diretas;
caminho N:N exige `id`, `via` com intermediárias físicas e `path` com IDs dos
elos diretos. Só os elos diretos entram no escopo SQL; o caminho fica fixado no
contrato, sem habilitar atalhos. [Prova e direção física](shared-knowledge.md#relacionamentos-reversos-e-caminhos-executáveis).
Grão e chaves de JOIN precisam ser
colunas confirmadas com finalidades concedidas. Pessoal/sensível exige `uses`
e `usePurpose` publicados e concessão integral; segredo/inferido não entra no allowlist
executável. Projeção pessoal/sensível autorizada entrega valores sem mascaramento
implícito. Aparecer num exemplo não concede autorização; consulte
[campos e finalidades](source-queries.md#campos-e-finalidades).

O compilador recusa escrita, `SELECT *`, campos/tabelas não treinados e parâmetro
sem contrato. Firebird não é suportado na v2. PostgreSQL,
MSSQL e SQL Anywhere aceitam `schema.tabela AS alias` em minúsculas, preservando
schema no pacote/recortes. Referências entre bancos permanecem recusadas.
Isso não certifica execução nesses
motores, paridade dos dialetos ou semântica das regras textuais.

## Confirmação e autoridade

O preview mostra pacote completo, campos alterados, capacidades acrescentadas e
retiradas. `review` acrescenta comparação estruturada produzida pelo servidor:
`previousRevision`, seções com `id`, `label` e alterações (`kind`, `path`,
`label`, `before`/`after`), situação dos casos (`total`, `required`,
`requiredApproved`), impacto transitivo (`total`, `publications`) e
`existingTokensExpanded: false`. Conteúdo vem dos pacotes exatos autorizados,
sem interpretação semântica. Arrays com identidade estável são comparados por
essa identidade; reordenação de definições não vira alteração comercial.
Regras/etapas sem identidade mantêm a comparação ordenada. A confirmação fica vinculada ao responsável, persona e sua versão,
revisão do rascunho, pacote, publicação anterior e fingerprint da fonte
(incluindo banco, identidade física, recortes e versão da credencial).
Ela expira em 15 minutos e só pode ser consumida uma vez. Publicações concorrentes
com o mesmo preview produzem uma confirmação efetiva e um conflito.

Edição, mudança de casos, fonte, credencial ou autorização da persona invalidam
o preview. Edição preserva o pacote ativo; suspensão não modifica seu snapshot.
Publicações e dependências recusam atualização e exclusão no banco.
As mutações do catálogo geram auditoria transacional somente com IDs e eventos.
O pacote registra versão/hash da base comum e referência fixada do contrato do hub.

O [console inicial](onboarding.md) edita consultas com campos de estrutura,
relacionamentos, regras, parâmetros e SQL, incluindo revisão e publicação explícita.
O contexto MCP de consulta entrega também significado de tabelas/relacionamentos.
Busca lexical opera apenas em publicações concedidas, sem afirmar cobertura semântica.

Sem casos de consulta simples, o preview avisa `SEM_CASOS_DE_TESTE`. Consultas
analíticas seguem a exigência acima. Havendo casos
obrigatórios, exige relatório aprovado do runner separado, ligado à revisão,
hash do pacote e hash dos casos atuais. Não há endpoint para a IA fabricar ou
aprovar relatórios. O runner genérico de operador executa consultas, operações e
cruzamentos em fixtures privadas pela cadeia real. Fontes pretendidas e ambientes
de teste ficam vinculados explicitamente, sem SQL em bases operacionais.
[Contrato do runner](homologation-chain.md#publicação-sql-genérica-em-fixtures-privadas).
O runner sintético de combinações conserva escopo próprio e não comprova SELECT.

Pacotes novos de consulta incluem `sourceFingerprint`, que vincula o hash do
pacote ao cadastro completo da fonte, incluindo versões de credencial/autorização
e recortes. Assim, um relatório antigo não aprova republicação após editar a fonte
ou trocar credenciais, mesmo que o SQL e as capacidades físicas permaneçam iguais.
Snapshots e relatórios anteriores são preservados. A manutenção suspende somente
publicações da fonte editada e suas dependências transitivas; nova identidade física
segue a suspensão dos vínculos conhecidos descrita em [identidade](source-identity.md).

Cada pacote deriva capacidades físicas por coluna e uma capacidade para o
contrato completo. Use `package.requiredCapabilities` do preview ao emitir um
token com efeito `select`, `skillId` e `sourceIds` explícitos. Ampliação de
colunas ou mudança do contrato não amplia tokens emitidos anteriormente.
Mudanças de contrato podem exigir nova liberação mesmo quando forem restritivas;
esse comportamento inicial é conservador. Restrições e suspensão têm efeito
imediato. Listagem e leitura direta usam o mesmo portão, com locks de persona
e token na ordem usada pelas revogações.

[Exemplo sintético de permissões](examples/permissions.json), validado pelo mesmo
schema usado pela administração. Substitua IDs e a lista inteira de capabilities
por package.requiredCapabilities do preview/publicação vigente; o placeholder não
concede acesso. O arquivo ilustra permissions, não o body completo de emissão do token.

## MCP disponível

Endpoint `/mcp` da aplicação nova. Sem Bearer: `obter_treinamento_base`,
`guia://persona-v2` e `guia://dialeto/{dialeto}`. Com Bearer válido:

- `obter_contexto_persona`: identidade, especialidade e instruções.
- `diagnosticar_permissoes`: diagnóstico local com horário, validade do token e
  concessões utilizáveis/bloqueadas; usa os portões de visibilidade existentes,
  sem SQL nem reserva de autorização remota. [Limites](console.md#conexão-e-diagnóstico-do-consumidor).
- `listar_fontes`: somente metadados das fontes concedidas.
- `listar_skills`: publicações concedidas e dependências vigentes.
- `criar_anexo_consulta` executa consulta fresca com exportação concedida;
  `obter_anexo` e `anexo://{personaId}/{handle}` revalidam antes de entregar JSON.
  Não enumeram handles ou reutilizam cache. `format:binary` exige contrato/capability
  próprios, coluna direta com metadata positiva e um registro completo; leitura
  preserva MIME efetivo/bytes. [Contrato](attachments.md).
- `obter_skill({slug})`: contexto publicado; rascunhos e colunas não livres omitidos.
- `buscar_contexto`: busca lexical de significados/regras/exemplos aprovados, com
  referências e origem, mantendo vinte resultados e sem SQL/valores no índice.
- `obter_grafo_conhecimento`: grafo qualificado por fonte/schema/tabela/coluna,
  relações declaradas e paginação cifrada vinculada ao consumidor/publicação.
  [Contrato e limites](shared-knowledge.md#busca-lexical-e-grafo-concedidos).
- `listar_padroes` e `obter_padrao({skillId})`: versões adotadas e recorte autorizado
  da skill, sem navegação irrestrita. `propor_conhecimento`,
  `obter_proposta_conhecimento` e `registrar_exemplo_sql` exigem treinamento e
  delegação/consentimento vigentes; exemplos entram candidatos e curadoria do
  padrão exige papel correspondente. Particularidades usam
  `propor_particularidade_fisica`/`obter_proposta_particularidade`, com perfil
  adotado pela skill, origem imutável e acesso vigente à mesma base. Revisão
  permanece no console e muda somente rascunho.
  `obter_proposta_conhecimento({skillId,proposalId,includeContent:true})` permite
  reler resumo, mudança original, publicação/hash-base e data de envio. Exige a
  mesma conexão de origem (Bearer ou concessão OAuth), além do token autor,
  delegação e acesso vigentes. Sem a opção, conserva a resposta de estado anterior.
  Não devolve justificativa do curador, rascunho atual ou conteúdo de outra proposta;
  conteúdo enviado não é conhecimento aprovado nem autorização de execução.
  `listar_minhas_propostas_conhecimento({skillId,before?})` lista até vinte
  referências/estados por página, apenas do token e conexão atuais, da mesma
  persona/fonte/skill e versão-base concedida. Retorna `nextCursor` para `before`,
  sem resumo, conteúdo ou justificativa do curador. Cursor de outro escopo é
  recusado. Ordenação por ID é estável, não cronológica; não há total ou snapshot
  entre páginas. Cada página revalida delegação, consentimento, dependência e
  papel editorial. Mudança da versão adotada invalida cursores da versão anterior.
  A mesma opção `includeContent` em `obter_proposta_particularidade` permite
  reler o envio original e as referências/hash de perfil e padrão-base, incluindo
  a intenção explícita `overrideCommon`. Exige a mesma conexão autora e acesso
  remoto vigente à base. Não devolve identidade física interna, justificativa
  do curador ou conteúdo atual do perfil; leitura não incorpora a proposta.
  `listar_minhas_propostas_particularidade({skillId,before?})` lista até vinte
  referências próprias do perfil publicado atualmente concedido. Filtra por
  catálogo, base física/identidade, perfil, persona, fonte, skill, token e conexão.
  Cada página revalida o acesso remoto à base e a integridade das propostas.
  Retorna `nextCursor`, sem conteúdo, identidade interna ou revisão do curador.
  Cursor de outro token, perfil ou lista é recusado. Ordem por ID é estável,
  não cronológica; não há snapshot entre páginas ou navegação pela fila geral.
  [Contrato](shared-knowledge.md#curadoria-de-particularidades-físicas).
  `registrar_exemplo_sql` aceita `replace:true` para substituir explicitamente
  um exemplo pelo mesmo `example.id`, com `expectedRevision` vigente. Sem essa
  opção, ID existente é conflito; com ela, ID ausente é conflito. Substituição
  valida SQL sem executar e sempre volta a candidato, mesmo se receber approved.
  Preserva modelo, parâmetros, outros exemplos e snapshot publicado; exige nova
  revisão editorial e publicação. Não substitui versões do catálogo compartilhado.
  `inativar_exemplo_sql({skillId,exampleId,expectedRevision})` altera somente o
  estado do exemplo para `inactive` no rascunho privado de consulta. Exige treinar,
  fonte concedida e delegação/consentimento vigentes. Preserva SQL, explicação,
  modelo, parâmetros e demais exemplos; não apaga histórico ou muda a publicação
  ativa. ID ausente, inativo/substituído ou revisão obsoleta são conflitos.
  A revisão incrementada invalida prévias anteriores; publicar continua separado.
  Para corrigir e reavaliar, use a substituição explícita, que volta a candidato.
- `persona://{personaId}` e `skill://{personaId}/{slug}`: recursos da mesma persona,
  com os mesmos controles das tools.
- `comparar_conhecimento({fromSkillId,toSkillId})`: compara por seção os snapshots adotados de duas skills ativas de consulta ou operação SQL concedidas do mesmo padrão. Retorna `from`, `to`, `changes` com `section/before/after`, escopo e ausência de autoridade de execução. Não percorre catálogo integral; mesma skill retorna diferenças vazias. Fontes/perfis distintos podem produzir diferenças mesmo na mesma versão do padrão. Versões suspensas, skills sem concessão ou padrões diferentes são recusados.
- `listar_historico_conhecimento({skillId,afterSkillId?})`: histórico limitado às
  versões do mesmo padrão ainda adotadas por skills de consulta ou operação SQL concedidas.
  A skill de referência também precisa estar autorizada. Página de até vinte
  vínculos, ordenados por revisão decrescente e ID da skill; nextCursor segue em
  afterSkillId. Cursor que deixou de ser visível é recusado. Sem snapshot entre
  páginas ou total das versões do catálogo. Retorna referências, revisão, hash,
  data real da publicação e referências de perfil quando adotado; não retorna
  conteúdo. Use obter_skill para reler o recorte concedido de uma skill.
  Versões não adotadas, suspensas ou não concedidas não aparecem. Uma versão
  antiga só aparece se outra skill ativa ainda a usa e está concedida. Não
  recupera publicação substituída/revogada nem atualiza adoções ou permissões.
  Escopo: consultas e operações SQL; histórico editorial integral e comparação editorial continuam
  no console, sob as permissões do catálogo.
- `criar_rascunho_de_template`: importação editorial de versões/hashes exatos
  na própria persona, com treinar, fonte concedida, delegação/consentimento e
  papel editorial vigente. Exemplos selecionados ficam candidatos; dataset é
  revalidado sem retornar linhas. Não lista catálogo ou herda autoridade.
  [Contrato](knowledge-library.md#importação-por-consumidor-administrativo).

O transporte usa o SDK oficial e recria a identidade por requisição. Não mantém
sessão MCP mutável, GET/SSE persistente, subscriptions ou concessão OAuth v2.
POST atende o protocolo legado stateless e 2026-07-28. Bearer inválido retorna
401; indisponibilidade da autoridade local retorna 503. Origin/Host divergentes
são recusados. A composição de desenvolvimento registra consultas por fonte,
cruzamentos e operações treinadas: `preparar_operacao`, `executar_operacao`,
`obter_operacao`, `cancelar_operacao` e `conciliar_operacao`. Preparação não concede
execução; publicação, concessões e aprovação continuam obrigatórias conforme o
contrato. Consulte [consultas](source-queries.md), [cruzamentos](federation.md) e
[operações SQL](sql-operations.md).

## Continuação

Anexos/cache e contextos parcialmente concedidos ainda não têm interface v2.
Consultas pessoais/sensíveis têm finalidades explícitas e concessão integral;
DML/datasets continuam restritos a livre.
O que falta para o aceite está na [matriz](acceptance.md) e no
[trabalho restante](remaining-plan.md).

## Limites publicados

Consultas podem definir `limits` no rascunho e no snapshot: `maxRows`, `maxBytes`,
`timeoutMs` e `pageSize`. Mudanças integram o hash do contrato. Ausência preserva
o comportamento anterior, sem reescrever publicações existentes. União de pacotes
aplica o menor teto de todos os selecionados. Operações usam os limites explícitos
já publicados no treinamento; token/concessão/requisição podem apenas reduzi-los.
[Valores e semântica](source-queries.md#limites-redutíveis).

Histórico e comparação usam, respectivamente, os escopos `granted_active_sql_skills` e `granted_adopted_sql_snapshots`. Operações SQL exigem suas concessões completas de publicação, efeitos e dependências; essa leitura não prepara, aprova ou executa lançamentos. Ferramentas editoriais e obter_padrao continuam restritos ao alcance anterior de consultas.
