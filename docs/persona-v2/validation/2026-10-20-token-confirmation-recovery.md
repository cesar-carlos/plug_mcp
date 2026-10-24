# Recuperação de confirmação de tokens — 2026-10-20

## Correção

TokenManager bloqueia salvar, rotacionar e revogar após RESPONSE_UNCONFIRMED.
Limpa o Bearer exibido e conserva a edição local. Releitura explícita exige
descarte confirmado quando houver edição; só leitura bem-sucedida remove o
bloqueio. Não recupera segredo de rotação nem repete a mutação.

## Evidência

Tipos e lint web passaram. Build passou com avisos conhecidos do Zod e chunk
do console acima de 500 kB. Chromium dirigido: um teste aprovado em 4,2 segundos.
Verificou uma única mutação, bloqueio dos três botões, falha de leitura mantendo
edição/bloqueio e recuperação com versão atual mediante leitura.

A primeira invocação não selecionou testes por passagem incorreta do filtro
pelo npm. A primeira execução efetiva expirou porque o teste tratava o diálogo
HTML como diálogo nativo. Corrigido o teste para clicar no diálogo real e aguardar
a resposta 503; nenhuma asserção funcional foi retirada.

PostgreSQL 17 em container descartável, hub sintético e respostas de tokens
controladas pelo teste para simular confirmação perdida. Cada tentativa usou
fixture nova, removida no finally. Não comprova perda real durante commit,
OAuth remoto ou recuperação do segredo. Nenhuma fonte operacional utilizada.

## Limites

Alteração posterior à imagem candidata validada nesta data: aquela imagem não
contém esta correção. Exige novo build/validação do candidato final.
Aceite integral, HTTPS/ChatGPT e testes manuais permanecem pendentes.
Deploy bloqueado; ready:false não foi alterado.
