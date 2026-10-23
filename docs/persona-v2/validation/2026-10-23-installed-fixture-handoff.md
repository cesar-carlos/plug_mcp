# Handoff e instalação isolada com UAC — 2026-10-23

## Falha reproduzida

O runner administrativo conferia o arquivo `standard-result.json` somente pelo
campo `status`. Não recusava esse arquivo antes de chamar o instalador, nem
vinculava o resultado à tentativa atual. A regressão com um resultado antigo
chegou ao dispatch simulado do instalador e falhou antes da correção. Nenhum
instalador real foi chamado nesse teste.

## Correção entregue

O agente passou a exigir handoff específico da tentativa, vinculado ao manifesto
privado, identidade, instalador e payload. Antes de instalar, recusa markers,
claims, resultados e arquivos parciais anteriores, inclusive junction sem
destino. Nenhuma evidência anterior é apagada ou promovida.

A fase não elevada consome um claim exclusivo antes de IPC. Não pode repetir a
tentativa, sobrescrever resultado ou começar depois do término administrativo.
O administrador exige o mesmo handoff, estado não elevado literal e os nove
casos previstos, sem omissões ou duplicatas. A publicação do resultado usa
arquivo temporário, flush e rename Windows sem sobrescrita; resultado parcial
não é apresentado como terminal.

Esse vínculo coordena evidência de fixture; não autentica por si só o usuário
nem substitui SCM, PID/SID, assinaturas, policy ou ACLs do agente. Não permite
retry de instalação incerta e não introduz elevação automática.

## Evidências

- Regressão vermelha antes da correção: resultado antigo permitia chegar ao
  dispatch simulado; após a correção, recusa antes desse ponto.
- **126 testes** de tooling do agente aprovados, sem omissões, em 17,360 s.
- **14 regressões** do workflow aprovadas, sem omissões, em 0,171 s.
- Sintaxe Python e verificação do diff aprovadas, com avisos CRLF/LF.
- Probe no pacote privado de origem comprovada: sem handoff, a fase de usuário
  foi recusada sem criar claim ou resultado. O teste bloqueou IPC explicitamente;
  isso não comprova execução de IPC real ou instalação.

O job Windows existente inclui a nova família; não houve execução de CI remoto.
O pacote é o da [rodada com runtime privado](2026-10-23-agent-private-runtime-package.md).
O [bootstrap e reinício com hub persistente](2026-10-23-native-desktop-persistent.md)
mantêm seus próprios snapshots. Python do operador não altera os binários desse
pacote e esta rodada não recertifica mudanças posteriores de outros subsistemas.

## Ambiente e próximo passo

Após esta rodada, o responsável autorizou explicitamente o teste isolado nesta
máquina com UAC. A preparação encontrou um identificador global residual no
helper nativo: `PlugAgenteUpdateHelper`. A derivação agora também o isola e
recusa fontes nativas sem a transformação obrigatória, mesmo quando os bytes
ainda correspondem ao commit original. O instalador de fixture passa a usar
`CloseApplications=no`; o instalador operacional não foi alterado por essa regra.
As 41 regressões afetadas passaram. Um novo aplicativo/pacote é necessário:
não alterar nem promover o pacote anterior como evidência desta correção.

A verificação inicial retornou `windowsAdministrator:false`. Depois da autorização
humana, houve execução real com UAC no namespace `PlugAgenteHomologacao_37716c41b383`.
O pacote novo tinha instalador SHA-256
`f258356b1bf1293a2379de329530ce6e0cabbd8713cce76310543b528446ba49`.
O runner registrou falha, inputs reconferidos e registros operacionais observados
preservados. A fase de usuário não chegou a iniciar; isso não aprova instalação.

O instalador registrou `core_boot_failed`: o bootstrap privado recusava a
checagem de assets por não receber contexto de fixture. A ausência posterior
do registro de startup também impediu a conferência. O desinstalador exclusivo
encerrou com código zero; executável e serviço exclusivos foram removidos.
Evidência e resultado falho foram preservados, sem repetir esse namespace.

A derivação foi corrigida para executar `checkInstallationBundle(rootBundle)`
somente com `--installation-check`, antes do bootstrap privado. O runner nativo
continua recusando a execução normal sem contexto; não há stub de sucesso.
As 42 regressões afetadas passaram. A nova derivação exigiu outra compilação e
novo pacote para a rodada instalada independente abaixo.

## Rodada instalada após a correção

Executada nesta máquina de desenvolvimento, por autorização explícita, de
14:06:49 a 14:09:06 UTC. A fase administrativa usou UAC; a fase do consumidor
conservou o token Windows não elevado. Não é uma máquina descartável.

| Vínculo                      | Valor                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Namespace                    | `PlugAgenteHomologacao_4bb659210098`                                                     |
| Fonte do aplicativo          | `c1f21e992eb82ef1843fea007d671a972f371b6b`, bootstrap com derivações privadas explícitas |
| Supervisor histórico         | `fdb44d86b2a36df85c0133cf72167217fc1bd16e`                                               |
| Prova do aplicativo SHA-256  | `1db492444d45c4913a67736bdb4fee8c4981789b06a9c83a77a779af73ae912a`                       |
| Manifesto de fixture SHA-256 | `4bce3953fcac32eca26dc68c3347462f7b025e307d7e306eb42057109fd713ef`                       |
| Instalador SHA-256           | `92cb42761d4ca63818187d3d03dd20d0e3aec711d82d81b40ca9a552bf193772`                       |
| Árvore do payload SHA-256    | `bc93d37699931e46a762fdd4c70ae976ebb3a8c1561409487f7eafd44b5d6de1`                       |

Os 30 arquivos Python do tooling foram inventariados antes da instalação e
permaneceram inalterados. Provas e relatórios privados ficam sob
`plug_agente/build/homologation/windows-lifecycle-sb-df087f694ab2`; não publicar
o diretório, que contém material de assinatura exclusivo da fixture.

**Resultado:** nove etapas administrativas e nove grupos de verificações sem
elevação passaram. Incluem instalação/enrollment, comunicação SCM/pipe real,
ACLs, DPAPI do usuário, recusas de imagem não registrada e administração,
assinatura/replay/canal, staging idempotente, apply bloqueado e vinte ciclos de
preparação/cancelamento. Também passaram reparo opcional com arquivo principal
bloqueado, restauração do cliente ausente, recusa do supervisor antigo,
atualização explícita do host, reinstalação da mesma versão, preservação de
SQLite/DPAPI privados, desinstalação, reinstalação com policy residual e
desinstalação final.

As checagens reais do payload retornaram `core_ready` e
`odbc_driver_available`; a segunda não abriu conexão de banco. As duas fases
reconferiram os inputs; o relatório administrativo confirmou preservação dos
registros operacionais observados. A limpeza posterior, com resolução de caminhos,
recusa de links e conferência de serviço ausente, removeu apenas resíduos dos
dois namespaces já desinstalados. Evidências das duas tentativas foram mantidas.

Após as correções, **129 testes** de tooling passaram sem omissões, em 16,648 s.
Isso inclui as 42 regressões direcionadas, não 171 testes distintos.

**Limites:** `applicationSourceVerified:true` não muda
`buildSourceVerified:false` do pacote inteiro. A rodada não certifica todas as
alterações atuais do agente, build de produção, bootstrap instalado com perfil
de negócio, apply/probation/rollback automático ou a cadeia SQL dos três motores.
Esses aceites continuam separados. Nenhum cofre/configuração operacional foi
aberto; o observador verificou somente metadados de registros Windows.

O uso da máquina atual é tecnicamente possível com namespace exclusivo e os
comandos já preparados; envolve pastas/serviço/registros Windows da fixture e
exige aprovação administrativa. Não é homologação em uma máquina descartável,
nem autoriza alterar o agente operacional ou as bases de negócio.

O procedimento das duas fases está no agente em
`docs/implemente/plano_auto_update_evolution.md`. Conservar estado falho ou
incerto, sem reiniciar automaticamente o instalador. HTTPS/ChatGPT continuam
manuais; `ready:false` e todos os gates de produção permanecem bloqueados.
