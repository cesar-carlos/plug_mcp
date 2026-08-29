# Modelo de dados

Não há tabela de senha de conta MCP, cliente de Authorization Server nem catálogo pronto.

## Cofre

- `usuario_mcp`: `email_enc`, `email_hash`, `senha_enc`, `token_hash` (SHA-256 do token MCP), `token_expires_at` (opcional; TTL `MCP_TOKEN_TTL_DAYS`). Unique em `email_hash` e `token_hash`.
- `acesso`: `usuario_id`, `agent_id`, `dialeto`, `nome_amigavel`, `client_token_enc`, `client_token_hash`, `status_acesso`, `escopo_padrao` (JSON empresa/filial), `timezone`. Unique `(usuario_id, agent_id, client_token_hash)`. Vários acessos do mesmo `agentId` são independentes (tokens/policies distintas); não há deduplicação automática.

## Grafo (`agent_id`, compartilhado)

- `grafo_dialeto`: um dialeto por agente (primeiro escritor; `atualizar_dialeto` regrava).
- `grafo_lock`: lock de merge (`SELECT … FOR UPDATE`).
- `coluna_grafo`: além de tipo/descrição/dicionário, `papel` (`chave|dimensao|medida|codigo|data`), `formato` (`date`/`number`), `perfil` (JSON: min/max, nulos, distintos, `candidatosDicionario`) e `sensibilidade` (`livre|pessoal|sensivel|segredo`, default `livre`). Preenchido no treino/`validar_skill` `enriquecer=completo` (catálogo + MIN/MAX). Classe gravada com `confirmar_coluna` + `confirmadoPeloUsuario` (origem `confirmado_usuario`) **não** é apagada pelo perfil (`validado_execucao`). A inspeção mascara pela linhagem SQL (alias/expressão resolvem à coluna de origem).
- `relacionamento_grafo`: um JOIN = lista ordenada de pares + uma cardinalidade. Campos legados `coluna_origem`/`coluna_destino` guardam o primeiro par (compatibilidade). `pares_fingerprint` identifica o conjunto (e o inverso). Unique `(agent_id, origem, destino, fingerprint)`. `escopo_validacao` (JSON empresa/filial) registra o recorte em que a cardinalidade foi confirmada. JOIN sem igualdade é recusado; CROSS JOIN **não** grava relacionamento.
- `relacionamento_grafo_par`: pares compostos (`ordem`, `coluna_origem`, `coluna_destino`). Migration `0014_relacionamento_composto.sql` faz backfill do par legado.
- `schema_snapshot`: última assinatura mapeada por `(agent_id, tabela_nome)`. `detectar_deriva_esquema` compara e não repara schema.
- Precedência: `validado_execucao` > `confirmado_usuario` > `inferido`. Empate de texto → `conflito`. Execução bem-sucedida de `consultar_dados` promove fatos usados a `validado_execucao`. Cardinalidade composta é perfilada no recorte empresa/filial aplicável.

## Skills e notas

- `skill`: `slug` unique por `agent_id` (rename em `atualizar_skill` exige confirmação), `sql_modelo` (consulta **exemplo**), `escopo` JSON (tabelas, `colunasPorTabela` físicas, relacionamentos com `pares[]` + `colunaOrigem`/`colunaDestino` legado, `graoPorTabela`/`graoResultado`, `metricasSaida` com campos opcionais de KPI `definicao`/`grao`/`dimensoesPermitidas`/`statusIncluidos`/`statusExcluidos`/`colunaData` — overlay fail-closed só em aliases já no pacote; `pacoteVersao` atual = **2**), `consulta_semantica` (IR opcional: métrica, dimensões, filtros, período, ordenação), `politica_consulta` (JSON: `maxRows`, `timeoutMs`, `exigirRecorteTemporal`, `maxTabelas`, `modoPreferencial`), `params`, `versao`, `pacote_versao`, `status` (`rascunho` | `validada` | `publicada` | `rascunho_revalidacao`), `motivo_revalidacao`. Pacotes v1 (par único) continuam legíveis. Skill **publicada** é a autoridade de consulta. `despublicar_skill` rebaixa para `validada` sem apagar o pacote. O pacote sincroniza cardinalidade/tipo do grafo em criar/validar/mapear/confirmar/treino (`sincronizarEscopoComGrafo`). Cutover: `npm run db:backfill-escopo` reconstrói o pacote e rebaixa publicadas para revalidação. Migration `0015_politica_lacuna.sql`.
- `anotacao_grafo`: `skill_id` nullable; `skill_id=null` não é global silencioso — tabela inexistente é recusada.
- `consulta_aprendida` + `consulta_aprendida_skill`: SQL que funcionou, associado a uma ou mais skills. Consultas sem associação não entram em todas as skills.
- `anotacao_grafo`: nota/glossário/regra/métrica; `tabela_id` opcional; `tipo` inclui `regra` e `metrica`.

## Aprendizado (migration `0012`)

- `consulta_aprendida`: SQL que funcionou (gravado automaticamente em `consultar_dados`), pergunta, contrato de params, contagem de execuções. Associação N:N em `consulta_aprendida_skill`. Ao remover a skill, os vínculos somem; o SQL histórico permanece no `agentId`. `obter_skill.pacote.consultasExemplo` devolve as da skill. `buscar_contexto` pede para reutilizar `consultasAprendidas`.
- `sinonimo`: termo → skill/alvo; `buscar_contexto` expande a query. `remover_skill` apaga sinônimos cujo alvo é a skill.
- `lacuna_consulta`: pergunta que caiu em `SKILL_GAP` (`tipo=skill_gap`) ou contrato de tool ausente (`tipo=ferramenta`, JSON `contrato`: objetivo/entradas/saídas/permissão/teto/aceite). `listar_lacunas` / `registrar_lacuna_ferramenta`.

## Auditoria

- `audit_log`: tool, SQL enviado, sucesso, código, linhas, duração. Sem segredos nem amostras de inspeção. `listar_auditoria` lê por usuário/acesso. `listar_metricas_agente` agrega por tool/código. `inspecionar_consulta` grava só skill, finalidade e número de colunas.

Leitura do grafo é recortada em aplicação pela policy do `client_token` (`allTables` / `tables`). A escrita acumula para todos os acessos daquele `agentId`.
