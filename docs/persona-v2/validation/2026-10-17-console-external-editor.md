# Editor de skills externas — 2026-10-17

Evidência parcial de desenvolvimento. Revisões-base: MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub
`76950497dc386130e13b7d6afc0678e50208e985`, agente
`7d00ae8a8f822605d76e775fb5659f27e29df539`. Alterações locais preservadas;
snapshot não é commit. [Inventário SHA-256](2026-10-17-console-external-editor-files.json)
identifica esta frente. Sem branch, commit, push, imagem publicada ou deploy.

## Implementação

Editor em Treinamentos funciona sem fontes SQL e carrega sob demanda. Lista
metadados de conexões sem recuperar credenciais; cria/edita rascunhos REST/MCP
por CAS, preservando operationId. Contratos publicados ficam somente leitura.
Preparar nova skill copia o contrato para outra identidade, sem casos, relatórios,
publicação ou concessões herdadas. Ações copiadas começam com aprovação humana,
mesmo quando a origem permitia aprovação automática. Snapshots e contratos
anteriores permanecem intactos.

Campos de entrada/saída têm tipo, obrigatoriedade e finalidade livres. Efeitos,
aprovação, rota/ferramenta, limites e conciliação são estruturados. Leitura treinada
declara garantia, bindings da chave original, contagem, completude, correlação,
estado e valor tipado. Schemas MCP propostos não são descoberta ou prova remota;
geração/substituição são explícitas, e constraints incompatíveis são recusadas.
JSON avançado não muda a identidade nem substitui campos pendentes silenciosamente.

Casos/relatórios reutilizam o painel existente. Recarregar protege edição;
mudança concorrente do contrato não atualiza silenciosamente o CAS do formulário
antigo. Revisão de publicação vem do servidor com conteúdo, destino, credencial,
campos, efeitos e casos exatos. Exige relatório atual, prazo humano, hash e
confirmação, sem conceder acesso ou aprovar ações. Nenhum endpoint executa runner
ou aprova relatório. Não houve migration; persistência v2 existente foi reutilizada.

## Verificação

Fixture Docker própria `se7e-external-editor-92fcd1f22d24`, somente loopback e
nomes `_test`, sem fontes/credenciais do usuário. Node 24.21.0 e TypeScript real
7.0.2. PostgreSQL 17.11 de controle nativo, Chromium 153.0.8010.12,
composição MCP real e hub sintético.

Os percursos REST e MCP no Chromium exercitam cadastro, campos, schemas,
conciliação por chave original, casos, relatório separado, prazo/comparação e
publicação. A operação de teste usa provedor sintético fora do processo do
navegador; não certifica o serviço real ou sua idempotência. Verificam ausência
de dispatch/journal de ação pela UI, contrato publicado imutável, cópia sem
autoridade herdada, conflito preservado, edição protegida e 360/390/768/1280px.

PostgreSQL verifica metadata sem segredo, identidade estável, concorrência CAS,
isolamento de persona/conector, relatório/prévia obsoletos, comparação do servidor,
prazo, contrato publicado e autoridade indisponível. A suíte também contém fixtures
HTTPS locais dos adapters/runner; não certifica HTTPS público, provedor instalado
ou ChatGPT real. Testes frontend preservam contratos e schemas recusados.

Resultados desta rodada:

| Verificação                                             | Resultado                               | Duração |
| ------------------------------------------------------- | --------------------------------------- | ------- |
| Regressão Chromium completa                             | 38 aprovados, sem skip                  | 3,7 min |
| Chromium dirigido com bundle final                      | 6 aprovados, sem skip                   | 17,3 s  |
| Integração PostgreSQL administrativa/delegação/externas | 56 aprovados, sem skip                  | 44,32 s |
| Frontend                                                | 63 aprovados, sem skip                  | 1,32 s  |
| Suíte geral                                             | 1.471 aprovados; 91 skips preexistentes | 87,11 s |

A primeira rodada completa encontrou três falhas de carregamento dos painéis:
a leitura imediata de casos ocupava o bloqueio compartilhado antes da montagem
do painel de ações. A inicialização após montagem foi corrigida e a regressão
completa repetida, resultando nos 38 aprovados acima. Após essa rodada, a cópia
recebeu a regra de aprovação humana inicial; frontend, tipos, lint e os seis
percursos dirigidos foram verificados novamente com o bundle final. A rodada
completa anterior não certifica sozinha essa alteração posterior.

Node/compiler, tipos, lint, formatação, builds servidor/web, contrato do hub
(`training:check`) e `docs:check` passaram. Skips da suíte geral não são aceite
dos motores/infraestrutura ausentes. Evidências de escopo anterior permanecem
históricas; este inventário registra somente a frente atual e seus assets.

Limpeza confirmada após encerrar o servidor de testes: contêiner exclusivo,
22 bancos de fixture, um volume anônimo e diretório temporário com segredos
removidos; nenhum listener do console ficou na porta 5188. Estado temporário
do navegador removido somente após conferir sua identidade no inventário da
fixture. Nenhum recurso operacional foi limpo ou alterado.

## Limites e liberação

Não homologa a cadeia instalada dos três motores, o provedor externo real,
leitor de tela, zoom real de 200%, infraestrutura, plugin ou IA consumidora.
HTTPS e ChatGPT permanecem para validação manual. OpenAPI/descoberta assistida
e demais pendências do plano não são consideradas entregues pelo editor.

Os três manifestos conservam `ready: false`, sem gates concluídos. A entrada e
o worker legados não foram substituídos; nenhuma publicação/deploy foi autorizado.
