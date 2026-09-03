# Plano de implementação (escopo entregue)

Lista do que **já está no código**, não um backlog. Norte vivo: [objective.md](objective.md). Fora de escopo: Authorization Server próprio, JWT de conta MCP, Client de serviço no `.env`, catálogo pronto, Socket/relay de consumer. Três camadas (histórico): [proposta-arquitetura-mcp-se7e.md](../proposta-arquitetura-mcp-se7e.md).

## Entrega

- Cofre: `usuario_mcp` + `acesso` (N pares `agentId`/`client_token`, escopo empresa/filial, fuso, persona opcional). `atualizar_persona` grava `nomePersona`/`instrucoesPersona` no trio usuário+agentId+token (confirmação; recusa texto que pareça segredo). Resource `persona://{acessoId}` (Bearer).
- Tool pré-auth `registrar_acesso` + `GET /setup/{code}`. `GET /docs/mcp/error-mapping.md` (mesma origem do `/health`). Após `initialize` autenticado, `notifications/tools/list_changed` se SHA/versão mudou.
- `UsuarioTokenManager` com e-mail/senha cifrados; login/refresh no hub por usuário.
- Grafo por `acesso_id` (1 `client_token` = 1 catálogo; JOIN composto com `pares[]`, proveniência, papel, perfil, `sensibilidade`, `tipoJoin`). `confirmar_relacionamento` sem `tipoJoin` preserva LEFT inferido — não grava `inner` por cima.
- `treinar_com_sql`: SELECT nomeado, JOIN se >1 tabela, merge só após `sql.execute` + policy.
- Skills (rascunho → validada → publicada / `rascunho_revalidacao`): pacote v2 + allowlist. `sqlModelo` é consulta exemplo. `consultar_dados`: `skillIds` omitido = união das publicadas **deste acesso**; `consultaAprendidaId` reexecuta o SELECT gravado. `inspecionar_consulta` aceita validada / `rascunho_revalidacao` / publicada: `SELECT *` cru de **uma** tabela do allowlist (teto 100, sem máscara, sem `options.page`); `PRIVACIDADE_NEGADA` fica em `consultar_dados` / `exportar_anexo`. Escopo vazio persiste na primeira leitura (`db:backfill-escopo`).
- Célula binária: stub `{ kind: "anexo" }` sem blob. Handle só de `consultar_dados` → `exportar_anexo` (jpeg/png/pdf; inspeção **não** emite handle). Resultado com anexo não entra no cache.
- Loop de aprendizado: `buscar_contexto` devolve perguntas e `id` (sem SQL); SELECT em `obter_skill`. FTS (`portuguese` + `unaccent` + `pg_trgm`) + `ILIKE`; `conhecimentos[]` é evidência. **Não é RAG**. Telemetria em `listar_auditoria` / `listar_metricas_agente.busca`. `0019_drop_unused_vector.sql` remove pgvector ocioso. Migrations `0021_acesso_persona.sql` e `0022_catalogo_por_acesso.sql`.
- Template `herdar_catalogo` (ilustrativo) só no grafo; `publicaSkill: false`. JOIN só `inferido` **não** entra em `expandir_escopo` de skill publicada.
- `enriquecer=completo` (opt-in): teto 16 `sql.execute`, concorrência 4 (`PERFIL_SQL_CONCURRENCY`); falha isolada vira aviso.
- Adapter REST: timeout alinhado ao bridge; dois `http(s).Agent` (auth 4 / SQL 16); keepAlive = probe TCP; `compose().close()` destrói os pools.
- Postgres obrigatório em produção. Redis opcional (rate limit, policy, cache de resultado).

## Critérios de sucesso

- Bootstrap sem Bearer só com `registrar_acesso`; token MCP nunca na resposta da tool. Guias `guia://` no bootstrap; `skill://` e `persona://` exigem Bearer.
- Catálogos separados por acesso (1 `client_token` = 1 grafo/skill/aprendizado). Policy recorta SQL/leitura **dentro** do grafo daquele acesso. Dois tokens no mesmo `agentId` não compartilham catálogo. Persona é por acesso (não pelo Agent do hub).
- Dialeto travado no primeiro treino; `atualizar_dialeto` com confirmação rebaixa skills a rascunho. Sem default sybase — leia o guia do acesso.
- SQL da IA recusado se tabela, coluna ou JOIN sair do escopo; dry-run em `validar_consulta`. Grafo não licencia JOIN.
- `buscar_contexto` não devolve `sqlModelo` nem SQL aprendido; `conhecimentos[]` não licencia consulta.
- Sem `jose`/`bcryptjs`/`cookie-parser` no runtime.
