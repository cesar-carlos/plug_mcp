# Avaliador v2, privilégio SELECT e recuperação nativa

Data: 2026-10-24, America/Cuiaba. Base MCP
`dbc74e22b568902ffa01fb347ac94be9e5b52f83`, acrescida dos arquivos locais do
avaliador e sua documentação. Esta rodada não certifica imagem publicada ou
aceite de modelo. Hub isolado `da457e05e3fd4ee407d7aefb2c58d82c7e6d92f5`;
agente isolado `e992cbaa35fef6c764dfea4a1dab9550bff66f59`.

## Resultados

- Núcleo do avaliador: 13 testes passaram, incluindo referência não entregue ao
  consumidor, escrita recusada, limite de chamadas, callback encerrado, fonte
  incorreta, ausência de execução, falha/parcialidade e comparação sem coerção.
- Diretório de avaliação antes dos três últimos testes: 111 passaram, 70 casos
  legados condicionais ficaram skipped. Esses skips não constituem aceite.
- TypeScript e ESLint dos novos testes passaram. `docs:check` sem problemas.
- SQL Anywhere: seis testes nativos de `sql_anywhere_constraints_test.dart`
  passaram. Incluem principal novo com SELECT em duas tabelas da fixture,
  confirmação de constraints e recusa de INSERT e alteração de `fire_triggers`.
  É ensaio ODBC nativo; não certifica privilégios mínimos de PostgreSQL/MSSQL
  nem autorização completa MCP → hub → agente.
- Recuperação: nove testes de
  `sql_operation_dart_recovery.integration.test.ts` passaram, sem filtro,
  em 115,75 segundos (09:18:06–09:20:02). Matriz PostgreSQL/MSSQL/SQL Anywhere
  × before-commit/after-commit/in-flight-commit, com queda e reinício reais dos
  processos de fixture, journal e transporte do hub. A autoridade Socket.IO
  desse ensaio é sintética; não representa hub Prisma completo nem jornada MCP.

A primeira tentativa de recuperação falhou na inicialização, sem executar
casos: `DATABASE_URL` ausente. A repetição forneceu somente `hubDatabaseUrl` do
manifesto privado; não carregou `.env` operacional nem reduziu assertions.

## Isolamento e rastreabilidade

Fixture privada `se7e_persona_94f848c5d975_test`, criada pelo script do projeto
com ACL privada, credenciais aleatórias, containers próprios e SQL Anywhere
próprio. Não utilizou fontes de usuários. Remoção validada pelo manifesto e
confirmada; logs privados foram removidos com a fixture. Hashes dos logs antes
da limpeza (identificadores históricos, não artefatos recuperáveis):

- constraints: `F0EED786B8278135F18CB40FFBAC269CE9A921661EC6759770AA7DAE63CE4646`.
- tentativa inicial: `CFB28BBB291B13088B42E45AA35614E30F0F4373443A8A4AF303EB7BA435F3F8`.
- recuperação: `8F407796D34627F7EE3D441D3FCF092114532B5B1C6E7E43ABE26190696F9D57`.

## Pendências preservadas

Executar modelo/julgador reais com dataset revisado e transporte autorizado,
provar privilégios mínimos nos demais motores e completar as jornadas persistentes
restantes. A nova implementação é o núcleo/CLI, não o adaptador concreto do
provedor de IA. A validação manual real de HTTPS/ChatGPT e o aceite funcional humano foram dispensados por DV2-015, sem declaração de aprovação. `ready: false` inalterado;
nenhum deploy, alteração de token ou mudança de aplicação operacional.
