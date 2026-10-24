# Descoberta MCP e importação OpenAPI — 2026-10-19

Evidência parcial de desenvolvimento para a entrada persona-v2. HTTPS público e
ChatGPT permanecem para validação manual. Não certifica provedores instalados,
cadeia SQL dos três motores ou IA consumidora; não encerra gates ou libera deploy.

## Escopo

Descoberta usa credencial técnica da integração cadastrada, com DNS/IP fixado,
TLS e revalidação de autoridade/vínculo antes de cada envio e da entrega. Somente
initialize, notifications/initialized e tools/list, sem tools/call, redirects,
retry ou novos destinos. Paginação completa limitada recusa duplicatas, ciclos
e catálogo excessivo; execução normal reutiliza a validação paginada.

Importação OpenAPI 3.0/3.1 JSON é local e limitada. Não acessa servers/$ref
remotos, não importa credenciais, não executa exemplos. A gramática plana mantém
campos, tipos, obrigatoriedade e schemas MCP; restrições não representáveis
produzem impedimento, sem conversão ou perda silenciosa. Proposta MCP começa
como ação com aprovação humana, sem confiar em hints de leitura.

Console permite arquivo UTF-8, análise, seleção de operação e aplicação somente
ao formulário. Salvar cria rascunho explícito vinculado à integração/versionamento
observados; rotação exige nova importação. Não modifica skill publicada, ativa
conexão, executa efeito ou herda casos, relatório, calendário ou concessões.
Dados e descrições são texto escapado, mantidos em memória e descartados com o
contexto. Casos, runner e publicação continuam separados. Não houve migration.

## Verificação

PostgreSQL próprio com nome `_test`, porta loopback e credenciais aleatórias.
Fixture exclusiva `se7e-external-import-f0aaaa10d8c3`. Hub sintético e composição
MCP real; descoberta do navegador usa provedor TLS nativo isolado com resolver/CA
de teste, sem opções de bypass na aplicação. Nenhuma credencial ou fonte do
usuário foi usada.

Testes cobrem referências locais/remotas, constraints recusadas, parâmetros,
schemas e respostas, páginas/cursor/duplicatas, DNS privado, autorização antes
do envio/entrega, catálogo incompleto, rotação e ausência de efeitos. PostgreSQL
verifica isolamento por persona, proposta sem persistência, CAS da integração
e criação explícita de rascunho. Chromium cobre arquivo, seleção, recusa visível,
revisão de efeitos, aprovação humana inicial, rascunho sem publicação/journal e
larguras 360/390/768/1280. Isso não comprova zoom de 200% ou leitor de tela.

Ambiente: Node 24.21.0, TypeScript real 7.0.2, PostgreSQL 17.11,
Chromium 153.0.8010.12 e Playwright 1.63.0.

| Verificação                                   | Resultado                               | Duração |
| --------------------------------------------- | --------------------------------------- | ------- |
| Chromium completo                             | 40 aprovados, sem skip                  | 3,5 min |
| Chromium dirigido de importação/editor        | 4 aprovados, sem skip                   | 14,0 s  |
| PostgreSQL administrativo/delegação/externas  | 57 aprovados, sem skip                  | 26,94 s |
| Parser/transporte/descoberta dirigidos finais | 21 aprovados, sem skip                  | 838 ms  |
| Frontend                                      | 63 aprovados, sem skip                  | 1,21 s  |
| Suíte geral                                   | 1.485 aprovados; 91 skips preexistentes | 72,98 s |

A suíte geral precedeu o caso adicional de execução da segunda página; os
21 testes dirigidos finais conferem esse caso no mesmo código. Skips não
representam aceite de motores/infraestrutura ausentes. Os primeiros percursos
dirigidos exigiram ajuste dos seletores de combobox e da verificação do atributo
disabled de option; a rodada completa acima usa os testes corrigidos. A fixture
PostgreSQL passou a rotacionar cifra e versão conjuntamente e reautenticar após
a revogação invalidar a sessão antiga, preservando os portões reais.

Node/compiler, tipos servidor/web, lint servidor/web, builds servidor/web,
formatação, `training:check` e `docs:check` passaram. A única alteração posterior
à regressão do navegador foi esclarecer nas instruções e documentação a
diferença entre descobrir metadados e executar ações; build/lint foram repetidos.

Revisões-base efetivamente conferidas: MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub
`76950497dc386130e13b7d6afc0678e50208e985` e agente
`7d00ae8a8f822605d76e775fb5659f27e29df539`. O
[inventário SHA-256](2026-10-19-external-discovery-import-files.json) identifica
o snapshot local e assets; revisão-base não representa alterações locais como
commit. Relatórios anteriores permanecem históricos.

Limpeza confirmada: contêiner exclusivo com treze bancos de fixture, um volume
anônimo e diretório temporário com segredos removidos. O estado do navegador
foi removido após conferir seu vínculo com a fixture; nenhum listener permaneceu
na porta 5188. Quatro diretórios temporários do provedor do navegador também
foram removidos após conferir os horários das instâncias, caminhos exatos e
conteúdo restrito a ledger vazio. Recursos operacionais não foram alterados.

## Liberação

Manifestos dos três projetos permanecem com `ready: false`. Entradas legadas não
foram substituídas. Sem branch, commit, push, publicação de imagem ou deploy.
Validação manual de HTTPS/ChatGPT e demais pendências seguem no plano canônico.
