# Testes de rascunhos por operador SSH

Implementação local para revisão e implantação. Não registra aceite integral,
execução nativa do piloto Helena ou publicação de rascunhos por si só.

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
   `-CampoPrazos` para os casos de prazo. O companion precisa conter exatamente
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
