# Fluxo persistente MCP → hub → agente nos quatro motores

Rodada de 2026-10-12 (America/Cuiaba), em fixtures descartáveis próprias.
Deploy, publicação de imagens e corte continuam bloqueados; nenhum gate foi
marcado como concluído. [Critérios de aceite](../acceptance.md).

## Candidato e ambiente

| Projeto | HEAD de referência                         |
| ------- | ------------------------------------------ |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` |
| Hub     | `0d2c6b488438a77be71b39e514cd06ab11fbb95e` |
| Agente  | `570e797b728eafa1cdc950be5e446ab7dd1c497c` |

Checkouts contêm alterações locais; os hashes abaixo identificam os arquivos
centrais efetivamente exercitados. Nenhum commit, push ou deploy foi realizado.
Node 24.21.0, TypeScript 7.0.2, Windows e Flutter local do projeto.

| Motor        | Versão observada    | Driver/biblioteca              |
| ------------ | ------------------- | ------------------------------ |
| PostgreSQL   | 17.11               | psqlODBC 18.00.0000            |
| SQL Server   | 16.0.4236.2         | ODBC 18, DLL 2018.0186.0001.01 |
| SQL Anywhere | dbsrv16 16.0.0.2043 | SQL Anywhere 16 instalado      |
| Firebird     | fbclient 5.0.4.1812 | ODBC WI_T2.0.5.156             |

Fixture final `se7e_persona_3b9fe889bff4_test` (rodadas anteriores:
`se7e_persona_5f80027639f0_test`): PostgreSQL com bancos separados de
negócio, controle MCP e hub/Prisma; SQL Server Docker próprio; SQL Anywhere e
arquivo Firebird próprios; portas em loopback e DSN HKCU privado. Redis foi
provisionado, mas seus backends permaneceram desligados nesta rodada. Credenciais
e dados são sintéticos; nenhuma fonte cadastrada pelo usuário foi utilizada.
SQL Anywhere recebeu UUID pelo provisionamento DBA separado, nunca pelo runtime.

## Fluxo e resultados

**16 cenários passaram, sem skips**, na rodada final após a última alteração
do isolamento de ambiente e encerramento dos processos. Duração final: 46,83 segundos. MCP e hub executam
em processos HTTP independentes, sem overrides de gateway, autoridade ou
transporte. O agente usa Socket.IO/RPC, policy, ODBC e journal Drift reais.

- Hub aplica migrations Prisma no banco dedicado. Registro/aprovação de User e
  Client, login Client, solicitação de ClientAgentAccess e aprovação pelo User
  responsável passam pelas rotas reais. Nenhuma concessão direta é semeada.
  O cadastro inicial do catálogo de agentes e seu vínculo ao User são fixtures;
  não representam instalador ou onboarding desktop completo.
- Persona nasce sem fonte, recebe quatro bases pelos cinco campos técnicos e
  obtém banco/motor/identidade pelo hub/agente. Treinamentos privados são salvos,
  revisados por preview/hash e publicados; tokens recebem concessões explícitas.
- Cada motor executa SELECT publicado e adaptado. Leitura da skill fornece
  significado treinado; resultados incluem publicação/hash, fonte, dialeto e
  completude. Resultado vazio permanece distinto de erro. Token sem fonte
  concedida não executa a consulta correspondente.
- Processos MCP/hub são encerrados e iniciados novamente, mantendo PostgreSQL.
  O hub recupera as identidades e aprovações, e agentes renegociam Socket.IO.
  O MCP recupera persona, quatro fontes, publicações e o mesmo token consumidor.
  Sessão/CSRF administrativos antigos são recusados; novo login é obrigatório.
  As quatro consultas voltam a funcionar sem recriar os vínculos ou treinamento.
- Três cruzamentos PostgreSQL/outro motor exercitam dependências publicadas,
  proveniência e recusa por concessão incompleta.
- Nos quatro motores: casos de operação da fixture com rollback, publicação,
  preparação, aprovação Client e INSERT/UPDATE/DELETE; outputs, concorrência,
  contagens, cancelamento anterior ao envio e revogação do consumidor.
- Perda deliberada de confirmação depois de commit nativo conserva resultado
  desconhecido e contagem nula; duplicata não produz novo dispatch. Identidade
  divergente e revogação técnica bloqueiam execução. Não simula queda real
  durante commit nem comprova todas as janelas de recuperação.

| Verificação adicional                                   | Resultado                                         |
| ------------------------------------------------------- | ------------------------------------------------- |
| Unidades persona-v2, 24 arquivos                        | 263 aprovados, sem skips                          |
| PostgreSQL v2, 9 arquivos                               | 136 aprovados, sem skips                          |
| MCP lint, tipos e build                                 | Aprovados                                         |
| Node e compilador real                                  | Aprovados                                         |
| Contrato fixado/training:check MCP e contract:check hub | Aprovados                                         |
| Hub lint                                                | Aprovado                                          |
| Formatação integral e docs:check MCP                    | Aprovados; 78 arquivos, 457 links, zero problemas |
| Guards MCP/hub/agente                                   | Recusa esperada, exit 1 nos três; ready:false     |

Contagens sobrepostas não devem ser somadas como certificação única. Os testes
de manifesto recusam banco hub compartilhado com MCP, host/porta divergentes,
alvo operacional, overrides de conexão, fragmentos e motor ausente.

Processos filhos herdam apenas variáveis de caminhos e ferramentas nativas.
Configuração operacional, credenciais, NODE_OPTIONS e seletores dotenv são
excluídos por allowlist; o caso unitário específico e a cadeia final verificam
essa proteção. Senhas/JWTs sintéticos do hub são gerados pelo controlador.

## Ajustes encontrados

O antigo CPF fixo dos agentes colidia entre rodadas quando os registros passaram
a persistir no hub. A fixture agora gera documentos sintéticos distintos, sem
apagar cadastros para fazer a repetição passar. O reinício confirma que o novo
processo reutiliza as identidades originais, sem semear novamente.

A sessão administrativa antiga foi recusada com 403/CSRF, conforme o middleware,
em vez do 401 inicialmente esperado pelo teste. A expectativa foi corrigida,
sem relaxar autenticação ou CSRF. Erro de cache temporário do sandbox na primeira
regressão unitária foi resolvido executando-a com TEMP/TMP de teste explícito no
cache ignorado do workspace; nenhuma alteração de runtime foi necessária.

## Hashes SHA-256

| Arquivo                                         | Hash                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| MCP tests/homologation/persona-chain.test.ts    | `790d1f2dfd4f7928727c331b2f67d383cf3342315bf52a2c4cb8d3b99a5a1f25` |
| MCP tests/helpers/persona-chain-mcp-server.ts   | `40e56079066c291fae69ae9df735a4100fe0315e7d802ebe3045fc98c9b36bbe` |
| MCP scripts/homologation/chain-manifest.ts      | `273f6c1ecbdca13a9d7a4a419efcac00703289bfc8ab4426ae8a42a1a1fca57f` |
| MCP scripts/new-persona-chain-fixture.ps1       | `53a4176b1526677cbdb4c8527e73bbf71d5cc97a7a0ad49bcef92731bfbb5cf6` |
| MCP scripts/run-persona-chain-homologation.ps1  | `81f3c713bcb5b81d3e518b053604bd1a0926af3a667e600e6f936be7c9a4c9b9` |
| Hub tool/homologation/persona_chain_hub.cts     | `9c2d676a92e906dd165b7a7f6fe6af47be4ec11c6ff2f0535f47134aa0304e58` |
| MCP scripts/homologation/fixture-environment.ts | `3c59076d5f59bd04db33ad52197dbb4da80c440095947e6a4f7ead1a3cd01fed` |
| MCP scripts/remove-persona-chain-fixture.ps1    | `218cba399b850e51f22029980ca7a972e10a0fbc8175f4f55bfeaf1f10b1d0e6` |

## Limites e limpeza

Configuração/cofre desktop do agente ainda são fronteiras de fixture em memória;
metadados dos tokens e journal são arquivos SQLite duráveis. Não houve reinício
do processo agente nem teste de retomada de seus segredos. O companion de casos
aceita a tabela fixa da fixture, não constitui runner genérico de publicação.
Casos de cruzamento usam runner sintético separado. Não houve avaliação da IA,
Chromium, instalação privada ChatGPT, TLS público, Redis distribuído, homologação
de mínimos privilégios nem quedas reais durante commit nesta rodada.

Os processos da rodada final encerraram com código zero. A limpeza conferiu
labels, raiz absoluta, propriedade do DSN/processo SQL Anywhere e ausência de
compartilhamento dos volumes anônimos. Containers, seus volumes exclusivos,
DSN, engine SQL Anywhere e diretório da fixture foram removidos. Nenhum recurso
operacional foi removido. O removedor agora recusa volumes compartilhados ou
nomeados inesperados, evitando deixar volumes anônimos órfãos.
