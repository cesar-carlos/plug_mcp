# Testes de rascunhos por operador SSH

Runner implantado no servidor de teste, com piloto nativo registrado abaixo.
Não registra aceite integral para clientes nem publica rascunhos por si só.

## Contrato e alcance

O responsável escolheu um runner no servidor com fixtures locais isoladas.
`persona:test-publication:ssh` abre canal privado pelos pipes do SSH, sem portas
públicas, endpoint HTTP/MCP novo ou envio de relatórios prontos. O processo remoto
executa dentro do container fixo `se7e-persona-v2-test-server-1`, com a configuração
e o cofre daquele ambiente. Exige `NODE_ENV=production`, destino `test-server`
e SHA completo igual ao pedido. Não habilita destino `clients` nem aplica migrations.

A primeira versão aceita somente skills `consulta` MSSQL com recortes vazios.
Operações, cruzamentos, outros motores e recortes diferentes são recusados;
essas extensões exigem contrato e testes próprios. Nenhuma chamada vai ao ERP.
O controle PostgreSQL remoto é usado para ler o catálogo e gravar o relatório,
nunca como base de negócio ou alvo de semeadura.

O operador remoto captura a persona/skill/fonte originais, revisão, packageHash,
casesHash e sourceFingerprint. O modo `inspect` não grava relatório nem executa
casos. `run` exige esses cinco valores exatos; divergência inicial recusa antes de
qualquer gravação ou execução. O runner existente mantém reprovação preventiva,
execução fora dos locks e revalidação antes de cada caso e da aprovação final.
O relatório permanece na persona original; não cria uma persona espelho e não
promove relatório obtido em outro catálogo.

O processo local lê somente uma sessão manual privada ainda ativa, confere ACL,
prazo, vínculo do hub e identidade nativa da base descartável. Suas credenciais
sintéticas ficam na máquina local; credenciais e chave do controle remoto ficam
no servidor. SQL de teste e sementes sintéticas passam pelo canal privado, nunca
pela saída pública, logs ou auditoria. A saída do comando contém só metadados.
Não executar o processo remoto diretamente em um terminal nem registrar seus
pipes brutos; use exclusivamente o wrapper, que filtra a saída.

## Preparação e comandos

### Precisão temporal das fixtures

Colunas sintéticas `date` podem declarar `temporalStorage: "datetime2_3"` no manifesto privado MSSQL. O perfil de vendas usa esse armazenamento para conservar a fronteira `23:59:59.997` e excluir o dia seguinte. O tipo escalar continua `date`; não altera casos salvos ou publicações. Sem a declaração, a coluna continua DATE e recusa timestamps. O executor aceita datas válidas e, no armazenamento explícito, timestamps UTC com `Z`, segundos inteiros ou três casas decimais. Recusa offsets, zona ausente, datas inexistentes e precisão excedente; não converte fuso nem trunca horários. Nulos seguem a declaração. FKs e cópias por trigger exigem o mesmo armazenamento nas colunas.

Exige companion e runner remoto compatíveis; atualizar somente o manifesto local não basta. Uma nova sessão e nova rodada são obrigatórias. Testes unitários não certificam SQL Server nem aprovam o rascunho.

### Casos de ranking limitado

Casos sem `expected.completeness` (ou com `{ "mode": "complete" }`) continuam
exigindo resposta completa. Para testar um ranking intencionalmente limitado,
o curador declara explicitamente no caso:

```json
{ "mode": "sql_limit", "maxRows": 10 }
```

Esse objeto fica em `expected.completeness`, com `expected.ordered: true`.
O SQL escolhido pelo caso deve ter `TOP 10` externo literal em SQL Server e
`ORDER BY`; o curador inclui desempate explícito e sementes que o exercitem.
O limite declarado é inteiro entre 1 e 100 e deve corresponder exatamente ao SQL.
PERCENT, WITH TIES, OFFSET, outros dialetos, conjuntos externos e limites internos
não são suportados nesse modo. Casos antigos não são convertidos automaticamente.

O runner exige `truncated:false` explícito do transporte, nenhuma paginação,
e teto de transporte efetivo maior que o TOP e que a quantidade devolvida.
Compara todas as colunas, valores e ordem com o resultado esperado, inclusive
zero linhas. Sinal ausente, teto insuficiente e resultado divergente não aprovam.
A prova de transporte existe apenas na instância do executor e só é vinculada
após a consulta concluir suas revalidações; não vai para resposta, cache ou log.
Consultas continuam retornando `complete:false`/`truncated:true` ao consumidor
quando possuem limite SQL: aprovar o ranking não comprova o total da fonte.
Cruzamentos continuam exigindo entradas completas e recusam esse opt-in.

Alterar essa declaração muda o hash dos casos, exige revisão/CAS e uma nova
rodada isolada. Não reescreve relatórios reprovados, aprova casos pelo console
ou publica a skill. A implantação do runner compatível precede a rodada nativa;
testes locais com transporte sintético não certificam SQL Server real.

### Execução pelo operador

1. Revisar, testar e implantar a revisão que inclui
   `dist/infrastructure/persistence/persona-v2/run-ssh-publication.js` pelo fluxo
   oficial do servidor de teste. Checkout atualizado sozinho não altera a imagem.
2. Configurar um alias SSH de operador com chave e host conhecido. O comando usa
   BatchMode e StrictHostKeyChecking; não pede senha, aceita host desconhecido,
   baixa imagem ou altera configuração do SSH.
3. Criar um pedido local `inspect` com `mode`, `revision` (SHA remoto completo),
   `personaId` e `skillId`. Não incluir credenciais, SQL, aprovação ou fixture.
4. Inspecionar o catálogo original:

```sh
npm run persona:test-publication:ssh -- --host=ALIAS_SSH --request=inspect.json
```

5. Preparar imagem candidata e iniciar uma sessão isolada nova pelo wrapper
   [manual](homologation-chain.md#sessão-contínua-para-treinamento-manual), usando
   `-CampoPrazo pagar` ou `-CampoPrazo receber` para cada piloto de prazo. Cada
   perfil MSSQL cria somente a tabela correspondente; não altera as sementes
   dos casos para incluir tabelas estranhas. `-CampoPrazos` continua sendo o perfil
   amplo anterior e não pode ser combinado com o perfil individual.
   O companion precisa conter exatamente
   as tabelas declaradas nos casos; a flag não acrescenta tabelas arbitrárias.
6. Criar pedido `run` com os mesmos IDs/SHA e `expected` contendo somente
   `revision`, `packageHash`, `casesHash`, `sourceId` e `sourceFingerprint` devolvidos
   pela inspeção. Não copiar `approved`, `results` ou credenciais para expected.
7. Executar usando o diretório `sessionRoot` daquela sessão:

```sh
npm run persona:test-publication:ssh -- --host=ALIAS_SSH --request=run.json --session=CAMINHO_DA_SESSAO_CHAIN
```

A montagem do descritor de fixture é interna; não é recebida do JSON de pedido.
O wrapper preserva `AGREGACAO_INSEGURA` como recusa do validador, sem classificá-la
como transporte inconclusivo. Continua retornando `approved:false` e
`repeatAllowed:false`, sem copiar mensagens, SQL ou detalhes remotos. Códigos
desconhecidos e envelopes incompatíveis permanecem inconclusivos; diagnóstico
não aprova o pacote nem autoriza repetição.

O modo inspect recusa sessão, e run exige sessão. Os IDs, hashes e a revisão não
substituem acesso SSH de operador. O programa não publica nem amplia grants.
Após relatório aprovado, revisão editorial e publicação continuam no console.

Outros rascunhos usam perfis locais fechados por `-CampoConsulta`: `titulos-pagar`,
`vencidos-pagar`, `agenda-pagar` e `saldo-fornecedor`. Títulos/saldo incluem
`dbo.fornecedor`; vencidos/agenda usam somente `dbo.contapagar`. Os campos vêm
dos casos curados, sem campos extras ou FKs inferidas. Não combinar esses perfis
com `-CampoPrazo` ou `-CampoPrazos`. A existência do perfil não aprova o caso:
inspecionar a revisão atual e usar uma sessão nova continuam obrigatórios.

## Perfis locais de estoque da Campo

Os perfis fechados `estoque-locais` e `estoque-saldos` usam apenas as colunas das amostras fornecidas pelo responsável. O primeiro declara `dbo.localarmazenagem` e `dbo.localarmazenagemfilial`; o segundo declara `dbo.localarmazenagem`, `dbo.saldoestoque`, `dbo.produto`, `dbo.marca` e `dbo.grupoproduto`, sem tabela de vínculo não utilizada. O vínculo de local com filial é opcional: não há FK inferida, fallback em `Filial` nem associação por igualdade de códigos. Somente MSSQL recebe essas tabelas; os demais motores conservam suas fixtures genéricas. O companion exige os nomes exatos e banco descartável. Existência do perfil e testes técnicos não aprovam consultas; cada revisão exige casos e nova sessão oficial.

## Diagnóstico local e ritmo dos casos

A ponte local registra apenas operação, código e origem enumerados e, para RATE_LIMITED, prazo numérico limitado. Não copia mensagem, SQL, credenciais ou detalhes do erro. O resultado continua não aprovado, sem retry. A ponte local espaça somente o início das preparações em 90 segundos, fora do orçamento SQL. Durante essa espera, envia até nove quadros prepare-wait vinculados ao pedido, com prazo restante estritamente decrescente, a cada dez segundos. O receptor aceita esses quadros somente no preparo, com limite total de 135 segundos ou a expiração da fixture, o que vier primeiro. O prazo ocioso de 45 segundos permanece; sem progresso válido o canal falha. Autorizar, executar, revalidar e limpar não recebem essa pausa. Preserva cotas, autorização por chamada e prazo SQL; heartbeat não é relatório nem aprovação. BUDGET_EXCEEDED e RATE_LIMITED são preservados como códigos sanitizados pelo CLI SSH. Esse intervalo não promete evitar qualquer cota personalizada. Se houver recusa, investigar e usar nova sessão conforme o procedimento abaixo.

## Interrupção, limites e reexecução

Cada sessão local aceita uma única tentativa de operador, marcada por arquivo
exclusivo `operator-run.claim.json`. Mesmo uma falha após o claim consome a sessão;
não remover esse marcador para repetir. Use nova fixture. Não pressupor que
perda de conexão cancelou SQL ou que a limpeza terminou. Interrupção conserva a
fixture para investigação pelo procedimento guardado, sem retry ou rollback.

Frames limitados a 4 MiB, leitura/escrita de canal a 45 segundos, sequência de até
2000 pedidos e 64 leases. SELECT conserva teto de 101 linhas e 15 segundos por
chamada. A ponte local recusa comandos DML, múltiplas instruções, tabelas fora do
manifesto, sementes divergentes, replay e concorrência. A identidade e a policy
da fixture são reconferidas pelo gateway real. Falha invalida o transporte e
impede nova execução/limpeza automática pela sessão. Prazo não promete cancelar
consulta já enviada ao motor.

Nenhum comando aceita `passed`, `approved`, relatório ou SQL de setup. A ponte
retorna resultados sintéticos; a comparação e a gravação acontecem no runner
remoto. Erro remoto reconhecido mantém código seguro; erro não reconhecido informa
`OPERATOR_RUN_UNCONFIRMED`, sem copiar mensagem livre, SQL ou segredo.

## Evidência e pendências

Regressões de unidade cobrem pins, ausência de efeitos em inspect, replay, queda,
limites, SELECT e isolamento de tabelas. O teste persistente
`tests/persona-v2/operator-publication.postgres.test.ts` usa PostgreSQL descartável
e um processo Node separado, com gateway SQL sintético; confere relatório na
persona original e recusa por revisão obsoleta. Não certifica SSH público,
SQL Server/ODBC nativo nem a sessão real da Helena.

Antes de aprovar os casos da Helena: implantar a revisão, conferir SHA remoto,
executar o piloto em fixture MSSQL nova e reler os relatórios das revisões exatas
no console. Não retirar os casos obrigatórios, inserir relatórios manualmente,
transferir aprovações entre personas ou usar o ERP como fixture.

Rodada local de 2026-11-08: 30 regressões direcionadas do runner, 2.352 testes
gerais (91 ignorados conforme configuração), 285 testes web e 339 testes
persistentes v2 aprovados. PostgreSQL 16 descartável e processo separado cobriram
o novo protocolo; nenhum teste usou o ERP. Tipos, lint, formatação, documentação,
treinamento com checkout exato do hub e builds passaram. Os logs locais ficam em
`test-results/`, fora do Git. Isso não substitui o CI nem o piloto nativo.

## Deploy e piloto de 2026-11-08

Runtime `ffd780192e4d6dc9936dc3a04419c0a640f3c9aa`, com
[CI aprovado](https://github.com/cesar-carlos/plug_mcp/actions/runs/42545801387)
e [deploy concluído](https://github.com/cesar-carlos/plug_mcp/actions/runs/42547045440).
Servidor e worker usam a imagem
`sha256:ddd4cca36d2a4a0b30953951616cb5869bc8e68f28ec79c034883dc02281a71c`.
A verificação pós-deploy confirmou saúde, SHA e os quatro ciclos do worker;
na janela observada não houve warnings, erros, truncamento ou supportIds.

O piloto da Helena executou os rascunhos originais de prazo a pagar e receber,
ambos na revisão 4, sem alterar casos ou consultar o ERP. Cada um usou uma
sessão local própria, SQL Server nativo e perfil de tabela individual. Os seis
casos passaram, com relatório aprovado gravado pelo runner no catálogo original.

| Perfil  | Casos aprovados | Hash do pacote                                                     | Hash dos casos                                                     |
| ------- | --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| pagar   | 3/3             | `9700ad6695e7f46238b7949a0d07650d0a1978368edc33f140101ccd22b87068` | `d1abb5fdfe4ef9bb79173f0eb6e551a9c4fdbac7565773184e9f5506216db483` |
| receber | 3/3             | `5f6c56b943de9cae5eab44bfaff818f55a5f1c237ef0af0f835080582eedd055` | `0ba2aecbaab21522838ae2dbea4c8c6228d7490d946ac73159727542c9e6b631` |

Candidata local do mesmo SHA:
`sha256:63a396f6bb978dddd5f7ce974c61750abf0181b77cb9e7e8edf10e155eeb92d3`.
Hub fixado em `41cc6b12501384ee41c97a281d740c3da7d2366e`; agente em
`dba1e40f8b08aba56bdde125bda66dfe52d7ccb3`. O patch local dos perfis de fixture
estava presente: inventário MCP
`417a6f896445bb0d3e43ee1a8b51849fc66ac1b3a722d1dff94674f0e35a3e79`,
inalterado antes/depois de ambas as sessões. Ambos os inventários terminaram
com `testExitCode: 0`, `unchanged: true` e `result: passed`; as fixtures foram
removidas pelo procedimento de propriedade verificada.

Duas tentativas anteriores não foram reutilizadas: a primeira não iniciou o
MCP por bytes CRLF locais em quatro migrations (restaurados exatamente do Git,
sem alterar migrations publicadas); a segunda recusou `INVALID_PLAN` porque
o perfil amplo tinha três tabelas e o caso somente uma. Os perfis individuais
corrigem essa incompatibilidade sem enfraquecer a igualdade do manifesto.
23 regressões direcionadas, tipos, lint e documentação passaram após o ajuste.
Isso não certifica consultas arbitrárias, outros rascunhos, PostgreSQL/Sybase
nativos ou aceite integral para clientes. Publicação editorial permanece separada.

### Ampliação isolada em 09/11/2026 UTC

Os casos originais de títulos (revisão 5), vencidos (revisão 2) e agenda
(revisão 2) passaram individualmente no SQL Server, usando o runner remoto
`ffd7801`. Cada tentativa usou uma sessão própria, inventário inalterado e
limpeza confirmada. Nenhum dado operacional foi consultado.

| Perfil   | Hash do pacote                                                     | Hash dos casos                                                     | Resultado |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------- |
| títulos  | `7930ef39ad1fb79ff1733e0bdde926add14a5eb16c964806151655bb14c4a6ec` | `ca74ef0018c9bfe62c5bd5b73a5850a44572f3bcef31b285abbe684f9ef35d0c` | 1/1       |
| vencidos | `17c9b4e600274340e3598252a88ffe748ecad005fa4013c5428d59aba7d84d01` | `35a15f6ca6ea9ea549e8c171a58f81c1cf7adf9178bd563ca638ce7ada4a520f` | 1/1       |
| agenda   | `88ac647f4a46e215e25b13eba5741f05f1566e617bfaa5520a201624fbc7dab6` | `57ce28b713760893c7774deb02e5b82e2d0e5f2b56737ea04bf911bb6532b2ba` | 1/1       |

Inventário MCP local: `f0e544bf19acaa4a33db292b8e6afc010f46e8805c8b0ec962312646f67152a4`.
Agente: mesmo commit base anterior, com patch local explícito para permitir
somente `dbo.fornecedor` na fixture MSSQL; inventário
`ccfbec6d12035112b7c6cddab6202bd40d669633b3f4b1f612e477d00210207f`.
A tentativa inicial de títulos foi recusada antes do runner porque essa tabela
não estava na lista permitida do agente. A regressão do agente reproduziu a
recusa e passou após a extensão fechada (9 testes, incluindo negativas).

A correção do recorte em CTE foi reproduzida no validador e validada com casos
positivos e recusas de cardinalidade, direção, chaves e UNION. O gate completo
local passou: 2.387 testes gerais e 285 do console; 91 testes gerais não
selecionados permaneceram ignorados. Saldo por fornecedor ainda exige deploy
do novo validador e rodada nativa própria; estes três relatórios não o aprovam.

## Perfis financeiros por filial

`agenda-receber-pagar` combina somente as duas carteiras de vencimentos:
`dbo.contareceber` e `dbo.contapagar`. Cada tabela conserva chave composta
empresa/título e os campos filial, moeda, vencimento, status e saldo residual.
Campos fora da chave aceitam nulos; não há cadastro, FK, chave gerada ou coluna
adicional. O perfil é exclusivo de MSSQL e não se combina com outros perfis.
As sementes de cada caso devem incluir as duas tabelas e suas chaves, mesmo
quando uma carteira estiver vazia. O teste nativo e a publicação são separados.

Os perfis locais `horizonte-pagar`, `horizonte-receber` e `atraso-fornecedor` declaram somente a tabela de carteira correspondente aos casos. Horizontes incluem chave composta empresa/título, filial, moeda, saldo residual, status e vencimento. Atraso acrescenta código do fornecedor, sem tabela cadastral ou FK inferida. Colunas fora da chave admitem nulos para testar exclusões e cobertura. São alternativas exclusivas aos perfis anteriores e preservam o isolamento MSSQL; não ampliam tabelas no ERP nem concessões. Cada revisão exige inspect, sessão nova e relatório próprio. A existência desses perfis não comprova execução nativa ou aprovação das consultas.

O perfil `cobranca-cliente` usa dbo.contareceber com os sete campos de carteira e codcliente, sem cadastro ou FK inferida. Aging pode usar horizonte-receber quando suas sementes tiverem exatamente o mesmo contrato físico; isso exige sessão e relatório próprios, sem herdar aprovação.

`titulos-receber` acrescenta à carteira o número do título, parcela e código do
cliente, com `dbo.cliente` contendo apenas código e nome. A chave da carteira é
empresa/título; a do cadastro é código do cliente. Não declara FK nem habilita
fontes operacionais. O companion precisa da allowlist MSSQL revisada para essa
tabela, mantendo a restrição à base descartável e os testes de isolamento.

## Perfis de vendas

Os perfis `prazo-filial-receber` e `prazo-filial-pagar`, selecionados por
`-CampoConsulta`, usam somente a tabela correspondente da fixture MSSQL, com as
sete colunas de prazo originais mais `codfilial` inteiro obrigatório. Preservam a
chave empresa/título e os nulos de moeda, saldo e datas; não alteram `CampoPrazo`
nem `CampoPrazos`. Não mudam allowlists, permissões ou o agente. Casos devem
conferir isolamento entre filiais da mesma empresa, moedas, saldo parcial,
datas inválidas e carteira vazia. Selecionar perfil não executa nem aprova casos;
a sessão nova e os hashes oficiais da revisão continuam obrigatórios.

### Evidência isolada de prazo por filial — 2026-11-11

Perfis novos aprovados em 53 testes locais de schema/seleção e regressão dos
perfis anteriores; typecheck, lint dos testes e `docs:check` passaram. Os quatro
cenários de perfil/wrapper novo falharam antes da implementação. Nenhum código,
allowlist ou permissão do hub/agente foi alterado nesta rodada.

Runner remoto `58cc764c1b2bddbf9b7d83c94deab2705f27082a`; candidato local
`sha256:3b8a22738ac3fc0a080b4023991e15e6bf7922fac737ee77bbb5ae97581f379b`.
O candidato contém o runtime; perfis sintéticos são fornecidos pelo manifesto
local. As duas revisões 4 foram reinspecionadas antes da única tentativa de cada
rodada, com comparação dos hashes e da identidade da fonte.

| Perfil               | Skill                                | Sessão descartável                                                      | Resultado          |
| -------------------- | ------------------------------------ | ----------------------------------------------------------------------- | ------------------ |
| prazo-filial-receber | df7b8496-19bf-4d45-8741-d3d43749ab3c | se7e_persona_b92096f927a6_test / chain-0a205aed4cb1420fabc17910f790dc58 | approved:true, 3/3 |
| prazo-filial-pagar   | 405ddb23-9dd7-4b64-9a46-ac7ef7bea369 | se7e_persona_fb37c0401438_test / chain-3eb2fa3bef914002b443cd8cc073bc5f | approved:true, 3/3 |

Receber: packageHash `2a1b1c34202cb438b70282cbea068b4dc6ef222647d51897f6d2b61dd3721dd2`,
casesHash `5f1dc2e9fa43c40c9ad260ee925166a447adaef6b49f2814c250757b6a06707c`.
Pagar: packageHash `f76b821843e9b053fbc4ba42d064815853eb56183ba8d9d1ae05a5ffbd9187c3`,
casesHash `ba83852edf294315fb16c3f035d73746b7ff2d2248262c3298726e86c655ee26`.

Parada e remoção oficiais confirmadas às 12:56:14Z e 13:02:03Z, respectivamente,
com `testExitCode:0`, `unchanged:true` e `result:passed` no inventário MCP/hub/agente.
Diretórios e containers dessas sessões foram removidos. Uma preparação anterior
parou no carregamento de Set-Acl pelo Windows PowerShell, antes de criar bancos
ou executar casos; seu diretório vazio foi removido. A nova preparação usou
PowerShell 7 com ACL intacta. Nenhum caso foi repetido.

Esta evidência aprova somente os casos sintéticos dessas revisões. Não executa
no ERP, publica skills, altera concessões ou comprova resposta no ChatGPT.

O perfil separado `vendas-descontos` usa as mesmas três tabelas do vendedor,
mas contém `valorbruto` e `valordesconto` decimal nullable no lugar de
`valorliquido` em ProdutoVendido. Preserva chaves, empresa, filial, operação,
data, pré-venda e vendedor. `vendas-vendedor`, resumo e município não mudam;
suas sementes anteriores não precisam receber campos de desconto. As sementes
do perfil novo declaram valores tipados, com nulo explícito quando desconhecido,
sem substituir por zero.
Testar percentuais exige definir denominador, tratamento de bruto zero/nulo e
desempate nos casos curados. Acrescentar campos não aprova essas derivações nem
altera guardas, runtime, concessões ou modelos publicados.

`vendas-resumo`, `vendas-vendedor` e `vendas-municipio` usam ProdutoVendido e TipoOperacaoSaida das amostras autorizadas. Cada dimensão acrescenta somente código/nome (município inclui UF); sem FKs inferidas. Casos devem cobrir períodos sobrepostos, cancelamento, pré-venda, operação sem financeiro e ausência de dimensão. Os perfis não autorizam dados operacionais nem outras tabelas; exigem nova sessão por revisão.

O perfil `vendas-clientes` acrescenta somente `codcliente` ao recorte de ProdutoVendido do resumo; usa apenas cabeçalho e TipoOperacaoSaida. Não inclui nomes, contatos ou cadastro de clientes. Empresa e período são parâmetros do caso, e o ranking deve ser recalculado após consolidar filiais, com desempate explícito. As chaves e cotas do operador permanecem iguais.

O perfil `vendas-distribuicoes` usa somente `dbo.produtovendido` e `dbo.tipooperacaosaida` na fixture SQL Server isolada. Acrescenta os códigos de condição, transportadora, vendedor e cliente e o frete do cabeçalho presentes na amostra fornecida; não importa cadastros nem infere FKs. Cobre distribuições por condição, frete por transportadora e líquido por vendedor/cliente, preservando nulos e grupos distintos. Não equivale a recebimentos, pagamentos ou comissão. A aprovação continua vinculada aos casos e à revisão exata; usar nova sessão por rodada.

O perfil `itens-cestas` usa somente cabeçalhos elegíveis, operações e oito campos da amostra `dbo.itemprodutovendido`. Chave empresa/venda/item; unidade textual, quantidades e valores decimais anuláveis. Não importa notas, tabelas de preço, promoções ou custos. O agente de fixture aceita esse nome apenas no MSSQL descartável, sem ampliar RPC/autorização de produção. Casos conferem composição, ausência de itens, produto repetido e média ponderada por unidade. Cada rodada exige sessão nova e fonte do agente estável.

O perfil `custo-atual` limita a fixture MSSQL às cinco tabelas e 17 campos da amostra CustoProduto/Produto/UnidadeMedida/GrupoProduto/Marca. Empresa/filial/produto formam a chave de custo; custos são decimais anuláveis e unidade é textual. Não inclui histórico de custo nem saldo de estoque. Os nomes adicionais do agente só são aceitos no banco descartável, sem ampliar RPC/autorização de produção.

O perfil local `itens-gestao` contém somente as seis tabelas e 30 campos das amostras de vendas/itens/operação e produto/marca/grupo. Preserva custos, receitas e classificações nulos e não cria FKs presumidas. Casos de margens e ABC verificam empresa/filial, períodos independentes, ponderação, cortes 80/95, empates, sinais, dados incompletos e vazio. O decimal da fixture não comprova a precisão do ERP: reconciliar a escala real separadamente por ODBC. A presença do perfil não aprova casos nem concede acesso.

O perfil itens-variedade-perdas reutiliza somente três tabelas e 17 campos de itens-gestao, excluindo dimensões e valores de cabeçalho não usados. Preserva nulos e chaves compostas; valida variedade por vendedor e perdas históricas sem ampliar o escopo fornecido.

### Cadastro de filiais — perfil local de 11/11/2026

`-CampoConsulta cadastro-filiais` declara apenas dbo.filial (13 campos) e dbo.municipio (3 campos) da amostra do responsável. Chave da filial é empresa/filial; município é anulável na filial e não há FK sintética obrigatória, permitindo testar ausência de correspondência no INNER JOIN. Códigos são inteiros, demais campos textuais, sem interpretação de regime tributário. Somente MSSQL; não amplia fonte operacional. Perfil e testes locais não comprovam execução do runner, publicação ou acesso da persona.

O perfil `estoque-gestao` contém somente saldoestoque, produto, custoproduto, produtovendido, itemprodutovendido e tipooperacaosaida das amostras curadas. Usa chave de saldo produto/local, custos empresa/filial/produto e itens empresa/venda/item. Não declara vínculo local/filial ou FK inferida. Casos devem separar custo atual, saldo positivo, valores desconhecidos, demanda e confirmação explícita do recorte; a existência do perfil não aprova nem publica consultas.

Validação temporal de 2026-11-14: regressão nativa em SQL Server 2022 descartável, ODBC 5.0.4 e driver 18 preservou 23:59:59.997, midnight, NULL e excluiu o dia seguinte. A execução revelou e corrigiu o bind de NULL como BIGINT usando conversão tipada por texto com estilo126, sem interpolar valores. Container sem volumes removido ao concluir. Os 110 testes MCP direcionados e 58 testes Dart passaram; a aprovação do caso salvo exige ainda nova rodada oficial após implantação compatível.
