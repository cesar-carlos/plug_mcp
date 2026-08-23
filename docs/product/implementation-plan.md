# Plano de implementação (escopo atual)

O MCP é cofre + grafo de treino + **skills como bússola da consulta**. Fora de escopo: Authorization Server próprio, JWT de conta MCP, Client de serviço no `.env`, catálogo pronto (`vendas`/`produtos`/`clientes`), SQL ad-hoc derivado do grafo. Norte: [objective.md](objective.md).

## Entrega

- Cofre: `usuario_mcp` + `acesso` (N pares `agentId`/`client_token`).
- Tool pré-auth `registrar_acesso` + `GET /setup/{code}`.
- `UsuarioTokenManager` com e-mail/senha cifrados; login/refresh no hub por usuário.
- Grafo compartilhado por `agentId` (tabela/coluna/relacionamento com proveniência).
- `treinar_com_sql`: SELECT nomeado, JOIN se >1 tabela, merge só após `sql.execute` + policy.
- Skills (rascunho → validada → publicada): são o que a IA usa na pergunta do usuário. Treino sem skill publicada não habilita consulta.
- Postgres+pgvector obrigatório em produção; Redis para cache de JWT/policy/rate-limit.

## Critérios de sucesso

- Bootstrap sem Bearer só com `registrar_acesso`; token MCP nunca na resposta da tool.
- Dois usuários no mesmo `agentId` leem o mesmo grafo; policy recorta a leitura.
- Dialeto travado no primeiro treino; conflito vira `DIALECT_CONFLICT`.
- Sem `jose`/`bcryptjs`/`cookie-parser` no runtime.
