# Integrações condicionais com fixtures — 2026-10-20

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, alterações locais.
Continuação da rodada local consolidada: os testes condicionais foram executados
com PostgreSQL e Redis exclusivos, sem reutilizar banco persona-v2 ou operacional.

## Resultado

Wrapper Node 24 do projeto; migration legada chamada diretamente por tsx, sem
carregar arquivo .env. Aplicadas migrations 0008–0034 em banco novo.

Vitest executou:

- `tests/integration/encryption-rotation.test.ts`
- `tests/integration/redis-singleflight.test.ts`
- `tests/integration/treinamento-curadoria.test.ts`
- `tests/integration/conhecimento-fts.test.ts`
- `tests/integration/query-results.test.ts`
- `tests/integration/publication-authority.test.ts`
- `tests/evaluation/scenarios.test.ts`

**192 testes passaram em sete arquivos, sem omissões, em 7,46 segundos.**
O conjunto inclui casos já executados na suíte geral; não somar os totais
como testes distintos. Os cenários de referência são harness técnico, não
avaliação da IA consumidora.

A primeira tentativa passou em 191 testes e falhou no runner CLI de curadoria:
o banco tinha sufixo _test, mas o runner exige se7e_*ci, CI e habilitação
explícita. A segunda fixture usou se7e_local_gate_ci; nenhum guard foi removido
ou relaxado. A regressão repetida passou integralmente.

## Isolamento e limites

PostgreSQL da imagem pgvector/pgvector:pg16 reproduz o serviço legado do CI;
Redis redis:7-alpine, portas locais dinâmicas e containers com nomes aleatórios.
Variáveis de conexão/chave sintéticas definidas somente no processo da rodada.
Containers removidos no finally, variáveis descartadas e nenhum arquivo de
ambiente operacional aberto. Não foi migrado banco v2 ou banco do usuário.

Essa rodada cobre as integrações condicionais identificadas na suíte geral.
Não certifica a integração persona-v2, cadeia hub/agente dos três motores,
imagem final, HTTPS/ChatGPT ou IA. Deploy e gates permanecem bloqueados.
