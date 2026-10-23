# Referência aprovada do hub — 2026-10-16

Evidência de desenvolvimento para corrigir a referência coordenada do hub.
MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais
preservadas; não representa candidato integral nem release. `ready: false`,
treze gates obrigatórios e nenhum concluído permanecem inalterados.

## Revisão upstream

Referência anterior: `693da92a334c98ae911c329d52006456ce768b09`.
Referência aprovada: `e8f56db8e0205b94b99b5ac7dabd41655f4fd2c0`, confirmada
como HEAD do checkout limpo do hub.

Foram revisados os dez arquivos alterados entre esses commits: comparação REST,
coordenação dos workers, amostras e relatórios, testes e configuração de CI.
Não houve alteração em `src`, `schemas`, `contracts`, dependências, Dockerfile
ou requisito Node. Os ensaios usam perfis fixos de amostras e GC controlado;
essa medição não certifica desempenho ou configuração de produção.

Consulta autenticada ao GitHub confirmou conclusão `success` no SHA aprovado:

- [CI 38815943999](https://github.com/cesar-carlos/plug_server/actions/runs/38815943999):
  jobs Test, Static, Socket bench, REST bench, Dart contract e Required aprovados.
- [CodeQL 38815943955](https://github.com/cesar-carlos/plug_server/actions/runs/38815943955):
  análise concluída com sucesso.

A referência anterior e a base histórica
`bfb40becd42c5452b19b0df13698d212a0238ddc` são ancestrais do novo commit.
`git apply --reverse --check` confirmou incorporação do snapshot, sem aplicar
patch ou modificar o hub. Falhas e medições anteriores permanecem históricas;
não foram removidas ou reinterpretadas como aprovação.

## Integridade e alteração

`HUB_CONTRACT_REF` e o checkout do CI foram atualizados juntos. O verificador
continua exigindo HEAD exato, ancestralidade, hash do patch e bytes commitados.
Não houve regeneração de contrato, baseline, snapshot ou migration.

| Material                                                             | SHA-256                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Contrato MCP, contrato no checkout do hub e bytes do commit aprovado | `a8e8bc82a9b6d995c8637bf47bc35e17d44c5b21aba60889be25654ac60f4e60` |
| Snapshot histórico preservado                                        | `7f1b746a782b5023aed562cb40edbf72dbe39a15498fcba2e36a949604aa1948` |
| Base comum derivada após atualizar a referência                      | `32730d3502b2f62b51c9ac9a178f62f97dd5024a21edc650c224c54862eaa7e5` |

O hash derivado identifica a nova referência; não reescreve publicações,
casos ou relatórios persistidos e não transfere identidade ou autoridade entre
legado e v2.

## Verificações locais

Runtime Node 24.21.0 e compilador TypeScript 7.0.2 reais, pelo wrapper do projeto.

- `training:check`: aprovado contra o checkout no SHA exato.
- Testes de pin e evolução da base: **23/23** aprovados. Os quatro casos de
  integração de curadoria exigem `DATABASE_URL` e não foram executados nesta
  rodada; não constituem evidência persistente.
- Tipos, lint e build do servidor: aprovados.
- Formatação dos arquivos desta alteração e `docs:check`: aprovados.
- `persona:release-check`: recusou a liberação como esperado; manifesto mantido.

A primeira tentativa dos testes foi interrompida por `ENOENT` nos arquivos
temporários do Vitest dentro do isolamento Windows. A repetição autorizada
fora desse isolamento produziu o resultado acima; o erro inicial não foi
tratado como aprovação. Nenhum banco, container ou fonte operacional foi usado.

## Limites e continuidade

Esta rodada revisa a referência e restaura o check, sem executar a cadeia
persistente dos três motores, UI, instalação do plugin ou avaliação da IA.
HTTPS público e conexão ChatGPT seguem para validação manual por decisão do
responsável. Deploy e publicação de imagens permanecem bloqueados.

Continuidade: [plano restante](../remaining-plan.md),
[matriz de aceite](../acceptance.md) e [contrato de homologação](../homologation-chain.md).
