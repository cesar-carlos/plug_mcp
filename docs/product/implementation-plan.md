# Atualização e evolução do Se7e MCP

Norte: [objetivo](objective.md). Este documento registra implementação e verificações exigidas antes da liberação. Não representa autorização de deploy em produção.

## Entrega técnica

- Runtime Node 24.21.0 LTS e @types/node 26.6.4, atualizado conforme a solicitação posterior de usar as últimas versões de todas as dependências npm. Os tipos mais recentes não ampliam as APIs disponíveis no runtime Node 24; a execução permanece verificada nessa versão. TypeScript 7 real para build/typecheck, API TypeScript 6 de compatibilidade somente para lint. Dependências diretas/dev atualizadas às estáveis, lockfile reproduzível; instalação sem force/legacy-peer-deps. SDK MCP v2 modular, Express 5, Zod 4, ESLint 10 e Vitest 5. Dependabot abre PRs semanais; majors exigem revisão, sem merge automático.
- Preparação compartilhada de SQL/modelo/IR/consulta aprendida e plano com IDs/hashes das publicações. Recortes físicos dominantes, funções somente leitura explícitas, limites antes do parser, referências em todas as cláusulas, ambiguidades e fanout bloqueados. JOIN derivado resolve chaves físicas; EXISTS correlacionado exige relacionamento composto completo.
- Inspeção exige colunas confirmadas; perfil de valores somente de colunas confirmadas livres, sem valores pessoais/secretos/inferidos. STAR projetado explicitamente; metadados descobrem novas colunas sem valores. Handles vinculados ao acesso/coluna/publicações, autorização vigente e quotas de bytes.
- Credenciais fora das tools: GET formulário e POST confirmado/CSRF reautenticado; código de 256 bits somente hash/15 minutos. Bearer mostrado uma vez. Rotação invalida sessões/handles/cache na conclusão; envelope AES-GCM v2 com key ID e procedimento de recriptografia.
- Snapshot publicado efetivo e imutável, rascunho independente, CAS de versão/hash/base no publish. Última publicação continua durante edição; restrições/revogações e mudanças de cardinalidade suspendem as afetadas. Ampliações aguardam republicação.
- Aprendizado candidata/confirmada/inativa: captura segura, confirmação humana, vínculo à publicação, retenção 90 dias, falha de captura não falha consulta. Execução técnica preserva conhecimento confirmado.
- /mcp legado com initialize/sessões/SSE/GET/DELETE/notificações e protocolo 2026-07-28 por requisição. Sessão imutável, contexto isolado, Bearer inválido não vira público; Origin/Host/proxy explícitos e limites de recursos.
- Cache canônico isolado e três portões revalidados antes da entrega. Servidor Redis 7 (`redis:7-alpine`) e cliente npm `redis` 6.3.0, com versões independentes. Lease proprietário/renovação/liberação atômicas, timeout sem consulta concorrente enquanto lease válido e indisponibilidade da coordenação sem reduzir autorização. Configuração de conexão/startup: [guia de Redis](../operations/redis.md).

## Matriz de capacidades

| Dialeto    | Modelo/treino                                        | SQL dinâmico/IR                               | Paginação                                  | Certificação local                               |
| ---------- | ---------------------------------------------------- | --------------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| PostgreSQL | SELECT nomeado                                       | No pacote, funções permitidas e prova de grão | ORDER BY estável                           | Resultados sintéticos em PostgreSQL real         |
| MSSQL      | SELECT nomeado                                       | No pacote e allowlist de funções              | ORDER BY estável; guia explica TOP vs page | Parser/contratos; motor dedicado ainda requerido |
| Sybase     | SELECT nomeado                                       | No pacote e allowlist de funções              | Conforme guia do acesso                    | Parser/contratos; motor dedicado ainda requerido |
| Firebird   | SELECT ANSI suportado, sem FIRST/TOP/LIMIT no modelo | Somente modelo publicado; sem SQL livre       | Sem paginação gerenciada                   | Parser/contratos; motor dedicado ainda requerido |

Fontes físicas qualificadas por schema/database e UDFs ainda são recusadas conservadoramente; não interpretar parser como certificação de motor. Listas permitidas são explícitas em shared/sql-ast.ts. Protocolos: [clientes](../clients/connecting-clients.md).

## Avaliação versionada

100 cenários sintéticos em tests/fixtures/evaluation/scenarios.v1.json: 25 financeiro, 25 vendas, 20 estoque, 15 ambiguidade/lacuna e 15 segurança. Cada caso contém pergunta, pacote, dados, SQL/decisão e resultado de referência. Testes determinísticos verificam autorização e resultados no PostgreSQL, incluindo múltiplas empresas, valores iguais/nulos/decimais e quantidades negativas. Suítes adicionais cobrem JOIN/fanout, pré-agregação, EXISTS, datas, paginação e IR v1/v2.

npm run test:evaluation executa a camada determinística. A camada com IA é explícita: AI_EVAL_ENABLED=true, CI=true, DATABASE_URL de banco se7e_*ci e npm run evaluate:consumer -- --adapter=/caminho/adapter.ts --model=identificador --output=/caminho/relatorio.json. O adaptador segue tests/evaluation/consumer-contract.ts e recebe pergunta/contexto + callTool; deve devolver decisão, resposta interpretada e valores finais. O harness usa casos de uso reais de validar/consultar e PostgreSQL temporário; limita chamadas a 12 por caso, não envia credenciais/dados reais e não promove aprendizado.

Relatório registra modelo, tipo do adaptador, data, acertos e contagens. Aceite: 100% segurança, 100% ambiguidade/lacuna e >=95% suportados. harness-adapter.ts usa SQL de referência apenas para ensaiar a infraestrutura; qualityMeasured=false. Seu resultado não certifica modelo. Uma rodada com IA consumidora real depende de adaptador/modelo configurados e deve preceder a liberação.

## Migração e liberação

0028 cria baseline técnico e publicação ativa preservando histórico; conteúdo servido anteriormente divergente não é apresentado como nova confirmação humana. Baselines inseguros são suspensos. 0029 invalida setups legados pendentes e preserva Bearers. 0030 migra exemplos sem evidência para candidatas. 0031 impede alteração de snapshots. Migrações históricas permanecem intactas.

npm run test:migrations exige CI e bancos efêmeros: novo, upgrade desde 0023, upgrade desde 0027, reaplicação, baseline/suspensão/imutabilidade e invalidação de setup. Antes de produção: pg_dump consistente, restauração em banco separado e verificação de contagens/hash/ponteiros/segredos cifrados, depois rotação conforme [cofre](../auth/vault-and-mcp-token.md). Nunca ensaie no banco do ERP/produção.

Gate: npm ci, compiler:check, lint, format:check, typecheck, testes, build, inicialização servidor/worker, integrações PostgreSQL/Redis, audit de produção e contract:check no hub. CI fixa contrato do plug_server em 0d2c6b488438a77be71b39e514cd06ab11fbb95e, com baseline de compatibilidade. Atualização desse ref exige verificar contrato e rever testes.

Homologação/acesso piloto e rodada com IA/motores dedicados são verificações externas ainda necessárias; nenhuma implantação de produção é executada por este checkout. Monitore somente metadados: recusas por estágio, erros por origem, percentis/latência/cache/contenção. Recuperação após mudança de autoridade/segurança é correção adiante ou manutenção; não voltar silenciosamente a uma versão vulnerável. Dependências de produção não podem ter alta/crítica sem correção/mitigação comprovada. Drizzle-kit estável mantém avisos moderados de esbuild na ferramenta de desenvolvimento; não vai ao runtime e não abrir servidor de desenvolvimento a origens não confiáveis.

## Verificações executadas em 04/10/2026

- Na verificação inicial do plano: `npm ci` limpo, compilador 7.0.2, lint, formatação, typecheck e build aprovados com Node 24.21.0. A exceção inicial de `@types/node` 24 foi substituída pela atualização npm solicitada posteriormente. Auditoria de produção: zero vulnerabilidades; desenvolvimento: quatro avisos moderados da cadeia Drizzle-kit/esbuild.
- 814 testes aprovados, zero falhas e zero ignorados, tanto no Windows quanto no Linux AMD64, com PostgreSQL e Redis exclusivos de CI. Incluem os 100 cenários, 70 comparações de resultados no PostgreSQL e regressões adicionais de JOIN/grão, datas, nulos e paginação.
- Migrações em banco novo, desde 0023 e desde 0027, com reaplicação, suspensão de baseline inseguro, invalidação de setup, preservação de Bearer e snapshots imutáveis. Recriptografia testada em PostgreSQL: dry-run, aplicação e rollback integral em falha.
- `pg_dump`/`pg_restore` ensaiados em bancos sintéticos separados: contagens, conteúdo/hash de snapshots, ponteiros, Bearer e campos de cofre comparados. O ensaio não substitui backup/restauração do ambiente de homologação antes da liberação.
- `contract:check` aprovado no checkout do hub fixado acima. Imagens musl AMD64/ARM64 compiladas; PNG/sharp/file-type verificados. `runtime:check` verifica servidor, readiness do banco, worker e componentes nativos; `--migrate` verifica as migrações empacotadas. A imagem inclui os arquivos SQL.
- Rotação concorrente usa compare-and-swap no hash anterior: apenas uma operação conclui; código de outra operação fica desatualizado. Perfis/dicionários de colunas restritas são omitidos também nos metadados do snapshot devolvido, preservando o histórico interno.
- Harness de consumo ensaiado nos 100 casos com adaptador de referência; `qualityMeasured=false`. Não houve avaliação de modelo real, certificação dos motores MSSQL/Sybase/Firebird nem deploy/piloto.
- Atualização npm posterior: `@types/node` 26.6.4, transitivas atualizadas nas faixas compatíveis e `npm outdated` vazio. Nova instalação limpa e `release:check` aprovados no Windows com Node 24.21.0: 814 testes, incluindo PostgreSQL/Redis reais, lint, formatação, TypeScript 7 e build. Auditoria segue com zero vulnerabilidades de produção e quatro moderadas de desenvolvimento.
