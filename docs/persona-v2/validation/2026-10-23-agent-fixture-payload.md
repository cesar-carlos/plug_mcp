# Vínculo e inspeção do payload do agente — 2026-10-23

## Problema reproduzido e correção

A regressão reproduziu uma lacuna no runner de instalação: alterar o executável
do supervisor no payload não era recusado pelo loader. O hash do instalador não
vinculava os arquivos usados posteriormente pelas comparações de recuperação.
O teste falhou com `RuntimeError not raised` antes da correção.

O agente passou a produzir manifestos de fixture **formato 2**, com inventário
completo e hash SHA-256 canônico do payload. A lista obrigatória de executáveis
reutiliza a definição do instalador e inclui `data/app.so`. A captura ocorre antes
do empacotamento; há reconferência após o empacotamento e a compilação histórica.

O loader recusa conteúdo alterado, ausente ou adicional, nomes externos/não
canônicos, junctions/reparse points e hard links antes de ler o conteúdo por esses
vínculos. Também exige o supervisor histórico antes de iniciar qualquer fase.
Manifestos históricos não são reescritos; precisam de nova fixture para execução.

Cada fase revalida os inputs ao entrar e ao sair. Divergência ou impossibilidade
de leitura invalida o relatório, mesmo se estava aprovado. Conferir integridade
não promove uma fase que falhou, não comprova rollback nem autoriza retry.

## Inspeção sem elevação

Entregue `--phase inspect`, sem `--allow-machine-changes`. Confere somente os
arquivos da fixture e devolve metadados permitidos. Não consulta instalação,
perfil operacional, registry ou serviços. O contrato distingue:

- `installationPerformed:false`: a inspeção não executou instalação.
- `installedState:not_checked`: não afirma ausência de uma instalação.
- `buildSourceVerified:false` e `payloadQualification:bytes_only`: hashes não
  comprovam a origem do build Flutter.

Procedimento do agente: `docs/implemente/plano_auto_update_evolution.md`.
O job Windows existente passou a incluir as regressões e recusar skips; a
configuração foi validada localmente. Não houve push ou execução desse CI remoto.

## Evidências executadas

- **92 testes** do tooling de atualização aprovados, sem omissões, em 14,724 s.
- **14 regressões** do workflow aprovadas, sem omissões, em 0,167 s.
- `py_compile` dos sete módulos afetados aprovado. `git diff --check` passou nos
  arquivos rastreados, com avisos de normalização CRLF/LF, sem alteração do index.
- Compilação privada C++/Inno e empacotamento produziram fixture de identidade
  própria. O loader atual releu **98 arquivos** e conferiu seus vínculos.
- Probe no executável compilado privado: um byte alterado foi recusado; os bytes
  originais foram restaurados e a releitura confirmou o hash original. O binário
  alterado não foi executado. A inspeção real funcionou sem elevação.

Python de testes: **3.13.14**, PyYAML **6.0.3**, cryptography **48.0.0** já instalados.
O provisionamento usou Python **3.12.14** do runtime disponível. A primeira tentativa
de testes de workflow nesse runtime não encontrou PyYAML; repetiu-se com o Python
existente que já tinha a dependência, sem instalar pacotes no host.

A primeira raiz de build, mais longa, compilou o supervisor atual e empacotou,
mas falhou ao preparar o histórico: MSBuild retornou MSB6003/DirectoryNotFound.
O processo terminou com falha. Uma nova raiz própria mais curta completou o
provisionamento; não se afirma causa definitiva nem compatibilidade geral de
caminhos longos. A rodada falha e seus arquivos foram preservados para inspeção.

O teste negativo de hard link foi acrescentado depois do empacotamento; a
releitura final do pacote usa o código atual, incluindo essa guarda. Os testes de
Inno/Pascal executam fixtures próprias conforme seu contrato; o pacote real gerado
nesta tarefa não foi instalado ou executado como aplicativo.

## Artefato privado e revisão

Raiz válida relativa ao agente:
`build/homologation/windows-lifecycle-pb-66be72e02ed6`. A identidade Windows é
`PlugAgenteHomologacao_323a15eac380`. O caminho também está no registro privado
`node_modules/.cache/agent-payload-binding-short-path.txt` do MCP; identidade e
nome de diretório são gerados separadamente.

| Vínculo                  | Valor                                                              |
| ------------------------ | ------------------------------------------------------------------ |
| Formato / qualificação   | `2` / `bytes_only`                                                 |
| Hash do instalador       | `1941ffc6586f93e4de4f93daa18d8344f3929d03a9200968896b297ea3e9f907` |
| Hash canônico do payload | `a7deaf1ddb216d3e6c6c2aca64d9c40c18394edef19837c936e682e06bc781e5` |
| Supervisor histórico     | `fdb44d86b2a36df85c0133cf72167217fc1bd16e`                         |

A chave sintética permanece apenas na raiz privada protegida. Não é chave de
produção nem artefato para release. Nada foi registrado como serviço ou iniciado
por esse pacote. Não foi solicitado UAC; o processo disponível foi conferido como
não elevado. As raízes válida e falha foram mantidas, sem limpeza de instalação.

Inventário antes/depois da rodada final: UTC **11:51:22–11:51:40**, estável,
`persona-chain-sources-317e492660144f0e82113b581f5721e6.json` no cache MCP:

| Projeto | Commit-base                                | SHA-256 dos arquivos efetivos                                      | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `667082bbb371760d0cf2d5244177da12b0c96f2e5b8fa062bdbb0245e1eef6be` | 1108     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `c1f21e992eb82ef1843fea007d671a972f371b6b` | `4bfe421a30e870a88f27f33d9ade63629d05c9195eeaaab323b802bee1d96811` | 2678     |

Inclui alterações locais; não é commit novo. Documentação acrescentada após a
rodada não foi incorporada retroativamente a esses snapshots.

| Log local no cache MCP                 | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `agent-payload-qualified-updater.log`  | `878cea321fcc48960d874b7740a0c444cb1f461ffdb5740e8f27f6c65fb24a61` |
| `agent-payload-qualified-workflow.log` | `ba9b91bb102ff225a8388ec3d5a1ce1d3c59151e7ae8255ceb54bb9ab8bbd41a` |
| `agent-payload-qualified-probe.log`    | `699974e33713f78cc0fcb584feff55b9eb3d5109095ee026894c616bc63271d5` |

## O que ainda não está comprovado

O provisionador copia um Release existente e reescreve identidades de instalador
e updater. Isso não recompila o aplicativo nem muda seu namespace Dart padrão
`PlugAgente`. Não usar esse pacote para afirmar isolamento do perfil ou qualificar
startup/logon da aplicação. Falta construir e homologar um bundle novo, de origem
comprovada, com armazenamento/bootstrap isolados e o cofre corrigido.

Depois disso permanecem a fase elevada e a fase de usuário padrão, atualização
entre builds distintos, reinício e janelas de recuperação instaladas. O ensaio não
certifica SQL, três motores, UI ou IA e não substitui suas evidências próprias.
HTTPS/ChatGPT seguem manuais. Nenhum gate recebeu aceite; deploy continua bloqueado.
