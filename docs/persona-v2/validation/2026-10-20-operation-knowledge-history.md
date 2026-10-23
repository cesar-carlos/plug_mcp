# Histórico e comparação de operações SQL — 2026-10-20

## Entrega

Histórico e comparação agora aceitam snapshots adotados por consultas e operações
SQL ativas concedidas. Reutilizam a autorização completa da publicação de operação,
com efeitos, capabilities, fonte e dependências vigentes. Não preparam, aprovam ou
executam operações. A comparação permanece limitada ao mesmo padrão, com direção,
referências exatas e diferenças por seção dos recortes adotados.

Escopos passam a `granted_active_sql_skills` e `granted_adopted_sql_snapshots`.
Ferramentas editoriais e obter_padrao conservam seu contrato anterior de consultas;
um helper privado permite ampliar só histórico/comparação, sem autorizar propostas
ou navegação adicional no catálogo.

## Validação

**3 testes aprovados em 47,41 segundos** pela cadeia persistente com hub Prisma,
PostgreSQL, SQL Server e SQL Anywhere. Filtro `casos nativos com rollback`;
76 outros casos excluídos pelo filtro, sem representar aceite integral.

Cada cenário publica uma segunda versão do padrão e outra skill de operação,
executando os casos obrigatórios pelo runner real em fixture isolada. Valida:

- Histórico com as duas versões na ordem prevista.
- Diferença de label v1/v2 e referências publicadas, sem autoridade de execução.
- Token antigo não vê a nova skill nem compara seu conteúdo.
- Suspensão da versão antiga impede comparação dependente e preserva o vínculo novo.
- Fluxo já existente de preparação, aprovação, DML, rollback e journal permanece válido.

Regressão PostgreSQL de controle: **14 testes aprovados em 9,95 segundos** nas
suítes structure-composition e knowledge-context. Essas suítes usam autoridade
simulada e não substituem a cadeia acima. Contêiner próprio
`se7e_op_history_75678b7fa35e_test` removido; teardown da cadeia também confirmou
remoção somente da fixture criada. Nenhuma fonte operacional foi utilizada.

Tipos, lint dirigido, build e formatação passaram. Node 24 e TypeScript 7 do
projeto. Runner verificou training:check e referência do hub
`0dc94d6990167f65e093b1fb68a8150630e2057c`.
Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, mais alterações locais.
Provisionador PostgreSQL 17, SQL Server 2022 Developer e SQL Anywhere 16.
Builds exatos dos drivers não foram transcritos nesta rodada.

SHA-256:

- `src/application/persona-v2/consumer-catalog.ts`:
  `3d9fa13c0f027fbac96dbe35253b9a2f14e235f6b228c5075460e4b3dc5990e2`.
- `tests/homologation/persona-chain.test.ts`:
  `6ab1645054d1553a0eaa8098a61d3e40986b65d056db51effcc9986839a2e50e`.

## Limites

OAuth específico do histórico/comparação de operações, paginação ampliada com
operações, comparação mista consulta/operação e matriz concorrente integral ainda
não foram homologados. Evidências OAuth de consultas não certificam automaticamente
o novo alcance. HTTPS/ChatGPT seguem manuais. Sem migration, commit, push ou deploy.
Manifesto conserva ready:false e gates abertos.
