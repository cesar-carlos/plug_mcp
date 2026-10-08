# Treinamento compartilhado e curadoria

Todas as personas recebem a mesma base SQL + plug_server, versão 1.0.0, compilada no servidor. A identidade completa (hash e referência do contrato) é devolvida por `obter_treinamento_base`, pelos recursos públicos `guia://treinamento-base`, `guia://sql`, `guia://plug-server`, pelo diagnóstico e por `planoConsulta`. A base não inclui catálogo, persona, credenciais ou autorização. O bootstrap permanece público; pacotes e persona exigem Bearer do acesso. Cada Bearer representa um catálogo, sem união automática entre personas.

A composição é: base comum → publicação ativa do acesso → persona. `pre_treino` entrega instruções e contexto da sessão; não treina pesos de modelos. O protocolo legado e o moderno usam a mesma composição. Os validadores aplicam as regras mesmo que o consumidor diga que leu os guias.

## Fonte e conteúdo

A base canônica está em `src/application/use-cases/shared/treinamento-base.ts`. Os módulos cobrem SQL seguro, dialetos/capacidades, hub e procedimento de consulta/correção. O contrato revisado do plug_server está empacotado em `contracts/plug-mcp-rest-v1.json`, commit `0d2c6b488438a77be71b39e514cd06ab11fbb95e`; `npm run training:check` verifica o hash, os schemas e o adapter. Havendo checkout do hub (`PLUG_SERVER_CHECKOUT`, `plug_server_contract` ou `../plug_server`), verifica também o commit. Atualizar a fonte exige revisão dos módulos e testes, sem internet no runtime.

Normas do hub: `docs/PROJECT_OVERVIEW.md`, `docs/api/api_rest_bridge.md`, `docs/api/client_agent_business_rules.md` no checkout fixado. A [documentação web](https://plug-server.se7esistemassinop.com.br/docs/) é complementar. O MCP envia `POST /api/v1/agents/commands`; JWT Client, aprovação ClientAgentAccess e policy do client_token continuam obrigatórios. O agente/GDBR executa SQL e aplica paginação gerenciada. REST materializa o resultado; HTTP 200 pode conter erro JSON-RPC. A IA não manipula os envelopes/segredos do adapter. Escrita, batch, cursor e Socket do hub não são capacidades expostas neste MCP.

## Curadoria por chat

`consultar_dados` captura somente candidata segura e parametrizada. Uma falha de captura gera aviso e preserva a consulta bem-sucedida. `listar_consultas_aprendidas` filtra skill/estado com página/limite e não retorna SQL; `obter_consulta_aprendida` devolve SQL, parâmetros, publicações e `reutilizavel`.

`salvar_consulta` aceita `consultaAprendidaId` ou a preparação legada `pergunta` + `sql` + `skillId`/`skillIds`. Sem hash, retorna preview, candidata e `confirmacaoHash`. Depois de mostrar o conteúdo e obter confirmação humana, repetir com ID, hash e `confirmadoPeloUsuario=true`. O hash inclui acesso, versão, SQL/contrato e publicações exatas. A aprovação usa CAS e verifica ponteiros sob locks no PostgreSQL. Replay ou republicação exige novo preview/exemplo. Aprovar não incrementa execuções.

`inativar_consulta_aprendida` usa motivo, preview/hash e confirmação. A resposta pendente inclui `preview` com o mesmo objeto usado no hash: `acessoId`, `consulta` (`id`, `versao`, `sql`, `pergunta`, `paramsContrato`, `publicacoes`, `status`) e `motivo`. Apresente esse conteúdo ao humano antes de enviar ID, motivo, hash e confirmação explícita. Mudar motivo/versão/contexto exige novo preview; não repita automaticamente. A adição é compatível e não altera CAS. Nova execução incrementa a contagem, mas preserva aprovação, texto, autoria e estado inativo. A identidade de deduplicação considera SQL tokenizado, contrato, skills e publicações, isolada por acesso. Candidatas têm retenção de 90 dias. Publicações antigas não licenciam reuso.

A captura, confirmação e exportação compartilham análise AST. Valores de usuário devem ser parâmetros. Constantes estruturais limitadas são permitidas. `confirmar_constante_negocio` adiciona ao rascunho constantes explicitamente revisadas e ligadas à tabela/coluna classificada livre. Colunas pessoais/secretas, valores de recortes obrigatórios e textos que pareçam segredos não são aprováveis. A constante passa a valer para aprendizado após republicação.

## Semântica e revisão

`confirmar_grao` exige skill, tabela, significado de uma linha, chaves físicas e origem da evidência. Não transforma GROUP BY/amostra em chave única. Evidência declarada de constraint requer verificação no destino; não afrouxa fanout automaticamente. Grão de origem confirmado e grão do resultado ficam separados. O validador recusa chaves inconsistentes e continua bloqueando cardinalidade/fanout não demonstrados.

`metricasSaida` aceita unidade, moeda, arredondamento (casas/modo), tratamento de nulos, aditividade, dimensões permitidas e calendário de negócio. Esses metadados acompanham rascunho/diff/snapshot. Na IR, dimensões permitidas são verificadas, `tratamentoNulos=zero` gera COALESCE e `arredondamento.modo=round` gera ROUND. Unidade, moeda, calendário, aditividade e arredondamento documental são descrições. No SQL livre não são correções automáticas; o plano identifica essa distinção.

Consultas bem-sucedidas devolvem `consultaExecucaoId`, inclusive em cache. `registrar_feedback_consulta` associa categoria/correção segura à execução e às publicações usadas; abre pendência, sem alterar conhecimento. Use as tools próprias para corrigir rascunho, inativar exemplo ou criar regressão sintética, e `revisar_feedback_consulta` para confirmar a revisão e vincular IDs. `diagnosticar_treinamento` consolida base, faltas e próximos passos, conflitos, deriva, candidatas, feedback e testes. Lacunas registram contagem de recorrência; auditoria continua sem perguntas, SQL, parâmetros ou resultados.

## Casos e runner separado

`registrar_caso_teste`, `listar_casos_teste`, `obter_caso_teste`, `atualizar_caso_teste` e `arquivar_caso_teste` mantêm casos sintéticos com revisões imutáveis. Cada caso tem pergunta/finalidade, dialeto, fixtures tipadas, SQL/IR, decisão/código esperado, resultado de referência, ordenação e colunas decimais para comparação exata. O preview retorna `casoId` e `versao`: reenviar ambos, mesmo para criar (versão 0), junto ao hash e confirmação humana. Alterações produzem nova revisão e invalidam relatórios anteriores.

Execute somente em banco efêmero CI, nunca no ERP:

```sh
CI=true TRAINING_EVAL_ENABLED=true DATABASE_URL=postgres://.../se7e_training_ci npm run evaluate:skills -- --acesso=UUID --skill=UUID --output=skills-evaluation.json
```

O runner cria fixtures temporárias numa transação, usa validadores de escopo, privacidade, fanout e recortes, executa PostgreSQL real e faz rollback verificável. Relatórios imutáveis incluem hashes do conteúdo, caso, base, contrato e avaliador. Outras engines ficam `indisponivel` até executor compatível; parser não certifica motor. Ambiguidade sem referência executável não conta como resultado aprovado. `listar_relatorios_avaliacao` é somente leitura; nenhuma tool aceita status aprovado arbitrário da IA.

Sem casos há aviso `TESTES_AUSENTES`; publicar continua permitido. Todos os casos obrigatórios ativos precisam de relatório aprovado para conteúdo/versão atual. Reprovado, obsoleto ou ambiente indisponível bloqueia apenas a nova publicação. O hash de confirmação inclui o estado dos testes, e a conclusão revalida esse estado enquanto mantém o lock da skill. A publicação anterior continua disponível.

## Templates, datasets e consumidores

`exportar_template_skill` remove identidades do acesso, credenciais, perfis/amostras, recortes concretos, anexos, histórico e aprovações. Inclui definições e casos sintéticos confirmados. Literais não exportáveis impedem a exportação até parametrização. `importar_template_skill` exige preview/confirmacão, dialeto compatível e slug novo; cria identidade em rascunho, sem ponteiro ativo, autorização ou relatório herdado. Constantes importadas ficam propostas e exigem confirmação no destino. Estrutura, relações e sensibilidade devem ser verificadas antes de publicar.

`exportar_dataset_treinamento` exporta apenas casos sintéticos confirmados ativos deste acesso, com preview/hash, JSON/JSONL e manifesto de origem. Famílias de estrutura têm partição determinística 70/15/15 (treino/desenvolvimento/teste), estável entre paráfrases e acessos; uma família não migra para outra partição por escolha do cliente. Não extrai conversas/auditoria nem combina personas.

`evaluate:consumer` preserva os 100 cenários e exercita descoberta, pacote, recursos e schemas reais. O consumidor recebe pergunta/contexto/tools; SQL de referência e resultados ficam com o avaliador. Comparações preservam tipos, nulos, precisão e ordem. O relatório registra modelo, sequência de tools/resources, duração e consumo informado pelo adapter. Adapters de modelo precisam fornecer `judgeAnswer` para avaliar a fidelidade da resposta numa etapa exclusiva do avaliador; o consumidor não recebe resultado esperado. O modelo do julgador também é registrado. `kind=harness` sempre tem `qualityMeasured=false`. Configure explicitamente `AI_EVAL_ENABLED=true`, CI, banco efêmero, `--adapter`, `--model`. Variante revisada: `--instructions=arquivo` + `INSTRUCTION_VARIANT_REVIEWED=true`; a base de segurança permanece prefixada e os validadores não mudam. Não aplica otimizações ao servidor automaticamente.

Não há jobs de fine-tuning, GPUs, treinamento de pesos ou modelos por persona nesta entrega. Datasets versionados permitem avaliação e uso futuro em ferramentas externas. Avaliação com IA real exige 100% em segurança e ambiguidade/lacuna e ≥95% nos suportados. Engines/modelos não executados e homologação piloto permanecem explicitamente pendentes.

## Migração e operação

Migrações novas: `0032` adiciona versão/fingerprint/estado de curadoria e revisões de casos/feedback/relatórios; `0033` acrescenta recorrência de lacunas. Não inventam confirmação, teste ou relatório retroativo. `test:migrations` cobre banco novo, upgrade desde 0023 e estado anterior 0031, preservando snapshots e Bearers. Execute backup/restauração e homologação piloto antes de produção; mudanças locais não constituem liberação.

## Conexão ChatGPT

[OAuth opcional](../auth/chatgpt-oauth.md) delega um acesso existente; não altera a autoridade das publicações, a policy ou confirmações. /mcp permanece manual. Perfil/contexto/revogação são tools exclusivas de /mcp/chatgpt. Falha de autenticação OAuth tem stage=oauth e desafio MCP; erros de hub/SQL não provocam reconexão OAuth.
