# Preparação SQL adaptável e confirmação perdida — 2026-10-19

## Resultado

Rodada final: dois cenários Chromium aprovados em 14,5 segundos, viewport
390 × 844. Modos somente_parametros e sql_adaptavel percorrem edição, casos,
runner separado, publicação, emissão de token e preparação pelo consumidor.

O modo adaptável cadastra pelo editor um caso positivo com SQL treinado e um
negativo sem WHERE, esperado INVALID_PLAN. O runner PostgreSQL isolado aprova
somente após verificar os casos. A primeira rodada reprovou corretamente o
modo adaptável por ausência desses casos obrigatórios (um cenário passou e um
falhou); o teste foi corrigido sem relaxar o serviço ou a regra de publicação.

O formulário adaptável envia SQL por etapa; somente parâmetros não oferece esse
campo. A publicação ativa é preservada após edição concorrente de rascunho.
Ambos os modos criam uma preparação com confirmação explícita. Na segunda
preparação, a interceptação encaminha a chamada ao servidor, aguarda a resposta
e aborta apenas sua entrega ao navegador. O console apresenta aviso de
confirmação perdida e bloqueia nova submissão. A persistência contém exatamente
duas preparações por persona, ambas aprovacao_pendente, na publicação correta,
sem comprovante. São duas tentativas humanas distintas, sem retry automático.
As ferramentas de execução não são chamadas. Nenhuma operação de negócio é
disparada pela preparação; o DML do runner usa somente seu banco de fixture.

## Ambiente e revisão

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais;
[hash do teste](2026-10-19-sql-preparation-expanded-files.json).
Node 24.21.0, TypeScript 7.0.2, PostgreSQL 17 Alpine dedicado, hub sintético,
Chromium do Playwright do projeto. Tipos backend e lint do teste passaram.
O servidor encerrou normalmente; contêiner/volume da rodada foram removidos
após conferir ID e rótulo. Sem fontes, credenciais ou bases operacionais.

## Limites

Não certifica a cadeia instalada dos três motores, aprovação/execução real,
recuperação distribuída, acessibilidade integral, HTTPS/ChatGPT ou avaliação da IA.
Complementa a rodada de preparação SQL, sem alterar seus hashes históricos.
Nenhuma mudança nos contratos públicos do hub. Deploy continua bloqueado,
ready:false e nenhum gate encerrado. HTTPS/ChatGPT permanecem manuais.
