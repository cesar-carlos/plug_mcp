# Documentação Se7e MCP

Para preparar o servidor inicial, comece pelo [primeiro deploy de teste](persona-v2/first-test-deploy.md). A matriz de aceite integral e o histórico de rodadas têm finalidades distintas.

O contrato e a entrada padrão são **persona-v2**. O deploy inicial de teste usa
contrato próprio. Aceite integral para clientes permanece bloqueado pelo
[manifesto de aceite](../contracts/persona-v2-release.json).

Comece pelo [objetivo](product/objective.md) e pelo [estado da v2](persona-v2/README.md).
Precedência e índice das rules: [AGENTS.md](../AGENTS.md).

## Persona-v2

| Tema                                                   | Referência                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Capacidades implementadas e pendências                 | [Estado da refatoração](persona-v2/README.md)                   |
| Decisões aprovadas e regras substituídas               | [Registro de decisões](persona-v2/decisions.md)                 |
| Pendências e evidência exigida por gate                | [Matriz de aceite](persona-v2/acceptance.md)                    |
| Implementação e homologação ainda abertas              | [Trabalho restante](persona-v2/remaining-plan.md)               |
| Integridade das evidências de liberação                | [Contrato do verificador](persona-v2/release-evidence.md)       |
| Empacotamento isolado para homologação                 | [Distribuição candidata](persona-v2/candidate-distribution.md)  |
| Limpeza explícita de controle descartável local        | [Reset de desenvolvimento](persona-v2/development-reset.md)     |
| Configuração separada para o futuro corte              | [Preparação de produção](persona-v2/production-distribution.md) |
| Interface, navegação, tokens e identidade Se7e         | [Console v2](persona-v2/console.md)                             |
| Pacotes privados, validador e integração pendente      | [Plugin Se7e](persona-v2/plugin.md)                             |
| Consentimento, conexão ChatGPT e autorização derivada  | [OAuth persona-v2](persona-v2/oauth.md)                         |
| Criar persona, conectar fontes, treinar e emitir token | [Fluxo inicial](persona-v2/onboarding.md)                       |
| Motor, identidade física e suspensão de vínculos       | [Identidade da fonte](persona-v2/source-identity.md)            |
| Rascunho, casos, preview e publicação                  | [Catálogo](persona-v2/catalog.md)                               |
| SELECT, validação, recortes e paginação                | [Consultas por fonte](persona-v2/source-queries.md)             |
| Conhecimento compartilhado e perfis físicos            | [Catálogos estruturais](persona-v2/shared-knowledge.md)         |
| Contratos e ações REST/MCP remoto                      | [Integrações externas](persona-v2/external-integrations.md)     |
| Cache isolado, singleflight e invalidação              | [Cache v2](persona-v2/query-cache.md)                           |
| Combinação tipada de fontes                            | [Cruzamentos](persona-v2/federation.md)                         |
| Preparação, aprovação, execução e conciliação          | [Operações SQL](persona-v2/sql-operations.md)                   |
| Rodadas executadas e alcance das evidências            | [Validação](persona-v2/validation.md)                           |
| Prazo obrigatório, tarefas e notificações internas     | [Worker de revisão v2](persona-v2/review-worker.md)             |
| Simulação, lock e retomada de chaves do cofre          | [Rotação do cofre v2](persona-v2/vault-rotation.md)             |
| Assinatura, claims e retomada de notificações externas | [Outbox v2](persona-v2/outbox.md)                               |
| Anexos JSON/binários, handles e download autorizado    | [Anexos v2](persona-v2/attachments.md)                          |
| Templates, datasets e importação estrutural de DDL     | [Biblioteca editorial v2](persona-v2/knowledge-library.md)      |
| Fixture e cadeia real MCP/hub/agente nos três motores  | [Homologação isolada](persona-v2/homologation-chain.md)         |

## Referências da entrada principal legada

Estes documentos mantêm o contrato da aplicação ainda em uso. Identidade por
acesso, tools, migrations, cache e OAuth descritos aqui não são o modelo novo.
Consulte-os para manutenção do legado, sem importar suas restrições para a v2.

| Tema                     | Referência                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquitetura e dados      | [Arquitetura](architecture/hexagonal-architecture.md), [modelo de dados](data/data-model.md)                                                               |
| Tools, resources e erros | [Tools](mcp/tools.md), [erros](mcp/error-mapping.md)                                                                                                       |
| Credenciais e conexão    | [Cofre](auth/vault-and-mcp-token.md), [clientes](clients/connecting-clients.md), [console](clients/console.md)                                             |
| Treinamento e curadoria  | [Treinamento](product/training.md)                                                                                                                         |
| Integração REST          | [Hub](plug-server/README.md), [autenticação](plug-server/auth.md), [comunicação](plug-server/communication.md), [adapter](plug-server/rest-integration.md) |
| OAuth opcional           | [Contrato](auth/chatgpt-oauth.md), [allowlists](operations/chatgpt-oauth-allowlist.md)                                                                     |
| Operação                 | [Worker](operations/worker.md), [Redis](operations/redis.md)                                                                                               |

## Evidências

Rodadas da refatoração: [validação persona-v2](persona-v2/validation.md).
Homologação OAuth do runtime legado ainda aberta:
[validação ChatGPT](operations/chatgpt-validation.md).
[Changelog](../CHANGELOG.md) e [instalação](../README.md).

Relatórios valem para a revisão e a rodada descritas. Não substituir evidência
histórica por totais novos sem executar/registrar a rodada correspondente.

## Material histórico

[Gramática Firebird anterior](persona-v2/firebird-sql.md) é preservada para
rastreabilidade, fora do suporte atual da v2. Os relatórios datados ficam no
índice de evidências; não devem ser usados como contrato vigente. Documentos
do runtime legado continuam necessários enquanto essa entrada estiver em uso.

## Validação automática

Execute `npm run docs:check` após alterar documentação, rules ou seus exemplos.
O CI roda o comando e suas regressões em Linux/Windows, sem serviços externos;
release:check também o inclui. Falhas informam arquivo, linha e tipo do problema.

O comando verifica:

- Links locais, imagens, referências Markdown e âncoras em Markdown; nomes de
  arquivos precisam ter caixa exata também no Windows. URLs externas são ignoradas.
- Todas as rules em `.cursor/rules/` com link Markdown real no AGENTS.md,
  description e alwaysApply no frontmatter.
- Sintaxe dos blocos JSON e arquivos JSON em docs/. Exemplos com marcador
  `json docs:<contrato>` usam schemas da aplicação; consultas e entradas de operações
  também passam por compilação pura em contexto sintético, sem executar SQL.
- Exemplos obrigatórios e registro de novos JSONs em persona-v2/examples,
  definidos em [scripts/docs/examples.ts](../scripts/docs/examples.ts). Remover
  marcador ou exemplo obrigatório faz a checagem falhar.
- Seções da matriz de aceite para todos os requiredGates do manifesto.

Ao adicionar exemplo tipado, use o marcador de contrato na abertura do bloco JSON
ou registre o arquivo no catálogo do checker. Exemplo de concessões:
[permissions.json](persona-v2/examples/permissions.json).
Validação documental não confirma semântica, autoridade operacional ou aceite de gate.
Formatação continua sendo verificada por format:check.
