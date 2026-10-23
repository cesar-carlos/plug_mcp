# Cofre persistente e reinício do agente pela cadeia real

Rodada de 2026-10-12, America/Cuiaba. Complementa a
[rodada persistente MCP/hub](2026-10-12-persistent-onboarding-chain.md).
Nenhum gate foi encerrado; deploy, imagens e corte permanecem bloqueados.

## Candidato e ambiente

| Projeto | HEAD de referência                         |
| ------- | ------------------------------------------ |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` |
| Hub     | `0d2c6b488438a77be71b39e514cd06ab11fbb95e` |
| Agente  | `570e797b728eafa1cdc950be5e446ab7dd1c497c` |

Checkouts têm alterações locais. Os hashes abaixo identificam os arquivos
efetivamente exercitados; HEAD sozinho não identifica este candidato. Sem
commit, push, publicação de imagens ou alteração da entrada principal.

Windows, Node 24.21.0, TypeScript 7.0.2, Flutter 3.47.5, Dart 3.13.4,
flutter_secure_storage 11.2.0 e flutter_secure_storage_windows 4.2.2.

| Motor        | Versão              | Driver/biblioteca              |
| ------------ | ------------------- | ------------------------------ |
| PostgreSQL   | 17.11               | psqlODBC 18.00.0000            |
| SQL Server   | 16.0.4236.2         | ODBC 18, DLL 2018.0186.0001.01 |
| SQL Anywhere | 16.0.0.2043         | SQL Anywhere 16 instalado      |
| Firebird     | fbclient 5.0.4.1812 | ODBC WI_T2.0.5.156             |

Fixture própria `se7e_persona_3a0e4f536698_test`: três bancos PostgreSQL
separados (negócio, MCP, hub/Prisma), SQL Server Docker, SQL Anywhere próprio,
arquivo Firebird e DSN HKCU privados. Portas loopback; credenciais e dados
sintéticos. Redis provisionado, com backends desligados. UUID SQL Anywhere
provisionado pelo procedimento DBA separado; runtime não cria identidade.

## Implementação e evidências

O companion substitui `_FixtureConfig` e `_FixtureSecrets` pelos repositórios
reais AgentConfigRepository, HubSessionStore, OdbcCredentialStore e
ClientTokenRepository. Metadados são persistidos em Drift/SQLite separados por
agente lógico. O resolver ativo hidrata as credenciais ODBC pelo cofre antes de
entregá-las ao adapter que abre a conexão de negócio.

Os adapters FlutterSecure de autenticação hub, senha ODBC e token técnico usam
o backend real Windows DPAPI do plugin. Só a consulta do diretório de suporte
é redirecionada para a sessão temporária. Criptografia, gravação, leitura e
recuperação não usam mocks. Migração de armazenamento antigo está desabilitada;
o cofre operacional do desktop não é aberto. Um processo companion hospeda
quatro agentes lógicos, cada um com configuração, tokens, conexão e journal
próprios. O cofre da sessão contém chaves separadas por motor.

O teste recusa senhas/JWTs em colunas de configuração e token em claro no
SQLite. O índice de bootstrap persistido contém somente configId/tokenId;
não contém credenciais. Cofre ausente, corrompido ou sem senha ODBC impede
recuperação sem recriar token nem aproveitar o segredo ainda presente no
manifesto inicial.

**17 cenários da cadeia passaram, sem skips**, na rodada final às 22:15:48,
com duração de 57,19 segundos. A rodada anterior já cobria recuperação de
journal; a final acrescenta envio deliberado de duplicata de fixture após o
reinício, para verificar a proteção durável do agente.

- Criar persona vazia, cadastrar quatro fontes com os cinco campos técnicos,
  confirmar identidade/dialeto, treinar, publicar, conceder tokens e consultar
  pela composição real MCP → REST hub → Socket.IO/RPC agente → ODBC.
- Parar MCP/hub, reiniciar o hub Prisma no mesmo endpoint e parar/reiniciar o
  processo agente. Antes da recuperação, remover conexão ODBC e JWT/refresh
  do manifesto de bootstrap. O agente recupera os segredos exclusivamente
  do cofre; configId, agentId, tokenId e hash do token continuam iguais.
- Reabrir MCP, recusar sessão administrativa antiga, reautenticar e consultar
  as mesmas fontes/publicações com o Bearer anterior nos quatro motores.
- Exercitar DML treinado, aprovação humana, rollback, concorrência, cancelamento,
  revogação e perda de confirmação injetada após commit nativo.
- Reiniciar o agente novamente e consultar os quatro journals por hub/RPC,
  evitando o comprovante local do MCP. Estado desconhecido, executionId e
  contagem nula persistem. Duplicata do mesmo plano retorna o mesmo comprovante;
  não cria nova execução nem modifica os dados. O controlador não implementa
  retry automático; o envio é deliberado e exclusivo da fixture.
- Consultas e cruzamentos publicados continuam funcionando; identidade
  divergente e revogação técnica continuam bloqueando SQL.

| Verificação adicional                                                 | Resultado                                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Agente: cofre nativo e compatibilidade do repositório de configuração | 12 aprovados; inclui 4 casos novos de cofre                          |
| Agente: análise e formatação dos três arquivos Dart alterados         | Aprovadas, sem issues                                                |
| MCP: unidades persona-v2                                              | 263 aprovados, 24 arquivos                                           |
| MCP: PostgreSQL v2                                                    | 136 aprovados, 9 arquivos                                            |
| MCP: lint, tipos, build, Node e compilador real                       | Aprovados                                                            |
| MCP training:check e contrato fixado; hub lint/contract:check         | Aprovados                                                            |
| MCP format:check e docs:check                                         | Aprovados; 79 arquivos, 464 links, zero problemas                    |
| Guards MCP/hub/agente                                                 | Recusa esperada, exit 1 nos três; ready:false, zero gates concluídos |

Contagens sobrepostas não certificam aceites independentes. A primeira tentativa
da regressão PostgreSQL foi recusada pelo sandbox (`EACCES`); repetida com
acesso local autorizado, aprovou os 136 casos sem skips. A checagem de contrato
fixado também foi repetida com permissão de leitura Git do hub. Não houve
relaxamento de testes ou uso de alvo operacional para contornar essas recusas.

DTD foi consultado e conectado, sem aplicação Flutter ativa. Hot reload foi
solicitado e informou ausência de app; os companions foram iniciados em novos
processos para cada reinício, sem abrir o desktop operacional.

## Hashes SHA-256

| Arquivo                                                | SHA-256                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| MCP tests/homologation/persona-chain.test.ts           | `fe3becad6603ac8137e656839fd1c600b51bc8a265a971dca4d47177c46e40e3` |
| MCP scripts/run-persona-chain-homologation.ps1         | `9e367ee7125494d6b43d867cc88febfe46ee64688a7a53d9e09be2a73898d199` |
| MCP scripts/homologation/fixture-environment.ts        | `3c59076d5f59bd04db33ad52197dbb4da80c440095947e6a4f7ead1a3cd01fed` |
| Agente tool/homologation/persona_chain_agent_test.dart | `e012320152f65dacc6755e3feb903e916ac946bff010249acd457574f00e252f` |
| Agente tool/homologation/persona_chain_storage.dart    | `72cfaab9f5f90979b9eb732f537855c570529ed00efb0862a208d909d03357d7` |
| Agente test/tool/persona_chain_storage_test.dart       | `5667f972e0f07b3f33ed05a0df0ded5d4e6f3f413cf65ff3f4e9e0c45fcf6f4a` |
| Agente pubspec.yaml                                    | `28cde8ac8b5a9f2815a286df255cdd259124d07aa47f245d3e16101246bd4112` |
| Agente pubspec.lock                                    | `32ac4dd554c137db906e37e03d1d027cf284656a17e7891405464be678421aaf` |
| Hub tool/homologation/persona_chain_hub.cts            | `2633faab275b39c66b021fd52254e3f9df6079a3dcdaaaa355c42e609cd81db2` |

## Limites e limpeza

Não certifica bootstrap/instalador desktop, múltiplos processos gravando no
mesmo cofre, flags persistentes da aplicação, TLS/proxy/DNS públicos, Redis
distribuído, rotação/expiração real de JWT ou quedas reais durante commit.
O backend Windows foi exercitado sob flutter test com FFI nativo; não houve
homologação dos backends de cofre de outros sistemas operacionais.

O runner de publicação ainda é limitado à tabela fixa de fixture; não é o
runner genérico do produto. Cruzamentos têm avaliação técnica separada,
sem constituir avaliação da IA. Sem Chromium, cliente ChatGPT privado, IA
consumidora, matriz integral de tipos/triggers ou imagens candidatas nesta rodada.

Todos os processos próprios encerraram com exit 0. O removedor verificou
caminhos, labels, volumes exclusivos, DSN e processo SQL Anywhere e removeu
somente essa fixture, inclusive os cofres DPAPI temporários. Os quatro
diretórios vazios deixados pelo primeiro teste de caminho foram removidos por
nome exato, após conferir pai e ausência de arquivos. Armazenamentos do
hub/agentes operacionais, contêiner PostgreSQL preexistente e bases de usuários
permaneceram intactos. Não registrar manifestos, arquivos de cofre, logs privados
ou segredos sintéticos como anexos desta evidência.

Critérios restantes: [plano](../remaining-plan.md) e [aceite](../acceptance.md).
