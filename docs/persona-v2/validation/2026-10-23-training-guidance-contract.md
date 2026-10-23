# Orientações MCP de treinamento e histórico — 2026-10-23

## Contradições reproduzidas

As instruções v2 anunciavam `propor_contrato_externo`, mas um trecho posterior
negava a existência da descoberta/importação administrativa por tool. Outro
trecho limitava `listar_historico_conhecimento` a consultas, embora o catálogo
MCP e o serviço já admitissem também operações SQL concedidas.

As regressões falharam nesses dois pontos, com onze casos aprovados e dois
reprovados. A correção remove a negação obsoleta e orienta histórico/contexto
nos dois tipos suportados. `obter_skill` lê o contexto; `obter_padrao` conserva
seu alcance editorial de consultas. Descoberta continua condicionada à tool
anunciada, integração/versão concedidas e revalidação. A proposta não salva,
publica ou executa ações.

Nenhuma tool, schema, permissão ou política de execução mudou. Somente
`src/application/persona-v2/runtime-instructions.ts` mudou no runtime. A entrada
legada não foi editada. A v2 usa essa constante no campo `instructions` do MCP.

## Verificações

Os **13 casos** de onboarding passaram, sem filtro ou omissões, em **712 ms**,
após a correção. Preservam fatos retornados, distinção entre falha/vazio, runners
separados e contratos de paginação/schema nos três dialetos. Lint dirigido,
tipos e build passaram. Uma primeira versão da regressão usava `String.match`;
foi ajustada para `RegExp.exec` conforme o lint, sem alterar sua verificação.

Imagem adicional exclusivamente local:

- Tag: `se7e-persona-v2:manual-guidance-20261023`.
- ID: `sha256:f6e578fdc92a5cce1b7497dbb6f70444a53fc534ac88e0b401db3c14f569ff04`.
- SHA-256 da string de instruções carregada do módulo compilado:
  `af7de5e86de53882c262d211e27bc975fe21bfb1b5ddbdb0dd9145e4279413a9`.

Containers efêmeros, sem rede e com filesystem somente leitura, carregaram o
módulo das imagens anterior/atual. A nova não contém a negação obsoleta e
inclui os dois tipos de skill no histórico. Inventários completos compararam
caminhos e hashes:

| Conteúdo   | Resultado                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Frontend   | 54 arquivos idênticos; digest `37839e941929827990ae3528d0e321ef18c7c4bf97e4750c1fc33199333eca19` |
| Backend    | 1230 arquivos; 1228 idênticos                                                                    |
| Diferenças | Somente `application/persona-v2/runtime-instructions.js` e `.d.ts`                               |

A primeira comparação excluía JS/map e recusou a diferença restante. O inventário
completo identificou a declaração inferida `.d.ts`, que também contém o literal;
nenhuma diferença foi ignorada sem conferência.

Metadados locais em `node_modules/.cache/manual-guidance-scope.json` e
`manual-guidance-backend-diff.json`; não contêm credenciais ou dados de consulta.
Não houve banco, hub, agente ou DLL nesta rodada. Containers de inspeção
terminaram e foram removidos; a imagem permanece disponível localmente.

## Percurso na imagem nova

A suíte `manual-training`, sem filtro, passou **2/2 em 96,54 s** pela cadeia
persistente MCP → hub → agente em PostgreSQL, SQL Server e SQL Anywhere.
O cliente autenticado conferiu o campo `instructions` da resposta MCP
`initialize`: histórico de consultas/operações, ausência da negação obsoleta e
runners exclusivos de operador. O percurso exercitou criação, fontes, treino,
publicação, tokens independentes e consultas; não hospedou nem avaliou IA.

Janela UTC: `2026-10-23T18:41:16.990Z` a `2026-10-23T18:42:54.723Z`.
Inventários antes/depois idênticos:

| Projeto | Commit-base                                | SHA-256 do snapshot efetivo                                        | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `6dde66a408b828ac7a5302aefe2fe06125c626a79a2fe1c8c12c09d6306812ad` | 1117     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

Log local sem credenciais: `node_modules/.cache/manual-guidance-chain.log`.
A fixture privada `se7e_persona_02e37d6ccc9a_test` foi removida pelo script com
verificação de propriedade; é separada da sessão humana.

## Alcance para o ensaio manual

A imagem anterior `manual-source-switch-20261023` conserva a
[evidência dos 61 casos e dos dois percursos nos três motores](2026-10-23-query-source-knowledge-reset.md).
Esta rodada verifica as instruções compiladas e entregues pelo MCP, a identidade
dos demais arquivos e o percurso de treinamento na imagem nova. Não repetiu os
61 casos nem a suíte separada de publicação com CLI, e não mede o comportamento
de um modelo consumidor. Não reatribuir os snapshots
anteriores ao candidato novo ou ao checkout integrado de outra rodada.

O [roteiro manual](../onboarding.md#roteiro-de-teste-manual-do-treinamento) usa
sessão nova e candidato explícito. HTTPS/ChatGPT e a avaliação humana/IA continuam
manuais. Deploy/publicação de imagens seguem bloqueados, com `ready:false`.
