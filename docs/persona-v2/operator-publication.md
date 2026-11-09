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
O modo inspect recusa sessão, e run exige sessão. Os IDs, hashes e a revisão não
substituem acesso SSH de operador. O programa não publica nem amplia grants.
Após relatório aprovado, revisão editorial e publicação continuam no console.

Outros rascunhos usam perfis locais fechados por `-CampoConsulta`: `titulos-pagar`,
`vencidos-pagar`, `agenda-pagar` e `saldo-fornecedor`. Títulos/saldo incluem
`dbo.fornecedor`; vencidos/agenda usam somente `dbo.contapagar`. Os campos vêm
dos casos curados, sem campos extras ou FKs inferidas. Não combinar esses perfis
com `-CampoPrazo` ou `-CampoPrazos`. A existência do perfil não aprova o caso:
inspecionar a revisão atual e usar uma sessão nova continuam obrigatórios.

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
