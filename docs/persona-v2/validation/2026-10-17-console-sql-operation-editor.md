# Console — editor de skills de operação SQL — 2026-10-17

Evidência parcial de desenvolvimento, com alterações locais preservadas. Bases:
MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub
`76950497dc386130e13b7d6afc0678e50208e985` e agente
`7d00ae8a8f822605d76e775fb5659f27e29df539`.
O [inventário SHA-256](2026-10-17-console-sql-operation-editor-files.json)
identifica os arquivos desta frente. Snapshot não é commit. Nenhuma branch,
commit, push, imagem publicada ou deploy é parte desta rodada.

## Entrega e limites

Editor em Treinamentos cria/edita operações de uma fonte: finalidade, parâmetros
tipados, tabelas/colunas, identidade/concorrência/chaves, etapas ordenadas, bindings
de parâmetros/saídas, limites, filtros adaptáveis, aprovação e conciliação.
Listas de chaves preservam separadores durante digitação. Aprovação começa
humana; publicar não executa ou aprova lançamentos. Vínculos compartilhados e
relacionamentos existentes são preservados e têm edição avançada em JSON validado;
seu editor visual específico continua pendente.

Casos têm parâmetros, sementes e estado final tipados ou falha esperada. Integer
e decimal são strings, boolean/null são explícitos. O servidor valida o schema
fechado e aplica CAS por revisão da skill: alteração concorrente recusa, edição
local permanece, snapshot ativo não muda. Nenhum segredo ou SQL vai à auditoria.
Não houve migration, mudança na entrada legada ou no transporte de negócio.

Dois endpoints administrativos novos, com sessão Client/CSRF/Host/Origin:
`GET /skills/:skillId/testes-operacao` e
`POST /skills/:skillId/casos-operacao`, sob a persona correspondente. Relatórios
mostram somente metadados/resultados booleanos por caso, com cursor estável e
comparação de revisão/hash. Conteúdo editorial dos casos é privado da persona.
Não há endpoint de execução/aprovação de testes. O runner separado segue
obrigatório antes de prévia/revisão/publicação com hash, prazo humano e CAS.

Console protege rascunho/casos ao navegar, trocar contexto ou sair; bloqueia
envio duplicado, ignora respostas descartadas e foca erros. Revisão/publicação
usa diferenças do servidor. Edição posterior conserva nome/revisão/contrato
do snapshot publicado e invalida relatório anterior. Permissões não são ampliadas.
Corrigida comparação que antes ignorava reordenação de etapas com IDs estáveis:
agora exibe a ordem anterior/proposta. Teste específico preserva o comportamento
de ignorar reordenação semântica irrelevante de definições de tabelas/campos.

## Ambiente e verificações

Node 24.21.0, TypeScript real 7.0.2, Chromium 153.0.8010.12, Vue/Vue Router
existentes. PostgreSQL Docker de fixture `se7e-sql-editor-dc7903d491d7`, somente
loopback e label própria. Controle e bancos de runner são aleatórios `_test`;
nenhuma fonte do usuário foi utilizada. O navegador usa hub sintético; o runner
PostgreSQL é executado pelo processo de teste separado, não pelo HTTP/console.

- Casos inválidos/campo `approved` são recusados; relatório ausente bloqueia prévia.
- Criação, edição, remoção e duas edições concorrentes têm CAS transacional.
- Relatórios paginados não repetem IDs nem aceitam cursor de outra skill.
- Skill/casos de outra persona são recusados; não expõem evidências/payloads de execução.
- Runner PostgreSQL dedicado executa e limpa a fixture antes de registrar aprovação.
- Chromium percorre contrato estruturado → caso sintético → runner separado →
  relatório atual → revisão semântica → publicação → nova edição sem alterar snapshot.
- Em 390px, verifica ausência de rolagem horizontal e proteção da edição ao navegar.
- Alteração concorrente do rascunho preserva campos locais e foca erro; auditoria
  de alteração do caso registra a revisão nova na transação correspondente.
- Regressões existentes cobrem as demais jornadas e isolamento do console.

| Verificação                                                 | Resultado                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Chromium, suíte completa                                    | **34/34**, sem skips, **3,2 minutos**                                         |
| Chromium, cenário final após correções de revisão/auditoria | **1/1**, **8,0 s**                                                            |
| Publicação/casos/relatórios, PostgreSQL nativo              | **9/9**, **6,45 s**                                                           |
| Frontend nativo                                             | **47/47**, **0,712 s**                                                        |
| Regressão geral nativa final                                | **1.471 aprovados, 91 não executados**, **70,70 s**                           |
| Checks                                                      | Node/compiler, training:check, lint/tipos/build servidor e frontend aprovados |

As 91 não execuções da configuração geral são preexistentes e não certificam
infraestrutura obrigatória. Após a suíte Chromium completa, alterações de
metadados/legendas e da comparação ordenada tiveram repetição dirigida de
publicação PostgreSQL e da jornada SQL no navegador, além da regressão geral.
Bundle final do console: `persona-ez176ESP.js`. Gates documental/formatação são
verificados também após fechar o relatório/inventário.

O primeiro ensaio Chromium ajustou seletores de combos para usar o nome acessível
real. A rodada dirigida passou; o candidato final é repetido após as correções.
Testes frontend e training:check no sandbox encontraram limitações de arquivos
temporários/acesso ao checkout irmão; os mesmos testes foram repetidos nativamente.
Avisos de comentários PURE do Zod são do empacotador; build foi concluído.

## Limpeza

Concluída após parar as execuções: conferidos nome/label e todas as bases do
contêiner; somente famílias aleatórias de fixture foram encontradas. Removidos
o contêiner próprio, seu volume anônimo e o diretório temporário com credencial
sintética. Havia dezesseis bases de fixture/controle de rodadas dirigidas e da
suíte completa; nenhuma base operacional. Nenhum banco, credencial ou serviço
existente do usuário foi alterado. O runner removeu seu banco dedicado ao fim
de cada cenário.

## Aceite

Não certifica novos efeitos pela cadeia persistente MCP → hub → agente nos três
motores, nem instalação desktop, leitor de tela, zoom real de 200%, infraestrutura
operacional, HTTPS público, ChatGPT ou avaliação da IA. Essas verificações
permanecem na matriz geral/manual. Os três manifestos continuam `ready: false`,
sem gates concluídos. Homologação histórica não encerra o aceite deste candidato.
