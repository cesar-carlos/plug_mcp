# Objetivo de produto

Uma persona reúne especialidade, fontes de dados e skills publicadas. O responsável
administra seu treinamento e emite tokens com concessões explícitas. A IA cliente
interpreta pedidos e usa esse contexto para consultar, cruzar dados ou preparar
operações treinadas.

O MCP fornece base SQL/API, cofre, curadoria e controle de execução. Não hospeda
modelo de IA, embeddings ou treinamento de pesos. Busca lexical ajuda a encontrar
publicações; não aprova significado nem autoriza SQL.

Estrutura, relacionamentos e exemplos podem ser reutilizados por padrões
versionados e particularidades da base em catálogos concedidos explicitamente.
Curadores publicam; cada skill fixa versões e exige compatibilidade comprovada.
Credenciais, resultados, recortes e concessões permanecem próprios. O
[contrato compartilhado](../persona-v2/shared-knowledge.md) distingue o catálogo
administrativo já entregue da associação executável ainda pendente.

## Identidade e autoridade

- Responsável: origem do hub + client.id. Pode administrar personas sem fontes
  iniciais e conectar fontes com contas Client distintas.
- Fonte: finalidade, motor, identidade física comprovada, recortes e credencial
  própria. Banco vem da policy; identidade não é inferida de nome ou dialeto declarado.
- Skill: identidade, rascunho editável e publicação ativa imutável.
- Token: concessões explícitas sobre fontes, publicações, capacidades e efeitos.
  Adicionar recursos ou publicar ampliação não amplia tokens anteriores.

A execução exige publicação utilizável, concessões e portões vigentes de JWT Client,
ClientAgentAccess e policy do client_token. Grafo, rascunho, resultado técnico e
persona textual não concedem acesso. Restrições, revogações e mudança incompatível
de fonte suspendem o uso afetado; não reassociar treino automaticamente.

## Consulta e operações

Bases de negócio são acessadas somente por MCP → plug_server → plug_agente → banco.
O hub encaminha comandos; o agente executa no motor. O MCP abre apenas seu banco
de controle. Dialeto e identidade são confirmados pelo agente.

SELECT admite adaptação somente dentro do pacote publicado: nomes físicos exatos,
classificações, parâmetros, recortes, relacionamentos compostos e grão/fanout.
Filtrar e agregar localmente acontece no banco. Validação executa envelope vazio;
não aprova significado de negócio.

Cruzamentos fixam publicações de cada fonte e combinação tipada. Cada dependência
precisa de concessão; entradas incompletas não sustentam totais. Não há SELECT
distribuído nem promessa de snapshot transacional entre bases.

Operações SQL usam contrato próprio, preparação imutável, aprovação quando exigida,
uma fonte/transação e journal durável. Adaptação preserva valores, identidade,
concorrência e recortes. Resultado desconhecido nunca autoriza reexecução.
Evidência de conciliação não fabrica comprovante técnico ou rollback.

## Treinamento e resposta da IA

Base comum orienta; pacote publicado e concessões autorizam; persona personaliza.
Execução técnica preserva definição, classificação e cardinalidade confirmadas.
Mudanças semânticas exigem curadoria, casos aplicáveis e nova publicação por
preview/hash/CAS. IA não aprova relatórios do runner separado.

Não inventar tabelas, JOINs, regras, métricas ou valores. Informar origem, filtros,
horário e completude. Consulta vazia, erro, recusa e truncamento são distintos.
Nunca somar uma página como se fosse o conjunto inteiro.

Credenciais entram somente pelo navegador. Auditoria registra IDs e metadados
permitidos, não SQL, perguntas, parâmetros, resultados ou segredos.

## Estado da entrega

O [estado persona-v2](../persona-v2/README.md) distingue o que funciona em
desenvolvimento e o que falta para o aceite. Console completo, integrações,
OAuth v2 e homologação integral continuam pendentes. O manifesto bloqueia deploy.

A entrada principal ainda mantém o contrato legado por acesso. Esse modelo é
referência de compatibilidade, não invariante do produto novo. Contratos específicos
e ordem de leitura: [índice](../README.md).
