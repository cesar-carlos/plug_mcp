# Treinamento pela imagem candidata e cadeia persistente — 2026-10-19

## Resultado e alcance

Rodada final dirigida: **1 cenário Chromium aprovado**, 77 casos fora do filtro,
49,01 segundos. Os casos não executados não são evidência de aceite. A rodada
validou a imagem local pela cadeia MCP → hub persistente → agente → três motores,
sem overrides de gateway nem mudança em contratos públicos.

O navegador autenticou o Client de fixture e executou:

- Criação de persona vazia e cadastro de PostgreSQL, SQL Server e SQL Anywhere.
- Treinamento privado de consulta, rascunho, prazo humano, revisão e publicação.
- Emissão de token restrito, teste de conexão e descoberta autorizada.
- Validação e consulta do valor sintético `10.25` em cada fonte.
- Resultado vazio distinto de erro e recusa de DELETE pela ferramenta de leitura.
- Ausência de dados em localStorage/sessionStorage.

O teste conferiu ID da imagem, autoridade Prisma e incremento observado de
`sql.execute` por motor. Totais dos journals RPC da rodada: PostgreSQL 2, MSSQL 2,
SQL Anywhere 3. Essas contagens são metadados do transporte, não avaliação de IA.

## Candidato e ambiente

Inventário local de 1.039 arquivos:
`70e100c35505d0331c309543a57c524b441f1bb9d1a75afba278a46e9303df85`.
[Hashes dos arquivos alterados](2026-10-19-candidate-training-chain-files.json).
Evidência histórica identifica esta rodada; não certifica alterações posteriores.

- MCP base: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
- Hub: `76950497dc386130e13b7d6afc0678e50208e985`.
- Agente observado: `51be477c6d21ccce53cb39feedfb2bb36b5ab65b`.
- Imagem MCP amd64: `sha256:e0f5a9118e8f73bfc1de3dd2dcc29a5089efa471ecc5ff8f76c8782febd9f2c3`.
- PostgreSQL 17 Alpine: `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
- SQL Server 2022: `sha256:0ec7739e1c5ec2f57861facbe1f2b74f1d3e147c7c97edf91eeea920c5944d9c`.
- Redis 7.4 Alpine: `sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499`.
- SQL Anywhere: executável 16.0.0.2043, 64 bits.
- PostgreSQL ODBC: DLL 18.00.0005, extraída em pasta temporária sem instalação global.

Pacote ODBC obtido do [diretório oficial PostgreSQL](https://www.postgresql.org/ftp/odbc/releases/REL-18_00_0005/),
MSI SHA-256 `56345b91e41302271a7ecfc4f4819f49b0fe9fc061bd2b0d72338d81d30597a9`.
DSN próprio foi criado apenas pela fixture. Não foram abertos DSNs/cofres operacionais.
Os IDs de imagem fixam os binários usados; não representam aceite de produção.

## Execução e correções

Wrapper com `-Persistence prisma`, `-CandidateImage se7e-persona-v2-candidate:local`
e filtro `Chromium cria persona`. Tag resolvida antes do teste para ID imutável;
imagem ausente/incompatível não tem fallback para composição de código.
Docker Desktop alcança somente endpoints loopback conferidos da fixture por
`host.docker.internal`; nenhum proxy externo foi aberto.

A primeira rodada passou em 198,28 segundos. Uma tentativa de reutilizar a mesma
fixture encerrou na inicialização do agente, antes do navegador, e foi reprovada.
Não foi tratada como evidência de sucesso. A rodada final usou fixture nova e
as asserções adicionais de imagem/SQL. O wrapper agora recusa reuso de diretório
com sessão anterior antes de iniciar processos; essa recusa foi exercitada.

Limpeza passou a recusar remoção da fixture se houver contêiner controlador
rotulado, mas não registrado entre os recursos de infraestrutura. Teste negativo
com contêiner parado confirmou preservação da pasta; após remover apenas esse
contêiner comprovadamente próprio, a limpeza foi concluída.

Tipos, lint dos testes alterados, build, `training:check`, sintaxe PowerShell,
formatação e `docs:check` foram conferidos. A referência do hub foi preservada;
a primeira execução restrita do verificador encontrou o portão de propriedade
Git do sandbox, e a conferência autorizada passou sem alterar configuração Git.

## Limpeza e limites

As duas fixtures da cadeia foram removidas pelo removedor com conferência de
raiz, labels, volumes, DSN e processo SQL Anywhere. Controladores encerraram o
MCP empacotado. Extração/MSI ODBC temporários também foram removidos. Imagem
local foi preservada; nenhuma imagem foi publicada.

Não certifica matriz integral, DML/recuperação, ARM64, aplicação desktop instalada,
proxy/TLS público, plugin ChatGPT ou IA consumidora. O worker empacotado foi
validado em rodada própria; este percurso usa o servidor candidato. Helpers
especializados de outros casos não passaram automaticamente a testar a imagem.
HTTPS/ChatGPT permanecem manuais, todos os gates abertos e `ready: false`.
Sem branch, commit do projeto, push ou deploy.
