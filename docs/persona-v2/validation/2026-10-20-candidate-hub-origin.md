# Origem do hub na fixture da candidata — 2026-10-20

Imagem inalterada: `sha256:7a7114587a37ecdb91577ec13d4122a87150931a2e6872a706c1e517bf4f8a21`.
Hub fixado: `0dc94d6990167f65e093b1fb68a8150630e2057c`.
Fixtures próprias, autoridade Prisma e PostgreSQL, SQL Server e SQL Anywhere.
Nenhuma fonte operacional utilizada; deploy continua bloqueado.

## Causa e correção

A reprodução PostgreSQL às 12:38:34 registrou recusa nativa
`SQL_OPERATION_AUTHORIZATION_DENIED` tanto em `sql.operation.execute` quanto
em `sql.operation.get`. A origem integra o hash físico validado pelo agente:
Docker usava `host.docker.internal`, mas a configuração persistida do agente
usava `127.0.0.1`. O erro HTTP observado não provava indisponibilidade do banco.

O controlador da fixture agora preserva a origem loopback em todos os
participantes. Um relay TCP dentro do contêiner encaminha exclusivamente a porta
verificada do hub ao host. Não interpreta conteúdo, reescreve identidade,
substitui gateway ou relaxa autorização. Morre com o contêiner.
O helper alternativo que corrigia apenas a composição local foi removido:
não resolvia a divergência com a configuração do agente.

O teste registra somente método/código/etapa de respostas RPC de operação
quando falha, sem SQL, parâmetros ou credenciais. Não reenvia efeitos.

## Rodadas dirigidas

- Reprodução anterior: um cenário PostgreSQL falhou, 78 fora do filtro,
  30,66 segundos. Metadados nativos permitiram identificar a causa acima.
- Após correção: três cenários de lançamentos passaram, um cenário de recuperação
  falhou e 75 ficaram fora do filtro, 73,08 segundos, início 12:40:53.
  A recuperação encontrou os três receipts incertos, mas faltaram callbacks
  de recusa estrutural produzidos por testes não selecionados. Isso não comprova
  recuperação completa nem justifica retirar a asserção.
- Todas as fixtures dessas rodadas foram removidas pelos controladores.
- Typecheck e lint dos dois arquivos TypeScript alterados passaram.

## Matriz integral após a correção

Início 12:42:49, 570,74 segundos, **78 aprovações e uma falha**, sem filtro.
As oito falhas da rodada anterior não se repetiram: delegação, adoção nos três
motores, lançamentos e recuperação com todos os pré-requisitos passaram.
Fixture removida pelo controlador.

A falha restante foi a comparação exata de `candidate-image.json`, antes do
percurso Chromium: o controlador acrescentou `hubLoopbackRelay:true`, mas a
asserção ainda esperava os três campos antigos. A asserção agora exige também
esse campo, preservando comparação exata, imagem imutável e ausência de overrides.
Repetição dirigida Chromium após esse ajuste: **um cenário aprovado, 78 fora do
filtro**, início 12:53:07, 42,02 segundos. Criou persona, cadastrou três fontes,
treinou/publicou e consultou pela imagem e cadeia persistente real. A fixture
foi removida. Não houve mudança de runtime ou reconstrução da imagem entre
as duas rodadas; somente a asserção do metadado da fixture mudou.

Não apresentar os resultados como uma rodada integral de 79 aprovações.
Typecheck, lint dirigido, formatação dos arquivos TypeScript/relatório e
`docs:check` passaram. Nenhum gate encerrado; este relay de fixture não comprova
infraestrutura pública, TLS ou instalação ChatGPT.
