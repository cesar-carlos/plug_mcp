# Emissão sem confirmação — 2026-10-20

## Implementação

Console mantém bloqueio em memória por persona após RESPONSE_UNCONFIRMED na
emissão. Limpa Bearer exibido, exige releitura explícita da lista e confirmação
humana para iniciar nova emissão. Limpa nome e concessões ao reiniciar.
Falha na leitura não habilita nova emissão. Encerrar sessão limpa os metadados.

A lista não associa automaticamente um token à tentativa por nome. O responsável
precisa conferir e revogar um cadastro sem segredo, se necessário. Não há
idempotência de servidor nova, segredo recuperável ou persistência no navegador.

## Validação

Tipos, lint web e build passaram. Dois testes Chromium dirigidos passaram em
4,6 segundos: emissão incerta e recuperação da edição de tokens. O primeiro
simula cadastro seguido de perda da resposta, verifica bloqueio, falha de leitura,
lista, confirmação explícita e limpeza de concessões. Apenas um POST de emissão
é enviado. O segundo preserva a regressão anterior da edição.

PostgreSQL 17 de fixture descartável; autoridade sintética e respostas de tokens
controladas pelo teste. Container removido no finally. Não comprova perda real
de rede durante commit ou comportamento do cliente ChatGPT.

Build mantém avisos de anotações Zod e chunk do console acima de 500 kB.
Não foi reconstruída a imagem candidata nesta rodada. Deploy permanece bloqueado;
HTTPS/ChatGPT e aceite integral continuam pendentes.
