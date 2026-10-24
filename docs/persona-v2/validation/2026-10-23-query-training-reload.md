# Releitura protegida do treinamento de consulta — 2026-10-23

## Lacuna e correção

O editor oferecia seleção de rascunhos a partir da lista em memória, mas não
releitura explícita do servidor. A regressão Chromium reproduziu conflito CAS
real: outro editor salvou a revisão, o POST local retornou 409 e preservou os
campos, mas o botão necessário para recuperar a versão atual não existia.

**Recarregar treinamento** foi acrescentado. Pede confirmação quando há edição
de treinamento, casos, conhecimento ou prazo. Recusa duplicação enquanto ocupado;
aplica somente resposta da mesma persona/skill. Falha preserva os campos e a
edição dos subpainéis. Sucesso atualiza a cópia administrativa e reinicia prévia,
confirmação, prazo e editores locais, sem salvar/publicar ou conceder acesso.

Uma segunda regressão revelou o caso local permanecendo aberto após descarte
confirmado. O painel de casos ganhou uma geração de montagem no reset do
treinamento, inclusive quando o ID/revisão continuam iguais. Salvar um caso não
aciona esse reset; o fluxo normal do painel permanece responsável pela revisão.

## Chromium com persistência PostgreSQL

A regressão dirigida passou em **11,1 segundos** após as duas correções. Confere:

- conflito 409 produzido por segunda edição administrativa real;
- cancelamento do descarte preservando nome e caso locais;
- falha de releitura 503 preservando campos, seguida de releitura bem-sucedida;
- recuperação da revisão atual e gravação posterior com CAS correto;
- descarte confirmado fechando o caso não salvo;
- manutenção do nome/revisão publicados na emissão de tokens.

Cada execução criou três bancos PostgreSQL novos com IDs próprios, removidos no
teardown. O hub é sintético nesta família, e a falha 503 foi induzida no navegador;
essa regressão não homologa transporte ou falha remota dos três motores.
A infraestrutura externa privada usada nessas execuções foi
`se7e_persona_2951fbf89281_test`, removida pelo limpador guardado após os testes.

Typecheck raiz passou. Na primeira verificação do frontend, seis suítes falharam
ao acessar arquivos SSR de um TEMP efêmero do sandbox; 61 testes chegaram a passar.
Não foi aceite. A repetição completa com acesso normal ao TEMP passou:
**22 arquivos / 86 testes**, lint, tipos Vue e build. Não houve exclusão de suíte
ou mudança de teste para contornar esse erro. Lint do teste dirigido encontrou
um corpo JSON sem tipo; a resposta recebeu tipo explícito, sem suprimir a regra.

## Imagem e cadeia persistente

Imagem candidata local `se7e-persona-v2:manual-reload-20261023`:
`sha256:5eab394d06a21e7cb63b1b53178ed5efbd7cde637c130185d9fd9d4a8ba17a79`.
Construída com servidor/worker, frontend e TypeScript 7.0.2, sem push ou deploy.

Primeira rodada: fixture `se7e_persona_c64d9346087a_test`, dois testes aprovados,
sem omissões, em **53,83 segundos**. Inventários estáveis de 14:50:48 a 14:51:43 UTC.
O treinamento de cada motor foi salvo/recarregado, publicado e renomeado só no
rascunho. Tokens/consultas continuaram apresentando nome e revisão publicados.

Reforço: fixture nova `se7e_persona_5069849e2f46_test`, mesma imagem, dois testes
aprovados, sem omissões, em **43,20 segundos**, de **14:52:58 a 14:53:43 UTC**.
Além do nome, o SQL do rascunho foi alterado para retornar vazio e salvo sem
republicar. O modelo publicado continuou retornando o valor sintético conhecido
nos três motores, pela cadeia MCP → hub Prisma → agente → banco. Isso distingue
execução do SQL publicado da execução indevida do modelo editado.

| Projeto | Commit-base                                | SHA-256 do snapshot do reforço                                     | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `f3d4575b3febe8303ce871c4ea271b6034bd1c9e22a52ade70ffcab2c139249d` | 1111     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `f88b767542d8e51be17771e3ab7d77c2059fc263acab7350f20d47dea158f61c` | 2716     |

Os inventários antes/depois ficaram iguais. A primeira rodada teve snapshot MCP
`9b147b24f8953708517934a6d3f72b2c20cbdc74485b863e55f050c7a43f8acb`;
o reforço acrescentou o SQL diferente somente no helper de teste. Não confundir
commit-base com o snapshot local nem certificar edições posteriores por esta prova.

As sessões confirmaram parada limpa de servidor/worker e companions. Somente as
fixtures próprias foram removidas; não ficou sessão humana aberta. A cobertura
de tokens distintos, retirada de concessão e logout da
[rodada anterior](2026-10-23-manual-training-guidance.md) também foi executada,
pois usa o mesmo helper. Não somar as contagens como casos distintos.

## Limites

Nenhuma migration ou contrato de autoridade foi alterado. A API administrativa
existente foi reutilizada; a releitura não executa SQL de negócio. A evidência
não executou os 79 cenários integrais, não é avaliação da IA ou aceite humano,
e não encerra gates. HTTPS/ChatGPT permanecem manuais; deploy segue bloqueado.
