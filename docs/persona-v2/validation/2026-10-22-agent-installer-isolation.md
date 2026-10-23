# Instalação, reparo e atualização: isolamento do runner — 2026-10-22

## Alterações verificadas

O agente já contém provisionador e runner Windows com identidade exclusiva,
fixtures Pascal de reparo/atualização manual e mecanismos de recuperação do
supervisor. Essa implementação não foi refeita. O ensaio instalado histórico
do agente em 2026-10-15 conserva seu alcance: inclui reinstalação da mesma versão
e migração do supervisor, sem certificar atualização para build novo ou aceite
da candidata atual.

Corrigidas quatro lacunas no agente:

- `tool/updater/validate_isolated_windows_lifecycle.py` deixa de exigir uma
  instalação operacional e de abrir seu SQLite, cofre, política do atualizador
  ou executáveis. Compara apenas metadados de registros Windows. Retenção de
  SQLite/DPAPI permanece restrita aos arquivos privados da fixture.
- Falha na verificação final ou divergência de registros invalida o relatório.
  `operationalStateInspection=registration_metadata_only` e
  `operationalRegistrationsPreserved` identificam o alcance. Verificação
  indisponível conserva resultado null, sem afirmar preservação; conferência
  bem-sucedida não transforma instalação falha em sucesso.
- `tool/updater/isolated_windows_fixture.py` e o loader validam raiz própria,
  nome do manifesto, tamanho máximo, formato, gate desligado, ausência de
  junctions/links nos caminhos e vínculo dos artefatos antes de ler ou calcular
  seus hashes. O provisionador recusa destino externo/existente antes de criar
  diretórios ou compilar.
- O provisionador não busca mais o supervisor antigo em HEAD, que já usa contrato
  de recuperação 2. Exige `--legacy-revision` com SHA completo, ancestral local,
  contrato 1 e aplicação desabilitada, antes de criar a fixture. Não faz fetch,
  checkout ou migração automática. Conserva `legacySourceCommit` no artefato.

Reprodução anterior à correção: a regressão de leitura externa falhou por tentar
abrir o arquivo antes de validar a raiz. Na primeira rodada do teste de host,
um caso ainda alcançou o caminho instalado e recebeu recusa de acesso à política
protegida; o teste foi corrigido para interceptar todos esses colaboradores antes
das próximas execuções. Não houve instalação, alteração de serviço ou execução
de SQL nas bases de negócio nessa reprodução. Não foram registrados conteúdos
de configuração/cofre.

## Validação

As regressões executam diretórios temporários próprios. Fixtures Inno/Pascal
compilam e executam a preparação/reparo, encerrando antes de instalar. Cobrem
cliente ausente, política residual, supervisor incompatível, transição explícita,
operações ativas, falha de revogação e reparo opcional. Elas não certificam
instalação elevada como SYSTEM, boot, logon ou rollback de uma atualização real.

**53 testes aprovados, sem omissões**, em 12,897 segundos, com Python 3.12.14.
Incluem contratos do instalador, fixtures Pascal compiladas/executadas, isolamento,
relatórios e seleção histórica explícita. `py_compile` dos cinco módulos alterados
passou. Log local: `node_modules/.cache/agent-installer-lifecycle-final.log`.

Revisão final do agente: commit-base
`3b4f099e64a319a100cd93e00667ffca4afef732`, com 2669 arquivos presentes no
inventário e SHA-256
`ae40d228bd4a6b9de59984831503bc552e9d3a8121c736a76703b15cc6a984e0`.
Inclui alterações locais; não é um commit novo. Captura somente de metadados em
`node_modules/.cache/agent-installer-lifecycle-revision.json`, sem ler arquivos
ignorados ou mudar o index. `git diff --check` dos arquivos rastreados tratados
passou. Windows observado: `10.0.26300.0`.

No MCP, `docs:check` passou com 257 documentos, 19 rules, 93 exemplos JSON,
24 exemplos de schema, treze gates e zero problemas. Formatação dos documentos
alterados passou; o verificador continua recusando a liberação.

O processo disponível foi identificado como não elevado; não foi solicitado UAC
nem alterada a instalação operacional para contornar essa condição.

### Compilação histórica privada

Confirmado no Git local: HEAD `3b4f099e64a319a100cd93e00667ffca4afef732`
contém contrato 2; o ancestral explícito
`fdb44d86b2a36df85c0133cf72167217fc1bd16e` contém contrato 1 com aplicação
desabilitada. O helper corrigido compilou o supervisor desse ancestral em
diretório novo, com identidade exclusiva e chave pública sintética.

- Identidade: `PlugAgenteHomologacao_76ee5e175049`.
- Diretório: `plug_agente/build/homologation/windows-lifecycle-legacy-build-b3090cdc6d374063b155bd04ec5e1a14`.
- Binário: `legacy/native/Release/plug_update_service.exe`.
- SHA-256: `500b063cf7a8ac72c79df9065d216a12304ace3b65dccef3db60e6b3a2be1a37`.
- Metadados: `node_modules/.cache/agent-historical-supervisor-build.json`.

O binário privado foi mantido para inspeção; não foi instalado, registrado como
serviço ou iniciado. Não é pacote completo de instalação, prova de atualização
entre builds ou artefato de produção. Nenhuma chave privada foi publicada.

## Continuação

Executar a candidata exata em fixture Windows elevada, com fase de usuário
padrão separada; validar atualização entre builds distintos, perda de confirmação,
reinício, recuperação, original-user data e rollback. Preservar o cofre corrigido
e interromper leitores antigos antes do upgrade coordenado. Não transformar
reparo/reinstalação da mesma versão em prova de atualização de aplicativo.

O runtime Dart/C++ do agente, contratos do hub e imagem MCP não foram alterados
nesta tarefa. Não há novo aceite dos três motores ou avaliação da IA. HTTPS e
ChatGPT permanecem manuais; `ready:false`, gates e bloqueios de atualização
automática/produção foram preservados.
