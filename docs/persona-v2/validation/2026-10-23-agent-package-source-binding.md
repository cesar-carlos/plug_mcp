# Prova do aplicativo no pacote privado — 2026-10-23

## Mudança implementada

O empacotador privado do agente aceita `--application-build` com o caminho exato
do recibo de build isolado. A prova é validada antes de criar a saída. O pacote
usa a mesma identidade e as fontes/payload privados indicados nessa prova.
Prova ausente ou inválida, quando explicitamente solicitada, não permite fallback
para o Release do checkout original.

O manifesto fixa caminho e hash do recibo, commit, hash das fontes e hash do
payload original. A releitura reconfere a prova e os arquivos. Todo conteúdo do
aplicativo deve permanecer igual; somente os três executáveis de updater
identificados podem ser recompilados com a chave pública da fixture. A ligação é
conferida após empacotamento, compilação histórica e nas fronteiras das fases.

`applicationSourceVerified` é separado de `buildSourceVerified`. O segundo
continua falso: a prova não certifica a origem de todos os componentes do
instalador, o supervisor histórico ou recuperação instalada. O inventário do
pacote conserva `payloadQualification:bytes_only`; fixtures anteriores não são
promovidas nem reescritas.

## Evidências locais

- **107 testes** do tooling de atualização aprovados, sem omissões, em 14,740 s.
- **14 regressões** do workflow aprovadas, sem omissões, em 0,162 s.
- Sintaxe Python dos sete módulos envolvidos aprovada.
- Regressões novas recusam prova substituída durante verificação, identidade
  divergente, referência alterada, arquivo modificado/adicional/ausente e prova
  inválida antes da criação de saída ou acesso ao Release antigo.
- Inspeção real, somente de leitura, da fixture anterior conferiu seus **98
  arquivos** e preservou hashes. Devolveu `applicationSourceVerified:false`,
  `buildSourceVerified:false`, `installationPerformed:false` e
  `installedState:not_checked`.

Hashes SHA-256 dos arquivos do agente usados nesta rodada:

| Arquivo                                  | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `application_package_binding.py`         | `bee4410059d9de065f94071b07371628f279b56ba018c7537252b620ca93a846` |
| `isolated_windows_fixture.py`            | `e9308410deee6dcf2c4d43178879906ac9d7159eb35903cfe448dae44c0021ff` |
| `validate_isolated_windows_lifecycle.py` | `58fd7625a8865f2cc67c6c2b4f5f5d5774aa7c698dcb34f98a7dd195c9f66110` |
| `test_application_build.py`              | `86cc9e8f68eb1ae69bc214a70b64842535a5bdba640227a7ba4e9b7487b5f7ca` |

Os arquivos estão sob `tool/updater/`. São hashes de trabalho local, não novos
commits nem certificação de alterações concorrentes em outros subsistemas.

## Limites e continuação

O fluxo de prova nova foi coberto por regressões controladas; ainda não há um
aplicativo novo compilado com sucesso. A incompatibilidade do redistribuível C++
registrada na [rodada de build](2026-10-23-agent-source-build.md) permanece.
Portanto, não se declara empacotamento completo com prova nova nem instalação
homologada. Corrigir o ambiente, construir em raiz nova e executar o pacote
privado completo continuam pendentes.

Não houve alteração Dart, uso da DLL original, execução de instalador, serviço,
perfil operacional, commit, push ou deploy. A sessão de treinamento manual
existente permanece com seu contrato próprio. HTTPS/ChatGPT continuam manuais;
nenhum gate de produção foi concluído e `ready:false` foi preservado.
