# Publicação externa OAuth com hub persistente — 2026-10-20

Runner prisma, filtro `delegação externa com hub persistente`: um cenário
aprovado em 24,17 segundos, início 11:37:27 (America/Cuiaba). Outros 78 casos
filtrados. Fixture própria removida ao término; nenhuma fonte operacional usada.

Amplia o caso de rascunho delegado: integração recuperada explicitamente,
relatório do executor separado com provedor sintético e prazo escolhido por
sessão do responsável. OAuth consente publicar, treinar e gestão sobre ID exato.

Verificado pela API HTTP:

- Sem escopo ou permissão, revisão recusada.
- Conexão B cria prévia vinculada à sua autoridade.
- Conexão A não pode consumir essa prévia (OPERATION_CONFLICT).
- B publica o conteúdo exato; repetição da confirmação é recusada.
- Rascunho passa a indicar publicação existente.
- Permissões do token originador permanecem exatamente iguais após publicação.
- Revogações individuais e remotas da delegação continuam bloqueando acesso.

O relatório técnico foi produzido com transport de fixture, sem envio externo.
Não usar esta rodada como prova de provedor real, todas as janelas concorrentes,
imagem final, HTTPS público ou ChatGPT. Não há DML em fontes do usuário.

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` com alterações locais;
hub `0dc94d6990167f65e093b1fb68a8150630e2057c`, training:check aprovado.
SHA-256 dos helpers:

- persona-chain-external-delegation.ts:
  `DBC97EE5A534CAE91E9996466294945DE3E931D5D34941DDA20FFD99C8CBABB5`.
- persona-chain-integration-management-oauth.ts:
  `306854062E6E392CFDF82247C0857CC91565D5D936F7DD832F0BB9A017FE5BE6`.

Lint e tipos passaram. Deploy permanece bloqueado; nenhum gate encerrado.
