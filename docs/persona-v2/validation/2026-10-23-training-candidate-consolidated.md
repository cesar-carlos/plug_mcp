# Consolidação do candidato de treinamento — 2026-10-23

## Candidato e alcance

Imagem local `se7e-persona-v2:manual-parameters-final-20261023`, ID
`sha256:0691edb6814f92595247e844b6e558a1b417f0f9c69f6084aae9f083f629e6f4`.
Reúne as correções de releitura, caminho N:N e parâmetros documentadas nas
[rodadas anteriores](../validation.md). A imagem não foi publicada.

Esta rodada amplia a evidência técnica para o [roteiro de treinamento manual](../onboarding.md#roteiro-de-teste-manual-do-treinamento).
Não é um ensaio humano, avaliação da IA ou aceite de produção. HTTPS e conexão
ChatGPT permanecem manuais. Não foi deixada sessão com prazo correndo à espera
do usuário: iniciar o [procedimento local](../homologation-chain.md#sessão-contínua-para-treinamento-manual)
com fixture nova e seleção explícita da imagem quando o ensaio for realizado.

## Verificações concluídas

| Verificação              | Resultado e limites                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `release:check`          | Zero; Node 24.21.0, TypeScript 7.0.2, docs, contrato do hub, lint, formatação integral, tipos, testes e builds |
| Suíte geral com serviços | 182 arquivos, **1.691 testes aprovados**, sem omissões, 142,93 s                                               |
| Frontend                 | 22 arquivos, **86 testes aprovados**, com lint/tipos/build                                                     |
| PostgreSQL v2            | 21 arquivos, **328 testes aprovados**, 238,25 s                                                                |
| Redis v2                 | **8 testes aprovados**, 1,20 s, namespace próprio                                                              |
| Chromium final           | **60 percursos aprovados**, 5,7 min, sem reconstrução concorrente de `web/dist`                                |
| Cadeia persistente       | **79 cenários aprovados**, sem filtro/omissões, 702,22 s                                                       |

Os totais têm escopos diferentes e podem compartilhar helpers; não somar como
uma medida de cobertura independente. A suíte geral exclui a integração v2 e
a cadeia, que foram executadas pelos comandos específicos acima.

`release:check` inicialmente parou na formatação do relatório de instalação com
UAC. Só a formatação foi corrigida, sem alterar a evidência. A fixture inicial
`se7e_gates_85c76a984e6f_ci` foi limpa. A repetição completa com serviços novos,
`se7e_gates_2e2bf480f84c_ci`, passou sem dispensar PostgreSQL/Redis ou reduzir gates.

A primeira rodada Chromium também passou nos sessenta casos, mas coincidiu com
o build executado pelo gate geral. Não foi usada como prova final de artefato
estável. Após o encerramento daquele build, o frontend foi construído novamente
e os sessenta testes repetidos sem reconstrução concorrente. Não somar as duas
rodadas como 120 cenários distintos. Os avisos conhecidos do SDK, de anotação de
dependências e de tamanho do bundle não foram ocultados ou convertidos em aceite.

## Isolamento

A suíte geral usou PostgreSQL/Redis exclusivos com nomes `se7e_*ci`, senha
aleatória em ambiente do processo e rótulos de propriedade. As migrations
legadas foram aplicadas somente nesse banco legado descartável. Nenhuma tabela,
credencial ou migration foi transferida para a geração v2.

Imagens dos serviços gerais: PostgreSQL `pgvector/pgvector:pg16`, ID
`sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b`,
com `PG_VERSION=16.15-1.pgdg12+2` declarado na imagem; Redis `redis:7-alpine`, ID
`sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99`,
`REDIS_VERSION=7.4.9`. Essas versões foram lidas das imagens, após a limpeza dos
containers, não de uma consulta remota operacional.

Console e suítes v2 usaram a fixture privada `se7e_persona_264b1849825e_test`.
Cada suite criou e removeu seus bancos filhos; Redis permaneceu exclusivo da
fixture, com namespaces próprios. O hub do Chromium é sintético: essa rodada
não substitui a cadeia persistente abaixo. Não houve consulta a dados de negócio.

## Cadeia real completa

Fixture nova `se7e_persona_48becaf1459f_test`, modo Prisma, imagem candidata exata,
de **16:19:06 a 16:30:50 UTC**. Runtime MCP e worker em container, hub PostgreSQL
persistente, companions com cofre próprio e motores dedicados. Testes em
sequência conservam as guardas, limites e proteção contra reenvio incerto.

Versões informadas pela fixture, preservadas sem reinterpretar sua notação:
PostgreSQL `17.0.11`, SQL Server `16.00.4236`, SQL Anywhere `16.00.0000`.
A rodada usa drivers nativos privados; não recertifica toda a matriz de versões
de drivers, motores ou o aplicativo operacional instalado.

Os cenários incluem persona, fontes, treinamento/publicação, parâmetro inteiro
declarado no console, tokens e consultas, curadoria/compatibilidade, cruzamentos,
lançamentos, recuperação, integrações, OAuth, cache e anexos conforme o alcance
da suíte. A aprovação técnica de casos não aprova significado comercial.

Inventários antes/depois idênticos, `testExitCode:0`, `unchanged:true`,
`result:passed` e `authorizesRelease:false`:

| Projeto | Commit-base                                | Snapshot SHA-256                                                   | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `78fa215a5ac9621cea4be2eab5d4a58d31b86cc41bd29ece8fb3cb2cac31f6e9` | 1115     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

São snapshots locais, não commits novos. O inventário identifica os checkouts;
o ID da imagem identifica servidor/worker. Documentação posterior da rodada não
constitui uma nova certificação de alterações de runtime.

## Limpeza e liberação

As duas fixtures de gates e as fixtures de console/cadeia foram removidas após
encerramento, por procedimentos com escopo/propriedade conferidos. A listagem
final não encontrou containers dos gates ou da cadeia. Nenhum armazenamento do
hub/agente operacional, DSN/cofre operacional ou ERP foi limpo ou convertido.

`persona:release-check` foi executado e recusou publicação com código 1, conforme
esperado. O manifesto conserva `ready:false` e nenhum dos treze gates foi
promovido. Não houve branch, commit, push, publicação ou deploy.

Permanecem as pendências do [plano restante](../remaining-plan.md): matriz ampliada,
aceite humano/IA, homologação instalada e as validações externas, entre outras.
Esta consolidação não as redefine como concluídas nem substitui o
[aceite por gate](../acceptance.md).
