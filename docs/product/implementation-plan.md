# Plano de implementação (escopo atual)

O MCP é cofre + grafo de treino + **skill como pacote de conhecimento e escopo da consulta**. A IA escreve SQL dentro desse escopo. Fora de escopo: Authorization Server próprio, JWT de conta MCP, Client de serviço no `.env`, catálogo pronto (`vendas`/`produtos`/`clientes`). Norte: [objective.md](objective.md). Arquitetura: [proposta-arquitetura-mcp-se7e.md](../proposta-arquitetura-mcp-se7e.md).

## Entrega

- Cofre: `usuario_mcp` + `acesso` (N pares `agentId`/`client_token`, escopo empresa/filial e fuso).
- Tool pré-auth `registrar_acesso` + `GET /setup/{code}`.
- `UsuarioTokenManager` com e-mail/senha cifrados; login/refresh no hub por usuário.
- Grafo compartilhado por `agentId` (tabela/coluna/relacionamento composto com `pares[]`, proveniência, papel, perfil, `sensibilidade`, cardinalidade no recorte organizacional).
- `treinar_com_sql`: SELECT nomeado, JOIN se >1 tabela (um JOIN com várias igualdades vira um relacionamento), merge só após `sql.execute` + policy; enriquecimento opcional.
- Skills (rascunho → validada → publicada): pacote v2 de conhecimento + allowlist de tabelas/colunas/JOINs. `sqlModelo` é consulta exemplo. SQL da IA só executa no escopo publicado. Inspeção mascarada (`inspecionar_consulta`) e descoberta estrutural (`descobrir_tabela`) só com skill publicada. Escopo vazio é persistido na primeira leitura (e via `db:backfill-escopo`).
- Loop de aprendizado: consultas aprendidas visíveis em `buscar_contexto` / `obter_skill`, sinônimos, lacunas, promoção a `validado_execucao`. `asOf` usa o timezone do acesso.
- `buscar_contexto` usa FTS (`portuguese` + `unaccent` + pesos A/B/C + `pg_trgm`) com fallback `ILIKE` no Postgres; devolve `conhecimentos[]` como evidência e envelope sem SQL. Sem embedding obrigatório.
- `treinar_com_sql enriquecer=completo` (opt-in): cardinalidade, tipo/formato, perfil min/max/nulos e candidatos a dicionário, com teto de 16 queries. `validar_skill` aceita o mesmo parâmetro.
- Postgres obrigatório em produção. Redis opcional para rate limit, cache de policy e cache de resultado agregado.

## Critérios de sucesso

- Bootstrap sem Bearer só com `registrar_acesso`; token MCP nunca na resposta da tool.
- Dois usuários no mesmo `agentId` leem o mesmo grafo; policy recorta a leitura.
- Dialeto travado no primeiro treino; `atualizar_dialeto` com confirmação destrava e rebaixa skills a rascunho.
- SQL da IA recusado se tabela, coluna ou JOIN sair do escopo (incluindo CTE, subquery e JOIN inventado entre tabelas já no pacote); dry-run em `validar_consulta` com placeholders ligados a `null`.
- Sem `jose`/`bcryptjs`/`cookie-parser` no runtime.
