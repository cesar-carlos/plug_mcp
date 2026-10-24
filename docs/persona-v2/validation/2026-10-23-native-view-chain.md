# Views regulares na cadeia persistente — 2026-10-23

## Escopo

Três novos cenários reutilizam as fixtures nativas `wide_15` (view autorizada) e
`wide_hidden` (view sem regra de leitura). Nenhum código, policy ou contrato do
agente/hub foi alterado. O companion já cria esses objetos somente depois de
confirmar sua base privada; não foi introduzido SQL de setup livre ou DDL de negócio.

Cada cenário passa por MCP → hub Prisma → agente → motor e verifica:

- Inspeção da view com schema exato, `sourceSchema` e identidade física vigente.
- Publicação privada explícita como view, leitura do contexto e concessão do token.
- Três páginas de uma linha: os dois registros sintéticos e uma página vazia,
  com parâmetros separados, identidade da publicação e proveniência.
- A mesma view declarada como tabela é recusada pela policy técnica.
- A view sem concessão técnica é recusada mesmo com skill/token MCP explícitos.
- As duas recusas não acrescentam `sql.execute` no observador de metadados.

Não comprova snapshot distribuído, total global, views materializadas/indexadas,
sinônimos, constraints herdadas ou toda a gramática dos três motores.

## Rodadas e correção do preparo

1. Fixture `se7e_persona_518d7b278213_test`, 16:50:31–16:51:00 UTC: **3 casos
   selecionados passaram**, 27,53 s. A coleta de versões dependia de outro caso
   fora do filtro e registrou null. Preservar essa limitação; não inventar versões.
2. Fixture nova `se7e_persona_5832f3205318_test`, 16:53:36–16:54:05 UTC: inspeção
   incluída, **2 passaram e 1 falhou**. O teste solicitava `dba` no SQL Anywhere,
   enquanto o catálogo retorna `DBA`; o recurso ficou `unavailable` e sem colunas.
   A consulta paginada já passara, mas isso não substitui prova de metadados.
3. Fixture nova `se7e_persona_e61120bbe5f3_test`, **16:57:36–16:58:06 UTC**:
   **3 casos selecionados passaram em 29,61 s**. O preparo usa `DBA` na inspeção e
   conserva teste negativo com `dba`. O identificador SQL não citado continua
   conforme a gramática do dialeto; a evidência de catálogo não é reescrita.

Não houve correção de produto ou flexibilização de nomes/constraints para obter
sucesso. O console já preenche `DBA` no SQL Anywhere. A última rodada confirma a
recusa segura do schema divergente e a prova disponível com o nome exato.

O comando usou `-TestNamePattern 'view nativa consulta e pagina'`. A suíte agora
contém 82 casos: **79 ficaram fora desse filtro**, não foram omitidos por falta de
motor. Esta rodada não é uma aprovação integral de 82 casos nem se soma à
[consolidação anterior de 79](2026-10-23-training-candidate-consolidated.md).

## Candidato e evidência final

Imagem local `se7e-persona-v2:manual-views-20261023`, ID
`sha256:a7ee30b84741bed41642896d19bf365b4a154bff278f6f3aa940f60a6539ea1f`.
Versões recebidas na identidade nativa: PostgreSQL `17.0.11`, SQL Server
`16.00.4236`, SQL Anywhere `16.00.0000`, preservadas como retornadas.

Inventários inicial/final idênticos, `testExitCode:0`, `unchanged:true`,
`result:passed`, `authorizesRelease:false`:

| Projeto | Commit-base                                | Snapshot SHA-256                                                   | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `50ccf9a1c555f551d77f42b1674205a0e809f694ea877c42535e9b9fb8d01f0e` | 1115     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

Snapshots locais não são commits publicados. Ambiente Windows, Node 24 do projeto,
TypeScript 7 real, hub/controle persistentes, companions com cofre privado e drivers
nativos. Não recertifica o agente instalado ou a matriz de versões de drivers.
Lint dirigido e tipos passaram. A imagem não precisou ser reconstruída: as
alterações foram nos cenários e na coleta de versões, sem mudança do runtime.

## Limpeza e limites

As três rodadas terminaram antes de qualquer repetição. Seus recursos exclusivos
foram removidos pelo procedimento com verificação de escopo/propriedade. Nenhuma
base operacional foi utilizada. A rodada falha não foi repetida na mesma fixture
e não houve reenvio automático de SQL para reparar evidência.

O [editor tabela/view](2026-10-23-query-view-editor.md) tem sua prova Chromium
separada; cadastro/publicação deste recorte usam a API administrativa real de
fixture. Não é execução humana do treinamento ou avaliação da IA.
HTTPS/ChatGPT e a matriz ampliada permanecem pendentes. `ready:false`, treze gates
sem aceite, sem commit, push, publicação de imagem ou deploy.
