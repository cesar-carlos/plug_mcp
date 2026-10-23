# Confirmação perdida no console — 2026-10-20

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, alterações locais.
SHA-256:

- `web/src/persona-v2/model.ts`: `C7940312A8189A023A0A91DA0FA45030B97A4B06EF287C5A9897C96A838A3997`
- `web/src/persona-v2/model.test.ts`: `880655505FC051E335E78AFD4F896057F28E72878AB1C54CFD2C294C70888E83`

## Correção

ContextRequests recomendava nova tentativa após corpo ilegível inclusive em
POST. Agora falha de rede ou corpo ilegível de POST/alteração produz
RESPONSE_UNCONFIRMED, com orientação de conferência do estado e sem reenvio
automático. Não inventa estado terminal, receipt, rollback nem confirmação de
que o servidor deixou de executar. Detalhes da exceção de rede não são expostos.
GET conserva orientação de leitura explícita; contexto descartado prevalece.

## Validação

Wrapper Node do projeto: typecheck web, lint web e build passaram.
`npm run test --prefix web`: 86 testes em 22 arquivos passaram, fora do sandbox
para evitar o problema conhecido dos módulos temporários do Vitest.
Novos casos conferem falha de rede, corpo HTML e rejeição tardia após troca
de contexto; nenhuma repetição de fetch ou exposição do conteúdo interno.
Build conserva avisos de comentários Zod e chunk acima de 500 kB.

Não foi necessário banco ou serviço externo. Esta rodada não executou Chromium,
quedas reais em commit, efeitos externos ou avaliação da IA. É evidência dirigida
de `oauth-and-console`, sem encerrar o gate. HTTPS/ChatGPT permanecem manuais,
deploy bloqueado e ready:false.
