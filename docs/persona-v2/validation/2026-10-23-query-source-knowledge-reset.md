# Troca de base no treinamento compartilhado — 2026-10-23

## Falha e correção

O editor de consultas alterava fonte/dialeto e reiniciava o painel estrutural,
mas conservava `sharedKnowledge` da fonte anterior. Somente edição pendente
nesse painel pedia confirmação; um vínculo já salvo não a exigia. O editor de
operações SQL já removia esse vínculo com confirmação.

A regressão Chromium reabre um rascunho com padrão/perfil físico publicados e
troca a fonte. Antes da correção falhou pela ausência de confirmação, após
cinco segundos de espera explícita. Não é prova de execução SQL indevida:
as validações do servidor continuam independentes da interface.

Depois da correção, o mesmo caso passou em **12,6 segundos**. Verifica:

- Cancelar conserva a fonte e a referência compartilhada anterior.
- Confirmar muda a fonte e remove o vínculo somente da edição local.
- Salvar conserva a fonte nova sem referência compartilhada antiga.
- A publicação ativa conserva a fonte e o perfil anteriores.

Antes de aplicar a confirmação, o componente reconfere contexto, edição,
disponibilidade da fonte e ausência de outra ação. Não transfere prova ou perfil,
traduz SQL, publica, amplia concessões ou remove treinamento do servidor.
As definições privadas conservadas precisam ser revistas para a fonte nova.

## Ambiente e alcance

Chromium com controle e dados PostgreSQL exclusivos; hub sintético do harness.
Sem chamada a bases operacionais. Cada tentativa utilizou container novo com
nome aleatório e limpeza por propriedade. Duas tentativas iniciais não
selecionaram testes por filtro incorreto; outra parou por falta de novo login
após reload, pois a sessão do console fica em memória. Esses resultados não
foram tratados como reprodução funcional. A rodada seguinte reproduziu a
ausência de confirmação; só então o componente foi corrigido.

Lint, tipos e build do console passaram. Os **86 testes** do frontend passaram
sem omissões. A primeira execução em sandbox falhou na importação de arquivos
temporários em cinco suítes; a repetição fora dessa restrição aprovou as 22
suítes sem mudar código, casos ou requisitos.

A regressão completa passou nos **61 casos**, sem filtro ou omissões, em
**6,3 minutos**. O caso existente foi ampliado, sem retirar suas verificações
anteriores ou aumentar seu prazo. A fixture `se7e_console_e61a9e51e29c_test`
foi removida após o término, assim como as tentativas dirigidas anteriores.
Log local: `node_modules/.cache/query-source-console-full.log`.

A imagem candidata local nova é
`se7e-persona-v2:manual-source-switch-20261023`, ID
`sha256:4aa76655374d642887985ad56169e346fbe9acf2dccb0654a70997e427177bc0`.
Não foi publicada.

## Percurso de treinamento pela cadeia persistente

A suíte `manual-training` passou nos **dois testes**, sem omissões, em
**69,62 segundos**, usando essa imagem. Verificou controle inicialmente vazio,
criação de persona, cadastro e treinamento pelo navegador nos três motores,
publicação, consumidores distintos e consulta parametrizada, além da parada
do servidor/worker e das guardas da sessão. O teste não deixa uma sessão humana
aberta nem executa avaliação de IA.

Rodada de 17:58:10.900 a 17:59:23.417 UTC, fixture privada
`se7e_persona_2a22c3629728_test`, removida após parada confirmada. Inventários
inicial/final idênticos, `testExitCode:0`, `unchanged:true`, `authorizesRelease:false`:

| Projeto | Commit-base                                | Snapshot SHA-256                                                   | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `9782f9e4bcdaf9e09376fd106124cf45415c82d1ad265581d8aceb2917e1fe53` | 1117     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

Log local: `node_modules/.cache/query-source-manual-training.log`. Não confundir
snapshot local com commit publicado. A documentação dos resultados foi atualizada
após a rodada e não modifica seus hashes retrospectivamente.

A [rodada de 85 casos](2026-10-23-shared-knowledge-journey-budget.md)
é anterior a esta correção e identifica sua própria imagem/snapshot; não
certifica retrospectivamente este frontend novo.

## Publicação com casos na imagem atual

O percurso adicional `manual-publication` passou nos **dois testes**, sem
omissões, em **64,13 segundos**, na mesma imagem imutável acima. A fixture
privada `se7e_persona_a398764aabaf_test` foi nova e distinta da sessão de
treinamento básico. Não houve execução concorrente sobre a DLL do agente.

Nos três motores, o navegador cadastrou caso obrigatório, confirmou recusa de
publicação sem relatório atual, leu o resultado do CLI real do operador e
publicou somente após revisão humana de fixture. Editar o caso tornou o
relatório obsoleto. O CLI usou fonte de teste explícita distinta da pretendida;
console/MCP não executaram ou aprovaram o runner. Cotas e prazos não foram ampliados.

Inventários estáveis de 18:17:05.671 a 18:18:11.737 UTC, `testExitCode:0`,
`unchanged:true`, `authorizesRelease:false`. MCP no mesmo commit-base da tabela,
snapshot `060007ba101e947f8efb63c70e9d7725b182efaf846e0f7f9f2dc7e1fcdb4906`,
1117 arquivos. Hub e agente conservaram os commits-base, hashes e contagens
da rodada anterior. Entre as rodadas mudou apenas a
[fixture de validação do plugin](2026-10-23-plugin-fixture-build-ancestor.md)
no código; runtime e imagem permaneceram iguais. A documentação dos resultados
foi atualizada depois e não reescreve esses inventários.

Após parada confirmada, a limpeza guardada removeu somente essa fixture.
Log local: `node_modules/.cache/query-source-manual-publication.log`.
Os dois percursos estão tecnicamente verificados para o
[ensaio humano local](../onboarding.md#roteiro-de-teste-manual-do-treinamento),
que precisa de sessão nova e registro separado da experiência do responsável.
Não certifica outro checkout integrado, pin do hub ou imagem posteriores.

HTTPS/ChatGPT continuam manuais. Não encerra avaliação da IA, cadeia instalada
ou os [gates de produção](../acceptance.md); o manifesto conserva `ready:false`.
