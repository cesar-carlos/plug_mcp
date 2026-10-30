# Detecção de deploy pendente — 2026-10-30

O workflow anterior verificava somente os arquivos do último commit. Assim,
`c33887d` passou no CI e recebeu status verde de deploy sem envio, embora as
correções de `044a71a` e `5992c70` ainda não estivessem no servidor.

O novo gate consulta o histórico paginado de deploys do próprio repositório/main,
exige sucesso da etapa real de publicação e seleciona o horário mais recente de
conclusão dessa etapa, inclusive reexecuções. Workflows que pulam o envio não
atualizam a referência. O diff Git acumulado usa remoções/adições para renomes.
Ausência de recibo exige publicação normal; falha da API, histórico incompleto,
revisões divergentes ou retrocesso interrompem o gate. Não muda os checks da
imagem, CI, migração, autoridade ou aprovação Client.

Validação local: 35 testes de detecção/contrato de deploy aprovados, incluindo
fixture Git real, no-ops, paginação do histórico, falha de API, ausência de
baseline e retrocesso. ESLint, TypeScript 7, build e docs:check aprovados.
A primeira tentativa da suíte Bash falhou sob sandbox; repetição autorizada
passou. A simulação de leitura no GitHub encontrou a última publicação comprovada
`9b99260` e retornou publish=true para `c33887d`, corrigindo o caso real.

Node local 24.18 permanece abaixo do mínimo 24.21; o gate de runtime pertence à
rodada CI exata. Recibos do GitHub não comprovam ausência de mudanças manuais no
host. Conferir GIT_SHA, health/readiness e logs após deploy. Esta evidência local
não declara publicação remota ou aceite integral para clientes.
