# Casos de cruzamento por OAuth — 2026-10-19

Complementa a [entrega delegada](2026-10-19-delegated-cases.md), sem mudar seu
relatório histórico. Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com
alterações locais. Arquivo de teste `tests/persona-v2/setup-delegation.postgres.test.ts`
SHA-256 `2228353729a8f0350951368de40da185ea628869618533219823d7dfcdd0c9d8`.

## Evidência

Suíte completa de setup/delegação: 70 testes aprovados, sem omissões, em 31,47 s.
Lint do arquivo afetado e typecheck aprovados. Nenhuma mudança funcional ou
contrato do hub nesta rodada.

O novo cenário cria duas fontes e suas consultas publicadas na fixture,
concede fontes/skills e cria o rascunho de cruzamento. Usa o serviço OAuth real
com armazenamento PostgreSQL: transação, autenticação, consentimento explícito,
PKCE S256, código e emissão de access token. Resolve o token na composição HTTP
v2 e chama `/mcp/chatgpt` e a administração HTTP OAuth.

- Leitura de casos/relatórios e criação de caso de cruzamento pela conexão concedida.
- Consentimento sem `treinar`: leitura e edição recusadas.
- Consentimento restrito a uma fonte/skill: leitura e edição do cruzamento recusadas.
- Revisão antiga em POST: conflito 409, sem sobrescrita.
- Relatório permanece ausente e aprovação técnica falsa; nenhuma tool executa runner.
- Revogar a concessão impede acesso; o Bearer originador continua autorizado.

PostgreSQL 17 Alpine com banco-base exclusivo `persona_oauth_cases_test` e banco
aleatório da suíte. Banco da suíte removido no teardown; contêiner e volume anônimo
removidos após conferir ID completo e rótulo `se7e.fixture=oauth-cases-20261019`.

## Limites

Hub, identidade e inspeção são fixtures; não houve consulta de negócio ou runner
na cadeia dos três motores. O fluxo OAuth foi exercitado pelo serviço e transporte
HTTP local, sem navegador externo, TLS público ou cliente ChatGPT instalado.
Concorrência/revogação em todos os pontos de execução e aceite do candidato final
continuam pendentes. Teste técnico não é avaliação da IA.

HTTPS/ChatGPT seguem manuais. `ready: false`, sem encerrar gates, publicar ou fazer deploy.
