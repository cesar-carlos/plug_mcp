# Caminhos N:N no editor de consultas — 2026-10-23

## Lacuna e correção

O contrato de consulta e o snapshot já preservavam `id`, `via` e `path`, mas o
editor privado oferecia apenas cardinalidade e pares. Não havia como informar
intermediárias e elos no formulário, embora fosse possível selecionar N:N.
A regressão Chromium reproduziu a ausência do campo de identificação.

Consultas agora permitem identificar relações e editar/ordenar intermediárias e
elos. Novas relações recebem identificador local disponível; antigas não são
renomeadas. O mesmo componente de caminho é utilizado pelas operações SQL.
Referências pendentes são conservadas, sem remapeamento por posição ou inferência.

Persistência, parser, permissões e publicação não foram relaxados. Rascunhos
incompletos podem ser salvos; isso não os torna executáveis. A prévia valida a
sequência e não aceita JOIN direto entre as extremidades de uma associação com
intermediárias. Não houve migration ou alteração de snapshots existentes.

## Evidências

- Chromium/PostgreSQL: **2 percursos aprovados em 9,0 s**. Consulta salva e relê
  `a → ab → b`, com IDs e ordem persistidos; prévia válida é aceita, JOIN direto
  `a → b` e caminho com elo removido são recusados. O segundo percurso preserva
  chaves compostas e N:N no editor de operações, após a extração do componente.
- Frontend: **22 arquivos, 86 testes aprovados**, tipos, lint e build aprovados.
- Contrato de treinamento e caminhos: **17 testes aprovados**, em 1,65 s.
  Tipos e lint dirigido do projeto também passaram.
- Cadeia persistente: **2 testes aprovados, 46,58 s**, de 16:00:11 a 16:00:59 UTC,
  em PostgreSQL, SQL Server e SQL Anywhere. Persona vazia, cadastro pelo navegador,
  treinamento, publicação, consultas, vazio/recusa, concessões distintas, retirada
  de concessão e consumidor independente. Não houve alteração das fontes entre
  os inventários inicial/final.

A rodada Chromium usa autoridade de hub sintética e bancos PostgreSQL próprios.
Não executa o JOIN N:N nos três motores. O baseline persistente usa consultas
simples próprias: não deve ser apresentado como prova de execução desse JOIN.

Os primeiros preparos do teste foram corrigidos antes da rodada final: faltava
`kind` no cadastro, a lista do console precisava ser relida após preparação pela
API, seletores de combobox precisavam usar seu papel e o modelo precisava conter
o filtro obrigatório. A recusa semântica foi verificada na prévia, preservando
o contrato de rascunho incompleto. Essas falhas não são aprovações adicionais.

## Candidato e revisões

Imagem construída e mantida somente localmente:
`se7e-persona-v2:manual-paths-20261023`, ID
`sha256:4d13fc19e1259d689b906c85d17f2d23894a7afac1225bfb3080138b1b2a33c9`.
Build da imagem conferiu TypeScript 7.0.2 e incluiu servidor, worker e frontend.

| Projeto | Commit-base                                | Snapshot SHA-256                                                   | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `91c7e5e9cf1dbd5eef9fdea6b354e4bd76467216cd155dae32f507c08f95ba1f` | 1115     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

Snapshots locais não são commits. Ambiente Windows, Node 24 local do projeto,
hub Prisma persistente, PostgreSQL 17/SQL Server 2022 em contêineres e SQL Anywhere
16 com drivers nativos privados. Não recertifica o aplicativo instalado nem a
matriz ampliada de versões/drivers.

## Limpeza e limites

Fixture `se7e_persona_f0679316298b_test`: bancos temporários do navegador removidos
pelo teardown; servidor/worker/companions confirmaram parada limpa. Os demais
recursos exclusivos foram removidos pelo procedimento com propriedade/escopo
verificados. Nenhuma fonte operacional foi usada.

Os avisos de anotação de dependências e tamanho do bundle foram mantidos; não
houve redução de limites para ocultá-los. A imagem não foi publicada. Nenhum
commit, push ou deploy foi executado. HTTPS e ChatGPT continuam manuais;
`ready:false` e os treze gates de produção permanecem bloqueados. O roteiro para
sessão manual é o [procedimento canônico](../homologation-chain.md#sessão-contínua-para-treinamento-manual),
sempre com fixture nova e imagem escolhida explicitamente.
