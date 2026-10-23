# Casos e publicação pelo console com CLI real — 2026-10-23

## Escopo e resultado

Dois percursos independentes passaram pelo Chromium e pela cadeia persistente
MCP → hub → agente → PostgreSQL, SQL Server e SQL Anywhere. Cada um começou
com controle vazio e fixture privada nova. Não são testes humanos ou avaliação
da IA. A instalação Windows com UAC tem [evidência separada](2026-10-23-installed-fixture-handoff.md).

| Rodada               | Fixture                          | UTC               | Resultado                   |
| -------------------- | -------------------------------- | ----------------- | --------------------------- |
| `manual-publication` | `se7e_persona_246a2fe3b890_test` | 15:42:49–15:43:34 | 2 testes aprovados, 40,08 s |
| `manual-training`    | `se7e_persona_b31c8ef82892_test` | 15:44:28–15:45:13 | 2 testes aprovados, 43,86 s |

Os totais incluem a guarda de ACL em ambas as rodadas; não representam quatro
cenários distintos. Os três CLIs de publicação devolveram `approved:true` na
revisão 2. O navegador verificou recusa antes do relatório, leitura da aprovação,
revisão humana simulada, publicação e relatório obsoleto após mudar o caso.
O baseline confirmou consulta, vazio, escrita recusada, tokens com concessões
distintas, recusa MCP direta, retirada de concessão, consumidor independente e
logout sem conteúdo persistido.

O caso de publicação usa `publication_orders` com dados sintéticos tipados.
O operador registra pela API administrativa uma fonte exclusiva `test`, distinta
da fonte pretendida criada no console. O CLI é processo separado; nenhum endpoint
executa ou aprova testes. As cotas reais não foram ampliadas/desativadas e nenhuma
falha de SQL foi repetida automaticamente.

## Candidato e inventários

Imagem local `se7e-persona-v2:manual-reload-20261023`, ID
`sha256:5eab394d06a21e7cb63b1b53178ed5efbd7cde637c130185d9fd9d4a8ba17a79`.
Servidor/worker usam essa imagem; Chromium e CLI usam o checkout do operador.
O novo diagnóstico do CLI não está, por inferência, incorporado naquela imagem.

Inventários idênticos antes/depois de cada rodada:

| Projeto | Commit-base                                | SHA-256 do snapshot local                                          | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `063045e7b81eeb4cedf4deb0866e1ebc8c49c2a7e1dfa7e3c0aa739441c726ee` | 1114     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

Snapshots incluem alterações locais; não são commits publicados. O contrato do
hub foi conferido pelo runner. Ambiente: Windows atual, Node 24 do projeto,
TypeScript 7 real, Prisma/PostgreSQL persistente no hub, companions com cofre de
fixture e drivers nativos. PostgreSQL 17 e SQL Server 2022 em contêineres locais;
SQL Anywhere 16 e driver PostgreSQL privados. Esta rodada não recertifica o
aplicativo instalado nem substitui a matriz ampliada de versões/drivers.

## Falhas preservadas e correções

- `6cb678c366c0`: seletor de tipo no formulário não identificava o combobox.
  Corrigido por papel/nome acessível. Regressão dirigida passou em 8,4 s até a
  fronteira do operador; esse teste não aprova execução técnica.
- `384750336b24`: CLI recusou a rodada; diagnóstico antigo não informava origem.
- `c884442a6e30` e `f1c380f2e5f4`: CLI recusou com `RATE_LIMITED`. Esperar 60 s
  antes do lote não resolveu. Esses registros não identificam definitivamente
  qual limitador respondeu. Não houve retry na mesma fixture.

Separar os percursos preservou ambas as coberturas em fixtures novas. O diagnóstico
do CLI agora informa somente código, origem enumerada e prazo limitado quando
disponíveis, nunca mensagem, detalhes ou stack upstream. Mantém
`repeatAllowed:false`; prazo de cota não autoriza repetir efeito incerto.

## Verificações e limpeza

Tipos, lint dirigido e build passaram. Quinze testes unitários de diagnóstico e
onboarding passaram; uma execução anterior encontrou ENOENT no cache SSR do
temporário do sandbox e foi repetida fora dele, sem mudar requisitos. Os testes
negativos de ambos os modos recusam ausência de imagem/autoridade persistente.

Os controladores registraram parada bem-sucedida de servidor/worker/companions.
As seis fixtures acima foram removidas pelo procedimento com escopo e propriedade
verificados; nenhum recurso operacional foi utilizado. Registros de inventário
permanecem locais, sem segredos. A limpeza não reutiliza identidades ou receipts.

HTTPS e instalação/conversa no ChatGPT continuam manuais. Não houve commit,
push, publicação de imagem ou deploy. Manifesto conserva `ready:false` e nenhum
dos treze gates foi promovido. Operações/cruzamentos, avaliação humana/IA e aceite
integral permanecem sujeitos à [matriz de aceite](../acceptance.md).
