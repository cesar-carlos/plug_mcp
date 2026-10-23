# Revogação remota após leitura no cruzamento — 2026-10-20

## Correção e regressão

O adapter compartilhado entre entradas podia informar approved após uma recusa
atual do hub, usando a aprovação histórica da solicitação. Agora esse conflito
retorna unknown não autorizado; não inventa revogação nem recupera concessões.
A v2 recusa por AUTHORIZATION_DENIED antes de entregar os resultados.

Regressão unitária falhou antes da correção (approved em vez de unknown).
Após a mudança, 23 testes do adapter passaram em 394 ms. Estados históricos
pending/rejected/revoked/expired continuam informativos e não autorizados.

## Cadeia persistente

Rodada dirigida com Persistence prisma e filtro cruza PostgreSQL:
dois testes passaram em 30,98 segundos, início 10:29:36; 77 não selecionados.
Combinações PostgreSQL/SQL Server e PostgreSQL/SQL Anywhere, hub persistente
e agentes reais, bancos dedicados de fixture. PostgreSQL 17, SQL Server 2022,
SQL Anywhere 16; driver PostgreSQL 18 no ambiente local.

Após o segundo SELECT real, um hook remove somente o ClientAgentAccess da
primeira fonte na autoridade de fixture. A entrega retorna AUTHORIZATION_DENIED,
sem dados combinados e sem terceiro SELECT. Finalmente restaura apenas o registro
capturado para limpeza da fixture; isso não implementa recuperação de concessões.
Recursos próprios removidos pelo script de limpeza.

A rodada anterior, antes da correção, recusava por CAPABILITY_UNAVAILABLE:
não foi aceita como prova do diagnóstico de autoridade. Não houve relaxamento
da asserção para aprovar o teste.

training:check confirmou hub 0dc94d6990167f65e093b1fb68a8150630e2057c.
MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
SHA-256:

- plug-server-rest.adapter.ts: F488AF047FA1C2D6E124A7ED928565DA3A5B0AB961B48B57732F54DFBEC56E2C.
- persona-chain.test.ts: A81800BB1207410A74AF2B38223E3C075A0C4E39145102E7E888182352C2638F.

## Limites

Typecheck, lint dirigido, build e formatação do código passaram. docs:check
conferiu 225 arquivos e 1.096 links sem problemas.

Não certifica todas as janelas de revogação, BIGINT nativo, instalador ou imagem
final. A imagem anterior não contém esta correção. HTTPS/ChatGPT permanecem
manuais; ready:false e gates inalterados. Sem deploy, commit ou publicação.
