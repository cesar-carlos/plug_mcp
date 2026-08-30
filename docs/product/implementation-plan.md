# Plano de implementação (escopo entregue)

O MCP é cofre + grafo de treino + **skill como pacote de conhecimento e escopo da consulta**. A IA escreve SQL dentro desse escopo. Este arquivo lista o que **já está no código**, não um backlog. Fora de escopo: Authorization Server próprio, JWT de conta MCP, Client de serviço no `.env`, catálogo pronto (`vendas`/`produtos`/`clientes`). Norte vivo: [objective.md](objective.md). As três camadas (histórico): [proposta-arquitetura-mcp-se7e.md](../proposta-arquitetura-mcp-se7e.md).

## Entrega

- Cofre: `usuario_mcp` + `acesso` (N pares `agentId`/`client_token`, escopo empresa/filial e fuso).
- Tool pré-auth `registrar_acesso` + `GET /setup/{code}`.
- `UsuarioTokenManager` com e-mail/senha cifrados; login/refresh no hub por usuário.
- Grafo compartilhado por `agentId` (tabela/coluna/relacionamento composto com `pares[]`, proveniência, papel, perfil, `sensibilidade`, cardinalidade no recorte organizacional).
- `treinar_com_sql`: SELECT nomeado, JOIN se >1 tabela (um JOIN com várias igualdades vira um relacionamento), merge só após `sql.execute` + policy; enriquecimento opcional.
- Skills (rascunho → validada → publicada / `rascunho_revalidacao`): pacote v2 de conhecimento + allowlist de tabelas/colunas/JOINs. `sqlModelo` é consulta exemplo. SQL da IA só executa no escopo **publicado**. `inspecionar_consulta` aceita validada / `rascunho_revalidacao` / publicada (recusa rascunho). `descobrir_tabela` só com skill publicada. Escopo vazio é persistido na primeira leitura (e via `db:backfill-escopo`).
- Loop de aprendizado: `buscar_contexto` devolve perguntas e `id` de `consultasAprendidas` (status `ativa`, sem SQL); o SELECT está em `obter_skill` (`consultasExemplo`). Se `consultaPermitida` e houver KPI, `consultaSemanticaSugerida`. Sinônimos resolvem skill por id/slug/nome sem concatenar UUID na tsquery. Lacunas e promoção a `validado_execucao`. `asOf` usa o timezone do acesso.
- `buscar_contexto` usa FTS (`portuguese` + `unaccent` + pesos A/B/C + `pg_trgm`) com fallback `ILIKE` no Postgres; devolve `conhecimentos[]` como evidência e envelope sem SQL. **Não é RAG** (sem embeddings, sem pgvector). Telemetria (counts/enums, sem a pergunta) em `listar_auditoria` / `listar_metricas_agente.busca`. Migration `0019_drop_unused_vector.sql` remove a extensão `vector` ociosa de `0008`.
- Template `herdar_catalogo` (ilustrativo): `empresa`/`filial`/`cliente`/`produto`/`receber`/`pagar` e JOINs compostos empresa+filial no grafo. Envelope `origem: "inferido"`, `publicaSkill: false`.
- `treinar_com_sql enriquecer=completo` (opt-in): cardinalidade, tipo/formato, perfil min/max/nulos e candidatos a dicionário, com teto de 16 queries. `validar_skill` aceita o mesmo parâmetro.
- Postgres obrigatório em produção. Redis opcional para rate limit, cache de policy e cache de resultado agregado.

## Critérios de sucesso

- Bootstrap sem Bearer só com `registrar_acesso`; token MCP nunca na resposta da tool.
- Dois usuários no mesmo `agentId` leem o mesmo grafo; policy recorta a leitura.
- Dialeto travado no primeiro treino; `atualizar_dialeto` com confirmação destrava e rebaixa skills a rascunho.
- SQL da IA recusado se tabela, coluna ou JOIN sair do escopo (incluindo CTE, subquery e JOIN inventado entre tabelas já no pacote); dry-run em `validar_consulta` com placeholders ligados a `null`.
- `buscar_contexto` não devolve `sqlModelo` nem SQL aprendido; `conhecimentos[]` é evidência, não licença. `consultaSemanticaSugerida` só com `consultaPermitida` e KPI no pacote.
- Sem `jose`/`bcryptjs`/`cookie-parser` no runtime.
