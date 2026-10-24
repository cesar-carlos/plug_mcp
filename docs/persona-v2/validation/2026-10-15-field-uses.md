# Permissões por campo e finalidade — 2026-10-15

Evidência parcial da persona-v2. Deploy/imagens permanecem bloqueados:
treze gates requeridos, nenhum encerrado e `ready: false`.

## Implementação

Consultas publicam `columns[].uses` e `usePurpose`. Dados pessoais/sensíveis
exigem finalidades explícitas e justificativa; segredo/inferido não executam.
Campos livres sem configuração conservam as consultas anteriores. Finalidades
entram no contrato/hash e nas capacidades explícitas por fonte/recurso/campo/uso.
Token manual e consentimento OAuth devem cobrir a publicação inteira; não há
contexto parcial nem ampliação automática de concessões antigas.

AST distingue projeção, filtro, JOIN, agrupamento/agregação e ordenação.
Aliases, posições, CTEs, derivadas e UNION conservam a linhagem física.
Combinações multifonte verificam usos adicionais de chaves, dimensões, medidas
e ordenação, inclusive após renomeação. Formas sem prova de finalidade recusam
uso; limites conservadores estão no [contrato](../source-queries.md#campos-e-finalidades).

Contexto/busca/grafo incluem campos executáveis somente na publicação integral
concedida. Adoção de consulta compartilhada preserva classificação e exige usos
locais; o padrão não concede autoridade. Console configura os usos, explica o
conjunto exigido e permite retirar/restaurar capacidades no token. Não houve
migration, alteração do contrato hub/agente, reescrita de snapshot ou DML de usuário.
Base técnica: `persona-v2-field-uses-1`.

## Rodadas e resultados

- Rodada intermediária: **38/38 cenários** da cadeia persistente, **232,21 s**, fixture
  `se7e_persona_c3de77455666_test`. MCP HTTP → hub Prisma com autenticação e
  ClientAgentAccess reais de fixture → agente ODBC, DPAPI/configuração/journal
  duráveis → PostgreSQL, SQL Server e SQL Anywhere.
- Final, após fechar agregação em HAVING/ORDER BY, deduplicação/ordenação de
  UNION e subconsulta escalar: **38/38 passaram**, **209,70 s**, fixture
  `se7e_persona_0870561961b8_test`. Acrescentada recusa nativa de HAVING com campo
  pessoal concedido apenas para filtro. Versões normalizadas observadas via
  `sql.describeSchema`: PostgreSQL `17.0.11`, SQL Server `16.00.4236`,
  SQL Anywhere `16.00.0000`.
- Em cada motor: publicação pessoal apenas para filtro, consulta retorna só ID,
  tentativa de projeção/ordenação/agrupamento/derivada recusada; token incompleto
  e token anterior recusados inclusive em leitura da skill. Outra publicação
  concede explicitamente campos pessoais/sensíveis para projeção, filtro, JOIN
  pela PK, agrupamento e ordenação, com consultas reais positivas.
- Os 35 cenários anteriores também passaram, incluindo conhecimento, operações,
  cruzamentos e reinícios. Isso não transforma seu alcance em matriz integral.
- Primeira rodada: fixture `se7e_persona_bc8746188e3f_test`, **35/38 passaram**,
  272,82 s. Os três novos casos omitiram `expiresAt` no pedido de emissão do token
  e pararam com HTTP 400. Corrigido o contrato da fixture, sem flexibilizar a API.
- **410 unitários v2**, **194 integrações PostgreSQL** e **71 regressões SQL do
  legado** passaram. Cobrem finalidades, segredo/inferido, justificativa, aliases,
  janela, CASE, DISTINCT, UNION, concessão antiga/OAuth/delegação e adoção pessoal.
- **32 testes web**, lint/tipos/build web passaram. **2 jornadas Chromium passaram**:
  editor → publicação → token → consulta sem expor o campo pessoal usado no filtro.
  A regressão de inspeção, publicação de perfil e adoção exata também passou.
  Duas tentativas anteriores falharam por seletores do teste; ajustados aos nomes
  acessíveis reais. Não houve relaxamento da autorização ou timeout.
- Tipos/build com Node **24.21.0** e TypeScript **7.0.2**, lint dirigido,
  formatação e `docs:check` passaram. Inicialmente os testes em sandbox falharam
  no diretório TEMP; repetidos com TEMP de teste no workspace. Não foi falha SQL.
- As três fixtures foram removidas pelo script de ownership, incluindo bancos,
  containers, DSN e processo SQL Anywhere pertencentes à rodada. Chromium e
  integrações usam bancos descartáveis próprios no mesmo servidor de fixture.

O [inventário](2026-10-15-field-uses-files.json) registra commits-base
e hashes de arquivos do fluxo, além dos drivers observados. É parcial, com
checkout sujo preservado e trabalho concorrente de instalação fora deste bloco.
Não é snapshot integral de release. A rodada final exportou somente versões
nativas observadas pela inspeção; não copiou bootstrap ou credenciais ao relatório.
Hashes do fluxo foram acompanhados durante/fim da rodada, sem certificar os
demais arquivos do checkout. Relatório anterior não certifica o novo candidato.

## Limites e pendências

Exportação/anexos permanecem indisponíveis mesmo se declarados. DML e datasets
continuam livres. Projeção pessoal/sensível autorizada entrega valores sem
mascaramento implícito; concessão não promete anonimização.

Não homologa concessão parcial da mesma skill, todos os formatos de SQL,
matriz real ampliada de campos pessoais em conhecimento compartilhado e
cruzamentos, leitores de tela/zoom/móvel, instalador, TLS público, plugin,
integrações externas ou IA consumidora. Os checks desta rodada não encerram
nenhum gate da [matriz de aceite](../acceptance.md). Sem commit, push ou deploy.
