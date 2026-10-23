# Recuperação da delegação no console — 2026-10-19

## Entrega

O painel permite conferir explicitamente o estado depois de falha inicial,
conflito ou confirmação perdida. Mutações ficam bloqueadas até leitura concluída;
seleção local é preservada e descarte exige confirmação. Leitura/mutação bloqueiam
ações concorrentes e navegação; erro recebe foco e sucesso usa anúncio separado.
O servidor mantém CAS e revalidação. Não há retry de POST nem autoridade concedida
por uma leitura. O rótulo da permissão de integrações foi corrigido: execução
exige concessões próprias, sem ser anunciada como funcionalidade ausente.

## Validação

Teste dirigido reproduziu ausência de resumo acessível na versão anterior e
passou após correção (4,0 segundos). Simula falha GET e mutação com confirmação
perdida, verifica seleção preservada, bloqueio, cancelamento do descarte e
recuperação por GET sem segundo POST. Respostas de delegação são controladas
pelo teste; não é prova de efeito remoto ou atomicidade com o hub.

Tipos e lint da interface/teste, build e formatação passaram. Testes da interface:
76 aprovados em 21 arquivos. Primeira tentativa encontrou erro de cache temporário
do sandbox; repetição com TEMP/TMP na pasta de fixture do workspace passou.
Chromium usa PostgreSQL 17 próprio e hub sintético. A primeira tentativa restrita
não pôde conectar ao loopback; execução autorizada usou somente a fixture.

Regressão Chromium completa: **49 testes aprovados em 4,5 minutos**, sem filtro
ou omissões. Inclui criação de persona, duas fontes, publicação e consulta,
operações, integrações, edição protegida e navegação móvel. Isso não certifica
os três motores ou o hub real, que permanecem fora desta fixture de interface.

Teardown removeu bancos temporários e arquivo de estado. Conferência posterior
encontrou somente `postgres` e `persona_delegation_test` no contêiner
`se7e-delegation-recovery-20261019`, com label própria conferida. Contêiner e volume
foram removidos. Nenhuma credencial ou banco operacional foi utilizado.

## Revisão

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Node 24 pelo wrapper do projeto. SHA-256 dos arquivos funcionais:

| Arquivo                                      | SHA-256                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| web/src/persona-v2/OwnerDelegationPanel.vue  | 8b7b368ecb43d82fa2a63edf93fa96960ef4eb31c8d02fab90d022843169d6e2 |
| web/src/persona-v2/administrative-options.ts | 2eebece1a8b1c9d19ad245a716b383f709732249666f09beac2e7508de8183ff |
| tests/persona-v2-browser/persona.spec.ts     | 046899fbc77544eb322659fc511558806aa97507afe989839f14c1e860f88b73 |

Não certifica três motores, instalação desktop, leitor de tela, HTTPS público,
ChatGPT ou imagem final. HTTPS/ChatGPT manuais; ready:false e todos os gates abertos.
Sem alteração de contrato público, backend, migration ou deploy.
