# Orientação para agentes

## Fontes e precedência

1. `.cursor/rules/product_objective.mdc` — invariantes de produto (pacote publicado = autoridade).
2. `.cursor/rules/security.mdc` — cofre, segredos, portões e isolamento de cache.
3. `src/infrastructure/mcp/server-instructions.ts` — instruções runtime enviadas
   a IAs consumidoras no `initialize`.
4. `docs/` — contrato detalhado; `docs/mcp/tools.md` e
   `docs/mcp/error-mapping.md` são referências para tools e erros.
5. Regras especializadas em `.cursor/rules/` para arquitetura, domínio,
   catálogo, protocolo MCP, plug-server e testes.

Em caso de alteração de comportamento de consulta, treinamento ou pre-treino,
atualize em conjunto as rules aplicáveis, `server-instructions.ts`, a
documentação de produto e os testes correspondentes.

## Invariantes do produto

- O MCP é cofre + grafo de treinamento + skills; não é um proxy SQL genérico.
- Só o **pacote** de skill publicada autoriza `consultar_dados`. Grafo não
  licencia tabela nem JOIN. `obter_skill` / `skill://` não despejam o grafo.
- A IA executa SQL customizado somente no escopo publicado (validador
  fail-closed). Sem SQL, executa `sqlModelo`.
- Nunca inventar tabela, coluna, JOIN, métrica ou regra de negócio.
- Agregações, filtros e paginação devem acontecer no banco.
- Treinamento segue `treinar_com_sql` → `criar_skill` → params →
  `validar_skill` → confirmação → `publicar_skill`. Rascunho, validada ou
  `rascunho_revalidacao` não consultam (`rascunho_revalidacao`: validar →
  republicar). `listar_skills` devolve status/`fluxoTreino`/`faltas[]`; o
  pacote fica em `obter_skill`. Skill `validada` com perfil incompleto:
  `proximoPasso` é a tool da primeira falta (nunca `null`). `despublicar_skill`
  rebaixa para validada sem apagar. JOIN composto substitui pares isolados;
  `remover_relacionamento` apaga um fingerprint. `inspecionar_consulta` aceita
  `validada`. Cobertura de `buscar_contexto` não usa o SQL.

## Segurança e autorização

Não exponha senha, `client_token`, JWT do hub ou token MCP. A execução depende
de três portões: JWT Client, `ClientAgentAccess` e policy do `client_token` no
`plug_agente`. Cache de query isola usuário/token/policy/versão no prefixo
`mcp:query:{agentId}:`. Preserve a origem de cada falha e não faça retry cego.

## Referências rápidas

- Tools e fluxo: `docs/mcp/tools.md`
- Erros e avisos: `docs/mcp/error-mapping.md`
- Objetivo do produto: `docs/product/objective.md`
- Comunicação e auth do hub: `docs/plug-server/communication.md` e
  `docs/plug-server/auth.md`
- Testes: `.cursor/rules/testing.mdc` e `tests/`
