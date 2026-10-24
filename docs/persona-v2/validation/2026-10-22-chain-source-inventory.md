# Inventário dos checkouts e revisão das pendências — 2026-10-22

## Lacuna e implementação

O runner verificava o contrato revisado do hub antes dos testes, mas não
registrava automaticamente os bytes dos três checkouts nem reconferia mudanças
ao encerrar. Capturas manuais anteriores não preenchiam essa lacuna do runner.

`scripts/run-persona-chain-homologation.ps1` agora usa
`scripts/persona-chain-sources.mjs` antes/depois: revisão Git, hash de inventário
e contagem para MCP, hub e agente. Recusa mudanças, falha de captura ou registros
incompletos; conserva resultado de teste não zero. Arquivo novo na cache local e
stdout contêm somente metadados, sem ler manifesto privado ou `.env` ignorado.
Nenhum index, contrato do hub ou arquivo do agente é alterado.

O helper `scripts/checkout-snapshot.mjs` também sustenta a captura de release MCP,
preservando algoritmo, exclusões e contrato v2. O manifesto continua bloqueado e
nenhum registro de aceite foi criado. A imagem não foi reconstruída: o runtime
da aplicação não mudou nesta tarefa.

## Revisão do plano

Removidas do topo do plano cronologias duplicadas que já estão no índice de
validações. Corrigida a menção a concorrência do cofre como implementação ausente
e a indicação de histórico entre versões como não entregue. Administração de
integrações já possui serviços, transporte e rodadas persistentes; os itens
genéricos foram substituídos por homologação concorrente e exigência de localizar
um caminho concreto antes de declarar nova lacuna funcional.

Não delegar curadoria humana ou aprovação de efeitos para cumprir uma pendência
genérica. Permanecem instalação completa, condições operacionais não cobertas,
matriz ampliada, avaliação da IA, HTTPS/ChatGPT manuais e aceite dos treze gates.

## Validação e limites

Regressões de inventário e integridade de release: **31 testes em três suítes
aprovados**, em repositórios temporários próprios. Incluem alterações nos três
projetos sem novo commit, arquivos novos/removidos, commit-base diferente,
checkouts repetidos/aninhados, junctions, destino externo, sobrescrita e falha
dos testes com fontes estáveis. Conferem também o index inalterado e a ausência
de conteúdo ignorado no log. O sandbox impediu criar `.git/config`; a repetição
autorizada fora dele passou.

Rodada dirigida real: **três inspeções aprovadas, 76 cenários fora do filtro**,
com `Persistence prisma`, imagem candidata existente e agentes reais dos três
motores. Início 13:42:13 (America/Cuiaba), duração do executor 118,01 segundos.
O runner terminou com código zero e `unchanged:true` nos três checkouts; a
fixture foi removida pelo controlador. Log local:
`node_modules/.cache/persona-chain-source-inventory.log`.
Registro local:
`node_modules/.cache/persona-chain-sources-c0d1db82c42248ff83543f385b6a90d5.json`.

| Projeto | Commit-base                                | Inventário SHA-256                                                 | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `75262e49e1dba16909bcb16910bc4e3ac84361dc2bf2328f232ef644d39b27fa` | 1089     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` | 1024     |
| Agente  | `3b4f099e64a319a100cd93e00667ffca4afef732` | `0012016cf476b9eaf798970ee964427551feb8ef4e64cfd98d724fd30d6330a9` | 2667     |

Imagem exercitada:
`sha256:7a7114587a37ecdb91577ec13d4122a87150931a2e6872a706c1e517bf4f8a21`.
Versões observadas por RPC: PostgreSQL `17.0.11`, SQL Server `16.00.4236`, SQL
Anywhere `16.00.0000`. Não são um novo inventário de drivers instalados.

Node 24.21.0, TypeScript 7.0.2 real, typecheck, build, lint completo, formatação dos
arquivos tratados e parser PowerShell passaram. `docs:check`: 256 documentos,
19 rules, 93 exemplos JSON, 24 exemplos de schema, treze gates e zero problemas.
O verificador de release continua retornando recusa, com `ready:false` e nenhum
gate concluído. O restante dos testes da cadeia não foi executado nesta rodada
dirigida; mantém sua evidência histórica própria.

Comparar duas capturas não detecta necessariamente alteração transitória revertida,
não inventaria arquivos ignorados nem comprova os binários instalados. Inventário
estável com filtro não é homologação integral. Não foi repetida a matriz de 79
casos apenas para aumentar contagem ou revalidar funcionalidades inalteradas.
