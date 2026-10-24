# Casos externos com administração delegada — 2026-10-19

## Entrega

As ferramentas obter_testes_skill e editar_caso_skill e as rotas administrativas
Bearer/OAuth aceitam acao_externa. Exigem treinar, delegação vigente do responsável,
consentimento aplicável e concessão exata da skill e operação publicadas. O hash
compilado precisa corresponder à publicação concedida. A sessão Client mantém seu
fluxo anterior. Nenhuma ferramenta executa runner, ação externa ou aprovação humana.
Editar casos por CAS torna os relatórios anteriores obsoletos, preservando o snapshot.

## Validação e limites

Suíte setup-delegation.postgres.test.ts: **75 testes aprovados em 31,72 segundos**,
com PostgreSQL 17 de fixture isolada. Novos cenários exercitam leitura/edição MCP,
remoção HTTP, conflito de revisão, relatório obsoleto, concessões incompletas,
consentimento OAuth limitado/completo/revogado, persona divergente, token revogado
e autoridade remota indisponível. Nenhum provedor é chamado por essas ações.

Tipos, lint dos arquivos afetados, formatação e build passaram. A rodada intermediária
recusou tentativa de alterar consentimento na preparação do teste; corrigida para
criar outra concessão imutável, sem relaxar a proteção do banco.

Autoridade do hub e transporte externo são simulados nesta suíte. Não certifica
cadeia dos três motores, HTTPS, ChatGPT, imagem candidata ou aceite integral.
HTTPS e ChatGPT permanecem manuais; ready:false e gates abertos. Nenhuma migration,
credencial operacional, publicação de imagem ou deploy foi realizado.

## Limpeza e revisão

Após o teardown, a fixture tinha somente postgres e persona_external_delegation_test.
Label external-delegation-20261019 conferida; contêiner próprio e volume removidos.
Base MCP 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais; Node 24
pelo wrapper do projeto. Hashes SHA-256 do conteúdo validado:

| Arquivo                                                        | SHA-256                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| src/application/persona-v2/external-integrations.ts            | d50048c91f33f459c5f10f17f59d4dfe53ce6b435db9731fdbb0061d3f914633 |
| src/infrastructure/http/persona-v2-delegated-administration.ts | dae8a3f476ba23d284340b5855dacb1cee0e37e5f44a91ec36a995d0bf6eb78d |
| src/infrastructure/mcp/persona-v2-administration-tools.ts      | 415c705e151db4c8f394db1feb8d0ecbde8ca63b0fab7f942c05cba77d1dc44c |
| tests/persona-v2/setup-delegation.postgres.test.ts             | ec3689f2769faf59a04825e95d3eb7245b85ed3962558eebedaa3dd2aa9dcbe7 |
