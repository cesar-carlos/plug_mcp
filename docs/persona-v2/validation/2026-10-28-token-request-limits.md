# Limites e diagnóstico da emissão de tokens — 2026-10-28

Rodada local sobre `1b472b406ff7ba1960e57478e31c9cf3d267981b`, com alterações
de trabalho desta tarefa. Não representa commit publicado ou aceite integral.

## Causa e correção

As duas falhas observadas no servidor de teste às 09:11:02 e 09:13:41 de
28/10/2026 (America/Cuiaba) corresponderam a `PayloadTooLargeError` em POST de
emissão de token. O parser de 64 KiB recusava o corpo antes da emissão e o
tratamento genérico respondia 503. A investigação consultou somente registros
sanitizados; não repetiu emissão nem coletou credenciais ou permissões reais.

As rotas administrativas de emissão, edição e rotação agora têm teto de 1 MiB;
demais rotas conservam 64 KiB. Excesso retorna 413/REQUEST_TOO_LARGE. Console e
servidor compartilham o limite. Medidor UTF-8 inclui delegação e metadados, avisa
em 80% e bloqueia excesso. Organização por finalidade é orientação, sem seleção
automática ou truncamento. Concessões e delegação permanecem independentes.

`X-Request-ID` é gerado no servidor, sem reutilizar o header do chamador. Recusas
exibem UUID válido no console. Logs técnicos usam rótulos fixos de rota, status,
teto e bytes declarados/recebidos do parser, quando disponíveis; sem URL, query,
corpo, credenciais ou conteúdo de concessões. Não substituem auditoria de emissão.

## Verificações locais

- Node 24.21.0 oficial, arquivo Windows x64 conferido contra SHA-256 da
  distribuição. Runtime isolado; instalação global do computador preservada.
- TypeScript 7.0.2 real; tipos de backend e console verificados.
- 14 testes HTTP: concessões acima de 64 KiB nas três rotas, teto exato e um
  byte acima, recusa antes da chamada ao serviço, sessão/CSRF, demais rotas,
  correlação e ausência de conteúdo privado nos registros.
- 283 testes unitários do console: tamanho UTF-8, delegação independente,
  fronteiras, 413 do servidor/proxy e referência segura, entre outras regressões.
- Cinco cenários Chromium selecionados: emissão com delegação acima do teto,
  bloqueio de salvar/rotacionar, recuperação após recusa, atendimento visível e
  preservação de edição. O cenário de transporte atravessa proxy HTTP local e
  handlers reais da aplicação; apenas os serviços de aplicação são sintéticos.
- Documentação, lint dos arquivos afetados, formatação e builds conferidos.

A primeira checagem completa detectou checkout do hub em revisão divergente.
Uma cópia isolada em `da457e05e3fd4ee407d7aefb2c58d82c7e6d92f5` permitiu
validar o contrato e a incorporação histórica exigidos, sem mudar o checkout
original ou os pins. Esse resultado não aprova revisões diferentes do hub.

Com `PLUG_SERVER_CHECKOUT` apontando à cópia isolada, `npm run release:check`
concluiu com código zero: Node/compilador, documentação, contrato do hub, lint,
formatação, tipos, testes, builds e verificação do console. A suíte geral informou
1.746 testes aprovados e 91 ignorados em 198 arquivos (192 aprovados e seis
ignorados). Os ignorados não são evidência de validação. Os 14 testes HTTP acima
já integram essa contagem; não somar resultados como cobertura independente.
O comando local não substitui jobs de CI, artefato imutável ou testes no destino.

## Limites da evidência

Após a rodada acima, o formulário ganhou seções recolhíveis e controles de
expandir/recolher campos. A checagem dessa alteração usa tipos, lint, build,
documentação e os cinco cenários Chromium selecionados, agora também com
colapso por teclado, campos inicialmente fechados e seleção preservada sem POST.
A inspeção visual usou somente a persona sintética da fixture. Isso não reexecuta
nem amplia a evidência do gate completo anterior para os demais subsistemas.

Na continuação de UI, foram adicionados busca local, filtro de selecionadas,
grupos por identidade da base, finalidades reunidas por campo e resumo junto à
emissão. Os cinco cenários Chromium passaram novamente, incluindo busca sem
acentos, resultado vazio, limpeza de filtros e seleção preservada sem POST.
Tipos, lint, build, documentação e testes unitários afetados foram conferidos.
Agrupamento mantém fontes distintas separadas e preserva capabilities originais;
formatos não reconhecidos continuam visíveis, sem interpretação adicional.

Não foram usados fontes, tokens ou dados operacionais nos testes. O proxy local
não certifica o Nginx remoto. Os serviços sintéticos não comprovam persistência
PostgreSQL nem autoridade remota; os testes HTTP demonstram que a recusa do
parser não chama o serviço de emissão/alteração. Não houve nova imagem, deploy,
teste funcional no destino ou aprovação de gates integrais nesta evidência.
A publicação continua vinculada ao fluxo de CI/imagem exatos do
[servidor de teste](../first-test-deploy.md).

## Continuação: entrega e cópia do token

Emissão e rotação confirmadas direcionam para Copiar e usar token, com foco no
painel e segredo mascarado. Cópia exige clique, mostra confirmação local e
orienta cópia manual quando o navegador recusa a área de transferência.
Estado vazio oferece acesso à lista e explica a rotação explícita; teste de
conexão e descarte são recolhidos. Não altera concessões ou armazenamento.

Validação local: 18 regressões de recuperação passaram; o teste de transporte
passou após ajuste do encaminhamento do valor emitido; uma regressão adicional
comprovou rotação única após confirmação e descarte na troca de persona.
Build, tipos, lint do console e verificação documental passaram. Inspeção visual
realizada sobre captura de fixture sintética. Não certifica emissão em banco real,
clipboard do dispositivo do usuário, instalação ChatGPT ou deploy desta alteração.
