# Plano de implementação (escopo entregue)

Lista do que **já está no código**, não um backlog. Norte vivo: [objective.md](objective.md). Fora de escopo: Authorization Server próprio, JWT de conta MCP, Client de serviço no `.env`, catálogo pronto, Socket/relay de consumer. Três camadas (histórico): [proposta-arquitetura-mcp-se7e.md](../proposta-arquitetura-mcp-se7e.md).

## Entrega

- Cofre: `usuario_mcp` + `acesso` (N pares `agentId`/`client_token`, escopo empresa/filial, fuso, persona opcional).
- Tool pré-auth `registrar_acesso` + `GET /setup/{code}`.
- `UsuarioTokenManager` com e-mail/senha cifrados; login/refresh no hub por usuário.
- Grafo compartilhado por `agentId` (JOIN composto com `pares[]`, proveniência, papel, perfil, `sensibilidade`).
- `treinar_com_sql`: SELECT nomeado, JOIN se >1 tabela, merge só após `sql.execute` + policy.
- Skills (rascunho → validada → publicada / `rascunho_revalidacao`): pacote v2 + allowlist. `sqlModelo` é consulta exemplo. SQL da IA só no escopo **publicado**. `inspecionar_consulta` aceita validada / `rascunho_revalidacao` / publicada. Escopo vazio persiste na primeira leitura (`db:backfill-escopo`).
- Loop de aprendizado: `buscar_contexto` devolve perguntas e `id` (sem SQL); SELECT em `obter_skill`. FTS (`portuguese` + `unaccent` + `pg_trgm`) + `ILIKE`; `conhecimentos[]` é evidência. **Não é RAG**. Telemetria em `listar_auditoria` / `listar_metricas_agente.busca`. `0019_drop_unused_vector.sql` remove pgvector ocioso.
- Template `herdar_catalogo` (ilustrativo) só no grafo; `publicaSkill: false`.
- `enriquecer=completo` (opt-in): teto 16 `sql.execute`, concorrência 4 (`PERFIL_SQL_CONCURRENCY`); falha isolada vira aviso.
- Adapter REST: timeout alinhado ao bridge; dois `http(s).Agent` (auth 4 / SQL 16); keepAlive = probe TCP; `compose().close()` destrói os pools.
- Postgres obrigatório em produção. Redis opcional (rate limit, policy, cache de resultado).

## Critérios de sucesso

- Bootstrap sem Bearer só com `registrar_acesso`; token MCP nunca na resposta da tool. Guias `guia://` no bootstrap; `skill://` exige Bearer.
- Dois usuários no mesmo `agentId` leem o mesmo grafo; policy recorta a leitura.
- Dialeto travado no primeiro treino; `atualizar_dialeto` com confirmação rebaixa skills a rascunho. Sem default sybase — leia o guia do acesso.
- SQL da IA recusado se tabela, coluna ou JOIN sair do escopo; dry-run em `validar_consulta`.
- `buscar_contexto` não devolve `sqlModelo` nem SQL aprendido; `conhecimentos[]` não licencia consulta.
- Sem `jose`/`bcryptjs`/`cookie-parser` no runtime.
