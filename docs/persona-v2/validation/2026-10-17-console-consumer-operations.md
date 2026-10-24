# Console: ações do consumidor — 2026-10-17

Evidência parcial de desenvolvimento. Bases de revisão: MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub
`76950497dc386130e13b7d6afc0678e50208e985` e agente
`7d00ae8a8f822605d76e775fb5659f27e29df539`, com alterações locais preservadas.
Não encerra gates, não substitui a entrada
legada e não libera produção. O [inventário SHA-256](2026-10-17-console-consumer-operations-files.json)
identifica arquivos desta frente; alterações locais anteriores são preservadas.
Nenhuma branch, commit, push, imagem publicada ou deploy foi realizado.

## Entrega

Operações SQL e ações externas têm painel do consumidor para preparações
existentes: conferir estado, executar com confirmação explícita, solicitar
cancelamento e consultar conciliação treinada. A aprovação humana continua no
serviço administrativo Client; não executa e não substitui o Bearer solicitante.
Não há criação implícita de preparação, edição de SQL/parâmetros ou aprovação
por tool. Nenhum novo contrato MCP/HTTP, migration ou framework foi introduzido.

O painel usa as tools existentes, confere persona e relê estado antes de agir.
Envio de referência contém somente operationId/fingerprint. Uma falha encontrada
no Chromium foi corrigida: copiar o objeto administrativo inteiro também copiava
campos da revisão, incompatíveis com o schema estrito. O teste agora exige o
objeto exato e há regressão unitária específica.

O estado local controla somente UX. O servidor continua aplicando token,
concessões, publicação, fontes, validade, aprovação e journal durável. A execução
tem trava contra clique duplo e marca de tentativa em memória; confirmação
perdida remove o resultado anterior e não habilita reenvio. Há acompanhamento
explícito sem polling ou retry automático. Token/persona/seleção alterados
invalidam respostas anteriores. Bearer não é persistido nem transportado em URL.

Cancelamento solicitado não prova rollback. Ações externas só cancelam antes do
envio. Conciliação de unknown usa o procedimento treinado; evidência externa é
separada e seguida de leitura do estado, sem fabricar receipt ou repetir ação.
Resposta externa permanece texto escapado e sem autoridade. Retenção conserva
seus avisos e não transforma ausência de conteúdo em resultado vazio.

Confirmações pendentes são protegidas na navegação, troca de persona, seleção
e logout. Campos ficam bloqueados durante requisições; erros focam o resumo.
O [plano restante](../remaining-plan.md) conserva dezesseis etapas e distingue
implementações restantes, homologação e dependências externas. Cache/anexos,
runners, setups e os quatro jobs não são recolocados como ausentes. Criação
estruturada de preparações, editores completos, integrações e administração
restantes continuam explicitamente pendentes.

## Validação

Node **24.21.0**, TypeScript real **7.0.2** no servidor e Chromium
**153.0.8010.12**; Vue/Vue Router e o toolchain existente
do console foram preservados. Fixture PostgreSQL Docker isolada
`se7e-console-77c1b4a34a1e`, PostgreSQL **17.11**, somente loopback e label própria. O servidor Chromium
cria controle e duas bases sintéticas aleatórias com sufixo `_test`. As três
jornadas novas interceptam somente o transporte administrativo/MCP de operações
para verificar a UI, sem enviar DML ou chamadas a provedores reais.

Cenários novos e regressões incluem:

- Não executar pela sessão Client; exigir Bearer da persona correta e confirmar
  separadamente. Relê estado para detectar publicação/aprovação/estado alterados.
- Referência exata, sem copiar comando/SQL/params da revisão administrativa.
- Clique duplo, execução sem confirmação, preparação vencida ou pendente,
  confirmação perdida, token trocado e resposta atrasada, sem reenvio.
- Cancelamento SQL em execução distinguido de rollback; externo enviado não
  cancela. Conciliação externa não modifica receipt nem executa a ação.
- Chromium em 390px, teclado/foco, proteção da confirmação ao navegar, ausência
  de rolagem horizontal e ausência de Bearer em armazenamento/URL.
- Preservação das revisões/aprovações existentes e das outras jornadas do console.

| Verificação                                        | Resultado                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Chromium, suíte completa                           | **33/33**, sem skips, **3,2 minutos**                                          |
| Chromium, seleção inicial de novas ações/aprovação | **5/5**, **9,5 s**                                                             |
| Frontend, suíte nativa                             | **45/45**, **0,735 s**                                                         |
| Regressão geral MCP nativa                         | **1.470 aprovados, 91 não executados**; **78,14 s**                            |
| Checks locais                                      | lint/tipos/build servidor e frontend, Node/compiler e training:check aprovados |

As 91 não execuções são preexistentes na configuração geral; não certificam
infraestrutura obrigatória. O Chromium e a suíte frontend desta frente não
tiveram skips. Totais sobrepostos não são somados. A rodada inclui o percurso
persona → duas bases → treinamento → publicação → consulta PostgreSQL com hub
sintético. Nenhuma rodada histórica foi somada para certificar este candidato.

O bundle final continua `persona-DBGsQj54.js` após ajuste de chaves ao padrão das
rules; código minificado é o mesmo exercitado pela suíte completa. A montagem
inclui as duas entradas separadas, sem substituir runtime ou assets legados.

Rodadas intermediárias corrigiram a fixture para ler o envelope administrativo
`personas` e enviar o CSRF obrigatório também no GET. As proteções do servidor
não foram relaxadas. O sandbox removeu módulos temporários de testes frontend;
a repetição nativa preservou a mesma suíte, sem converter falhas em skips.

## Limites e liberação

Fixture removida depois de conferir nome, label, bancos com nomes próprios,
volume anônimo exclusivo e raiz temporária. Recursos de produção não foram
acessados ou alterados. Não há fixture desta rodada deixada em execução.

Mocks do transporte de operações no navegador não comprovam autorização real,
commit, rollback, conciliação, PostgreSQL/SQL Server/SQL Anywhere ou provedor
externo. Os demais casos de navegador usam PostgreSQL real e hub sintético;
isso também não é a cadeia persistente MCP → hub → agente dos três motores.
Não foram usados dados, credenciais ou fontes do usuário.

Leitor de tela, zoom real de 200%, demais larguras, instalação desktop, imagens,
infraestrutura e avaliação da IA exigem suas próprias evidências atuais. Relatórios
históricos não certificam automaticamente este candidato. HTTPS público e ChatGPT
permanecem para validação manual.

Os três manifestos permanecem `ready:false`, com treze gates e nenhum concluído.
Esta rodada não autoriza publicação, deploy ou corte coordenado.
