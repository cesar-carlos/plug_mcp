# Evidências verificáveis de liberação

Desde DV2-015 (2026-10-24), validação manual real de HTTPS/ChatGPT e aceite
funcional humano estão dispensados, não aprovados. Essa decisão prevalece sobre
menções anteriores a esses requisitos. Nenhum teste técnico ou gate é dispensado.
O campo `approval.status` aceita também `technically_verified`, com `reviewer`
identificando o verificador técnico, `reviewedAt` e `record` com hash obrigatórios.
Esse registro não declara uma revisão humana. Falhas e omissões técnicas continuam
bloqueando. Aprovações humanas de operações de negócio permanecem obrigatórias.

O comando `npm run persona:release-check` exige os treze gates canônicos,
`ready: true` e evidências íntegras do candidato. O manifesto atual continua
bloqueado. Não criar registros de aceite a partir de resultados históricos ou
preencher o manifesto para contornar pendências.

## Identificação do candidato

`node scripts/check-persona-release.mjs --candidate` somente lê o checkout e
retorna `mcpRevision`, `sourceSha256`, `fileCount` e `authorizesRelease: false`.
Não modifica o index, cria commit ou autoriza distribuição.

O inventário usa caminhos rastreados e não ignorados do Git, inclusive alterações
locais e arquivos novos; exclui arquivos rastreados removidos. Cada entrada fixa
caminho, SHA-256 dos bytes e tamanho. A lista é ordenada e seu JSON é resumido em
SHA-256. Links simbólicos/junctions e arquivos acima de 32 MiB são recusados.
Há teto de vinte mil caminhos. Não abrir arquivos de ambiente ignorados para
compor evidência nem incluir segredos nos relatórios.

Exclusões para evitar circularidade: `contracts/persona-v2-release.json`,
`docs/persona-v2/release-evidence/` e relatórios históricos em
`docs/persona-v2/validation/`. Todo código, contrato e configuração distribuídos
devem permanecer fora desses diretórios de evidência. Arquivos ignorados não são
certificados pelo inventário; a imagem final ainda precisa de homologação própria.
Finais de linha fazem parte dos bytes: gerar o inventário no checkout do candidato
efetivamente testado, sem presumir equivalência Windows/Linux.

O runner da [cadeia persistente](homologation-chain.md) reutiliza a mesma captura
para registrar MCP, hub e agente antes/depois dos testes. Esses registros locais
incluem alterações ainda não commitadas, mas não promovem referências remotas a
evidências aceitas e não modificam o contrato de evidência v2 abaixo. O hash MCP
mantém o mesmo algoritmo e exclusões; o helper compartilhado evita divergência
entre a captura local de release e o inventário da homologação.

## Contrato de evidência v2

Além dos campos existentes, um manifesto pronto exige:

- `evidenceVersion`: inteiro `2`.
- `candidate`: `mcpRevision`, `hubRevision` e `agentRevision` como commits de
  quarenta caracteres hexadecimais, e `sourceSha256` com sessenta e quatro.
  Também fixa `imageId` (ID imutável informado pelo Docker), `imageRevision` (commit de build),
  `imagePlatform` (`linux/amd64`) e `imageRuntime` (`persona-v2-candidate`).
  A origem fixa `imageRunId`, `imageArtifactId` (inteiros positivos seguros) e
  `imageArtifactDigest` (SHA-256 do artefato GitHub, sem prefixo).
- `evidence`: um objeto com exatamente uma referência por gate obrigatório.

Referência é `{path, sha256}`. O caminho relativo deve estar sob
`docs/persona-v2/release-evidence/`, sem travessia, link ou arquivo vazio. O hash
confere os bytes completos. Cada gate utiliza um relatório próprio.

Cada relatório JSON exige:

| Campo                       | Conteúdo                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `schemaVersion`             | `2`                                                                                     |
| `gate`                      | Identificador canônico correspondente                                                   |
| `candidate`                 | Os mesmos onze identificadores do manifesto                                             |
| `coverage` / `result`       | `complete` / `passed`                                                                   |
| `startedAt` / `completedAt` | Datas UTC válidas, ordenadas e não futuras                                              |
| `environment`               | `description` e mapa `versions` não vazios                                              |
| `checks`                    | De uma a dez mil verificações com `id` único, `result: passed` e referência `artifact`  |
| `omissions`                 | Lista vazia                                                                             |
| `approval`                  | `status: accepted`, `reviewer`, `reviewedAt` posterior à execução e referência `record` |

Artefatos e registro de aceite são conferidos por hash; não conter SQL operacional,
credenciais, perguntas, parâmetros ou resultados privados. O relatório e o registro
de revisão devem explicar o alcance realmente homologado, inclusive procedimentos
manuais, versões dos motores/drivers, omissões e limpeza. Havendo omissão exigida
pelo gate, manter seu aceite pendente em vez de fabricar cobertura integral.

O commit MCP declarado deve ser ancestral do checkout atual, cujos bytes precisam
coincidir com o hash aceito. Isso permite um commit posterior somente com provas,
sem aceitar mudanças de código. Em CI, `GITHUB_SHA` deve coincidir com HEAD; no
workflow de deploy disparado por `workflow_run`, `PERSONA_V2_RELEASE_REVISION`
fixa explicitamente o `head_sha` da rodada aprovada. O checkout precisa do
histórico para verificar ancestralidade.

## Imagem testada no CI

O job de publicação depende de todos os jobs de verificação, incluindo as duas
arquiteturas. A imagem amd64 testada é exportada uma vez e armazenada como artefato
da rodada, com SHA-256 do arquivo, tamanho, revisão, plataforma, runtime e ID da
imagem. `scripts/tested-image.mjs` recusa inconsistências antes e depois da carga.
Publicação e deploy não reconstruem a imagem. Publicação e deploy baixam pelo ID imutável aceito, cuja origem é verificada; não resolvem novamente uma tag do registro.

O artefato tem retenção de sete dias; ausência ou expiração bloqueia o envio,
sem fallback para reconstrução ou outra rodada. Erro ao descobrir alterações
também bloqueia, sem ser convertido em ausência de mudanças. O manifesto de
liberação continua obrigatório antes da publicação e do envio ao servidor.
O runtime padrão permanece legado até o corte aprovado.

## Limites e trabalho restante

O verificador confere integridade, associação e presença de aceite. Não autentica
uma pessoa pelo texto de `reviewer`, avalia a suficiência semântica dos casos nem
executa novamente os três projetos. A revisão humana autorizada e a proteção do
fluxo de publicação continuam obrigatórias. Commits do hub/agente nos relatórios
são referências, não comprovação automática dos checkouts remotos ou da instalação.

A associação do ID imutável da imagem aos gates está implementada localmente. A execução
efetiva destes workflows no GitHub, a homologação instalada e o ensaio de corte
ainda precisam ser concluídos. Integridade do artefato não comprova aceite da
imagem. Esta entrega não encerra `coordinated-cutover`. HTTPS/ChatGPT continuam
para validação manual. Ver [aceite](acceptance.md) e [plano restante](remaining-plan.md).

## Conferência da imagem aceita

Após verificar o arquivo, carregar a imagem e conferir o ID/runtime pelo Docker,
CI e deploy executam `check-persona-release.mjs --image-proof <arquivo>`.
Essa opção repete o aceite integral e compara ID, revisão de build, plataforma e
runtime com todos os relatórios v2. Imagem legada ou diferente é recusada antes
de publicar ou enviar ao servidor. Provas v1 não são promovidas automaticamente.

O ID Docker é a identidade exposta por docker image inspect; seu significado interno pode variar com o armazenamento do Docker. Não presumir equivalência com o digest publicado no registro. O arquivo exportado tem hash próprio, conferido por tested-image.mjs;
não é necessário fixar seus bytes em todos os gates. O ID carregado continua
obrigatoriamente igual ao ID aceito. O comando com --image-proof isoladamente
não substitui a verificação do arquivo e a inspeção Docker anteriores.

O commit de build deve ser ancestral do checkout. O fluxo usa a revisão de build aceita para conferir o artefato e a revisão atual para conferir o aceite. Um commit posterior de provas não autoriza reconstruir e presumir a mesma imagem. A promoção foi implementada; execução real no GitHub e ensaio instalado permanecem pendentes. Nenhum registro de aceite foi criado.

## Origem imutável e promoção entre rodadas

`accepted-image-origin.mjs` lê do manifesto os IDs aceitos e consulta a API GitHub
pelo `gh` autenticado do workflow. Exige mesmo repositório/origem (sem fork), push
em main, `.github/workflows/ci.yml`, commit de build exato e rodada concluída com
sucesso. Confere ID/nome/digest e ausência de expiração do artefato, além do vínculo
a essa rodada e commit. Falha de API, campo ausente ou divergência bloqueia; não
seleciona a rodada mais recente nem busca artefato por nome como fallback.

As saídas contêm somente IDs e revisão validados. Download usa artifact-ids,
run-id e repositório explícitos. `PERSONA_V2_IMAGE_REVISION` separa a revisão da
imagem aceita da revisão do commit atual de aceite; só orienta o verificador do
artefato e não substitui o aceite de todos os gates. A verificação posterior de
imagem carregada contra o manifesto continua obrigatória.

Uma rodada ainda em execução não pode ser a origem aprovada. A imagem deve ter
uma rodada anterior bem-sucedida e evidência real antes da promoção; o fluxo não
transforma rodada falha, incompleta ou imagem legada em candidata aceita. O CI tem produtor v2 separado, com ensaio empacotado antes de exportar. A execução real dessa rodada e seu aceite ainda são pendentes. Não preencher IDs fictícios para liberar o pipeline.

## Rodada produtora v2

O job persona-v2-candidate usa alvo Docker explícito, executa o ensaio de
migrations/servidor/worker em recursos descartáveis e somente depois exporta
persona-v2-tested-image-amd64. Sem permissões de packages:write, login ou push.
O artefato é privado da rodada, retido por sete dias. A matriz legada continua
separada; seu artefato não é aceito como origem v2.

Quando ready não é true, o job de publicação não tenta publicar produção. Isso
permite uma rodada produtora terminar com sucesso e ser avaliada posteriormente,
sem transformar CI verde em aceite. Após ready:true, todos os verifiers e os
gates completos continuam obrigatórios. Deploy conserva sua recusa independente.
