# Prova SQL Anywhere 16 — 2026-10-15

Evidência parcial de constraints e adoção compartilhada. Deploy e imagens
permanecem bloqueados; nenhum dos treze gates recebe aceite integral nesta rodada.

## Implementação

Prova limitada a PK/UNIQUE/FK declaradas em tabelas-base locais do SQL Anywhere 16.
Views públicas comprovam vínculo da constraint, pares ordenados e índice físico.
FK exige chave declarada/índice físico no pai e configuração verificável de
integridade na conexão. Não usa `not_enforced`, `VALIDATE`, linhas de negócio ou
ensaio de escrita no runtime. Índices comuns/virtuais, proxies, outras versões e
provas insuficientes não habilitam dependências.

O [contrato](../shared-knowledge.md#prova-de-constraints-sql-anywhere-16) descreve
as propriedades e fontes documentais. A linha de comando permanece no motor;
somente o estado derivado é retornado. `Off`/`-gf` produz `disabled`; propriedade
ausente/vazia ou arquivo de opções `@` produz `unknown`. Não certifica todo o
histórico dos dados nem impede mudanças administrativas simultâneas.

Base técnica `persona-v2-sqlanywhere16-constraints-1`. Contrato de transporte e
migrations preservados. Sem adoção automática, reescrita de snapshots, commit,
push ou publicação. Alterações de outras frentes preservadas.

O [inventário](2026-10-15-sqlanywhere-constraints-files.json) registra commits-base,
hashes, versões normalizadas dos motores e versões/hashes dos drivers. Os oito
arquivos acompanhados conservaram os bytes na rodada final. É inventário parcial
do fluxo, sem certificar o checkout inteiro com alterações concorrentes.

## Testes e rodadas

- Agente: **33 testes passaram**, seis casos nativos SQL Anywhere e 27 regressões
  das guardas SELECT/DML. Principal somente SELECT comprovou PK/UNIQUE/FK;
  INSERT e alteração de opções foram recusados.
- DML de caracterização somente em tabelas sintéticas: duplicatas de PK/UNIQUE
  e FK sem pai foram recusadas pelo motor. Nenhuma fonte do usuário.
- `fire_triggers Off` foi testado na conexão nativa. Ausência de backing,
  versão não homologada e propriedade ausente/vazia usam consultas derivadas
  fixas da fixture. `-gf`/`@` usam expressões substituídas; não houve reinício
  do servidor com esses flags nesta rodada.
- MCP: **396 unitários persona-v2 e 194 integrações PostgreSQL passaram**.
  Node 24.21.0, TypeScript 7.0.2, tipos e build passaram.
- Análise Dart passou. Lint dirigido após correção de estilo passou.
- Caracterização inicial: `se7e_persona_dfa091e67319_test`, cinco testes nativos
  passaram antes da ampliação. Tentativa de reutilização falhou no setup por
  tabelas existentes, sem aprovação dos casos. Fixture removida.
- Primeira cadeia: `se7e_persona_8328750e74ad_test`, **34/35 passaram**, 250,84 s.
  A fixture usava índice comum como UNIQUE declarada. Corrigido somente seu DDL
  para `ADD CONSTRAINT UNIQUE`, preservando a prova restrita. Os seis casos
  nativos e 27 regressões também passaram. Fixture removida.
- Final: `se7e_persona_f4c57c9659b4_test`, seis casos nativos e 27 regressões
  passaram. **35/35 cenários da cadeia passaram, 241,73 s**. SQL Anywhere usa
  adoção compartilhada positiva em consulta N:N e DML; drift de FK recusa uso.
- Todas as três fixtures foram removidas pelo script de ownership/alvos.
  Formatação, tipos, build, análise Dart, lint dirigido, `docs:check` e
  diferenças sem whitespace inválido passaram. Não houve novo Chromium ou
  avaliação da IA nesta tarefa.

## Limites do aceite

Cadeia com MCP HTTP, hub Prisma, autenticação/ClientAgentAccess reais de fixture
e agente ODBC com cofre/journal persistentes. Inspeção, consulta N:N e adoção DML
usam a guarda estrutural real. O fluxo consumidor de publicação, preparação,
aprovação e execução também integra a suíte.

Não certifica matriz integral de perfis/constraints, versões/ drivers, permissões
remotas, janelas de crash, instalador desktop, TLS público, plugin ou IA. O runner
relacional de operador é distinto do aceite integral de negócio. Nenhuma regra
comercial Data7 foi inventada. Os treze gates continuam pendentes.
