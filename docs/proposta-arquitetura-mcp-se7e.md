# Proposta de arquitetura — MCP Se7e para IA consultora

**Documento histórico.** Conserva o _porquê_ das três camadas (grafo → pacote publicado → aprendizado). **Não** é o contrato vivo.

Contrato atual: [product/objective.md](product/objective.md), [mcp/tools.md](mcp/tools.md), [mcp/error-mapping.md](mcp/error-mapping.md), [data/data-model.md](data/data-model.md). Índice: [README.md](README.md).

O destino original descrevia a IA como consultor de gestão. O contrato vivo define a **base comum** como SQL no plug-server, dialeto do `agentId`, resources (`guia://`, `skill://`, `persona://`) e skills publicadas (fail-closed, sem embeddings); o domínio vem do treino e o chapéu de tom da persona do acesso. Identificar o GDBR e emitir SQL compatível é treino + IA — o hub não implementa dialeto ([objective.md](product/objective.md)). Canal vivo com o hub: **REST**. “Fase 1” neste arquivo é jargão da data da proposta — Socket de consumer **não** é fase seguinte.

Os apêndices A–C registram o diagnóstico e o aceite **na data da proposta**. Gaps listados lá já foram entregues (salvo parser Firebird para SQL livre).

## 1. Objetivo de negócio

O destino é um plugin onde a IA age como **consultor de gestão**: lê números reais do ERP, consolida, compara períodos e entrega KPI, tabela e gráfico citáveis.

Texto da data da proposta. Contrato vivo: [product/objective.md](product/objective.md).

Isso exige três coisas:

1. **Base de conhecimento** sobre a estrutura do ERP daquele `agentId` (tabelas, colunas, relacionamentos, dicionários, regras).
2. **IA especialista em SQL** para Sybase SQL Anywhere, SQL Server (`mssql`) e Postgres, capaz de escrever `SUM`, `GROUP BY`, `ORDER BY` e recortes no dialeto certo.
3. **Escopo publicado** — o usuário confirma o recorte; a IA não inventa tabela, coluna nem JOIN.

Preservar: treino a partir de SELECT real, validação contra o banco, publicação com `confirmadoPeloUsuario`, autorização 100% no `client_token`, cofre (e-mail, senha, `agentId`, `client_token`, dialeto).

## 2. Três camadas

```mermaid
flowchart TB
  subgraph aprender [Aprender]
    explorar["explorar_tabelas / mapear_tabela (treino)"]
    treino["treinar_com_sql + enriquecimento"]
    publicar["publicar_skill (confirmacao do usuario)"]
    explorar --> treino --> publicar
  end
  subgraph conhecer [Base de conhecimento por agentId]
    grafo["Camada 1: grafo fisico"]
    pacote["Camada 2: skill publicada (escopo + metadado)"]
    exemplos["Camada 3: consultas aprendidas + regras + sinonimos"]
  end
  subgraph consultar [Consultar]
    pergunta[Pergunta do usuario]
    contexto["buscar_contexto / obter_skill"]
    sql["IA escreve SQL no dialeto"]
    validador["Validador de escopo + guardrails"]
    erp[("ERP via plug-server")]
    resposta["Resultado + sqlExecutado + asOf + avisos"]
  end
  publicar --> pacote
  treino --> grafo
  grafo --> pacote
  pergunta --> contexto --> sql --> validador --> erp --> resposta
  pacote --> contexto
  exemplos --> contexto
  resposta -->|grava aprendizado| exemplos
  resposta -->|promove fatos| grafo
```

**Camada 1 — grafo físico.** `explorar_tabelas`, `mapear_tabela`, `treinar_com_sql`. Origem `inferido` / `validado_execucao` / `confirmado_usuario`. Papel, formato, perfil e cardinalidade no recorte empresa/filial. O grafo **não** licencia consulta.

**Camada 2 — skill publicada.** Pacote: tabelas, colunas físicas, JOINs compostos (`pares[]` + uma cardinalidade), grão, dicionário, `metricasSaida`, regras, `sqlModelo` como **consulta exemplo**. Só este recorte autoriza `consultar_dados`.

**Camada 3 — aprendizado.** Consultas que funcionaram, regras/métricas (`anotacao_grafo`), sinônimos, lacunas. `buscar_contexto` devolve evidência e **perguntas** aprendidas; o SELECT está em `obter_skill` (`consultasExemplo`).

Manter a palavra "skill" na interface; o que muda é o que ela significa por dentro.

## 3. Consulta no escopo

A IA **escreve SQL**. O servidor valida contra o **pacote** (união dos `skillIds`) e executa via plug-server. Contrato das tools: [mcp/tools.md](mcp/tools.md).

- Sem `sql` / `consultaSemantica`: executa o `sqlModelo` (uma skill).
- Com `sql`: fail-closed (tabela, coluna, alias, UNION/subquery, JOIN). JOIN inventado é recusado; cruzar skills não inventa relacionamento — o `ON` precisa estar no pacote unido.
- `firebird`: só consulta exemplo (`DIALECT_UNSUPPORTED` para SQL livre).

Guardrails que permanecem: `CONSULTA_SEM_RECORTE`; paginação sem `ORDER BY`; teto de `GROUP BY`; params nomeados; literal de texto vira aviso. Dry-run: `validar_consulta`. Resposta: `columns` / `columnsMetadata` / `rows` / `sqlExecutado` / `asOf` / `recorte` / `avisos` / `truncated`.

## 4. Parser e dialetos

| Dialeto MCP | Parser        | SQL livre                       |
| ----------- | ------------- | ------------------------------- |
| `mssql`     | `transactsql` | sim                             |
| `sybase`    | `transactsql` | sim (SQL Anywhere, views T-SQL) |
| `postgres`  | `postgresql`  | sim                             |
| `firebird`  | —             | não; só consulta exemplo        |

O dialeto é `mssql`, não `sqlserver`. Travado por `agentId`; destrave: `atualizar_dialeto`.

## 5. Riscos que ainda valem

- O validador de escopo é a superfície crítica de segurança. A suíte adversarial não é opcional.
- Introspecção `sybase` usa `sysobjects`/`syscolumns` (views T-SQL no SQL Anywhere).
- O hub precisa preservar o SQL agregado (`execution_mode: preserve` em [plug-server/rest-integration.md](plug-server/rest-integration.md)).
- Tools `skill_*` incham o contexto — default **desligado** (`MCP_SKILL_TOOLS_ENABLED`).

---

## Apêndice A — Diagnóstico na data da proposta

O núcleo das fases 0–6 já estava no código quando a proposta foi escrita. Tools `skill_*` já eram opcionais. “Fase 1” em `docs/plug-server/` significa só **canal REST** (Socket fora de escopo). Não existe “plano Fase 1 §8.3”. As tabelas `regra_negocio`, `sinonimo` e `fonte` antigas foram **dropadas** em `drizzle/0008_cofre_grafo.sql` — reintroduzir com escopo novo, não “resgatar o previsto”.

O validador **não** recusa `TOP` (só envelopes internos). Alias sem `AS` em coluna simples é aceito; expressão exige `AS`. `consultar_dados` já aceitava `params` e `options`. O pedido original divergia do código (recusa de SQL da IA).

**Já entregue depois** (não reabrir como gap):

- `enriquecer=completo` perfila de verdade (não só `inferirPapelColuna`).
- Backfill de `skill.escopo` vazio (`obter_skill` / `db:backfill-escopo`).
- Suíte adversarial, teto de `GROUP BY`, `LITERAL_TEXTO`, bind no dry-run.
- `obter_skill.consultasExemplo`; `asOf` no timezone do acesso.
- `atualizar_dialeto`; `validar_skill` não despublica em silêncio.
- `pergunta` obrigatória; envelope slim de `buscar_contexto`; FTS + `conhecimentos[]`.
- `inspecionar_consulta` em validada / `rascunho_revalidacao` (amostra crua; `SELECT *` de uma tabela).
- Persona no acesso (`atualizar_persona` / `persona://`); `exportar_anexo`; `skillIds` omitido = união das publicadas.

## Apêndice B — Gaps do teste real (histórico)

Problemas que motivaram a Fase 2, todos resolvidos no contrato vivo:

- Consulta agregada impossível (só `sqlModelo` congelado).
- Dialeto travado; base SQL Server com acesso `sybase`.
- Revalidar despublicava as duas skills.
- Tools `skill_*` só com `acessoId`, sem recorte nem agregação.

## Apêndice C — Aceite original e o que veio depois

Critérios da proposta (ainda válidos como regressão). Detalhe operacional: [mcp/tools.md](mcp/tools.md).

1. Sem `sql` executa o `sqlModelo`.
2. Com `sql`, só o que está no pacote publicado.
3. Fora do escopo → código dedicado + nomes próximos.
4. `SELECT *`, mutação, segundo comando e estrela em subquery recusados em `consultar_dados` / treino. Exceção viva: `inspecionar_consulta` aceita `SELECT *` cru de **uma** tabela do allowlist (teto 100, sem máscara).
5. Sem `WHERE` e sem agregação → `CONSULTA_SEM_RECORTE`.
6. Paginação sem `ORDER BY` recusada.
7. `truncated` só com linha a mais que o teto.
8. `sqlExecutado`, `paramsUsados`, `asOf`, `recorte`.
9. Revalidar publicada **não** despublica.
10. `atualizar_dialeto` com confirmação rebaixa skills a rascunho.
11. `obter_skill` = pacote + guia, recortado pela policy.
12. Firebird recusa SQL livre com código explícito.
13. Sucesso promove a `validado_execucao`.
14. `buscar_contexto` resolve sinônimos; devolve **perguntas** de consultas `ativa` (SQL em `obter_skill`).
15. Tools `skill_*` desligáveis por flag.

**Já entregue depois da proposta:** cruzar `skillIds[]` com união de **pacotes** (JOIN só se estiver no pacote unido, não no grafo solto); janelas `OVER`; cache `mcp:query:{agentId}:`; `pergunta` obrigatória; envelope slim + FTS (**não** RAG/embeddings).

**Ainda fora:** parser Firebird para SQL livre.
