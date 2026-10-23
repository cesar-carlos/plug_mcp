# Cadeia persistente integral — 2026-10-20

## Resultado

**79 testes passaram, sem filtro ou omissões, em 604,31 segundos.**
Início 09:32:10 (America/Cuiaba). O runner terminou com código zero e o
removedor confirmou: somente a fixture indicada foi removida.

Execução pelo provisionador e runner do projeto, Persistence prisma, sem
CandidateImage ou TestNamePattern. PostgreSQL, SQL Server e SQL Anywhere
dedicados; MCP do checkout, autoridade Prisma do hub e companion real do agente,
com Socket.IO/RPC/ODBC, cofre e journals de fixture. Não utiliza fontes cadastradas.

## Candidato e ambiente

- MCP base: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, alterações locais.
- Hub: `0dc94d6990167f65e093b1fb68a8150630e2057c`.
- Agente: `3b4f099e64a319a100cd93e00667ffca4afef732`.
- Inventário local capturado durante a rodada: 1075 arquivos,
  `edce86e86b86d46a9e753426bf457108cc699943898115916380f0792e2020ed`,
  authorizesRelease:false.
- Node 24 do wrapper; Flutter local explícito.
- PostgreSQL 17.11; Redis 7.4.11; SQL Anywhere 16.0.0.2043 (64-bit).
- PostgreSQL ODBC: podbc35w.dll 18.00.0000.
- Microsoft ODBC Driver 18: arquivo msodbcsql18.dll
  2018.0186.0001.01 ((DS_Main).170626-2112).

IDs de imagem observados:

- PostgreSQL: `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`
- SQL Server 2022: `sha256:0ec7739e1c5ec2f57861facbe1f2b74f1d3e147c7c97edf91eeea920c5944d9c`
- Redis: `sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499`

SQL Server não aceitou --version e dpkg-query não encontrou o pacote; nenhuma
versão detalhada do motor foi presumida. O ID imutável registra a imagem usada.

Hashes SHA-256:

- `tests/homologation/persona-chain.test.ts`:
  `C86CD10F696E5FB337D4398D0D72A302BBC8B389C4F8248AF67F93935478816C`
- `scripts/run-persona-chain-homologation.ps1`:
  `D8BC796CD66FFE1DC4A8F67602CB0DB0B8729CF165D01FE8DD527308FA4BF57A`
- `scripts/new-persona-chain-fixture.ps1`:
  `9F1F5BBF3F7FAC48D14CB355C8C7978DF4451FEF3CBFA3A96779D7CCB53A6C26`

## Isolamento e alcance

Fixture se7e_persona_5304abaa9027_test, criada nesta rodada com driver PostgreSQL
copiado para diretório próprio. Nenhum arquivo .env, DSN ou cofre operacional
foi usado. O runner confirmou contrato/pin do hub antes dos testes. Não houve
correção de código necessária nesta rodada, reenvio manual ou alteração dos
timeouts. Consultas de estado acompanharam a sessão original até seu término.
Limpeza verificou propriedade dos recursos por script próprio.

Passaram os cenários presentes na suíte, incluindo consultas, inspeção,
publicação/runners, operações, OAuth delegado, conhecimento autorizado,
histórico/comparação mista, cache/anexos e recuperação exercitada pelos testes.
Não transformar esse alcance em prova de todas as janelas de queda possíveis.

Não certifica instalador desktop, concorrência do cofre da aplicação instalada,
imagem final, infraestrutura pública, HTTPS/ChatGPT ou IA consumidora.
Aceite dos gates continua separado. Não houve commit, push, release ou deploy;
ready:false permanece obrigatório.
