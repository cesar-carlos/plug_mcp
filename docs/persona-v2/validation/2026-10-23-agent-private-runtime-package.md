# Aplicativo novo e pacote privado com runtime compatível — 2026-10-23

## Resultado

A montagem isolada do aplicativo e o empacotamento privado terminaram com
sucesso. A inspeção atual reconferiu a prova de fontes, os binários e o pacote.
Devolveu `applicationSourceVerified:true`, mantendo `buildSourceVerified:false`,
`installationPerformed:false` e `installedState:not_checked`.

Isso resolve, para este build privado, a incompatibilidade que impediu a
[tentativa anterior](2026-10-23-agent-source-build.md). Não comprova instalação,
atualização ou recuperação instaladas, nem promove o pacote anterior.

## Runtime privado, sem instalação no host

O cache local de instalação continha o pacote Microsoft
`vc_runtimeMinimum_x64.msi` e seu `cab1.cab`, versão **14.50.35719.0**. A assinatura
Microsoft do MSI foi validada. `expand.exe` extraiu somente as oito DLLs previstas
para uma raiz nova protegida; nenhuma ação MSI foi executada.

Cada DLL foi conferida quanto a assinatura Microsoft válida, imagem PE AMD64,
versão mínima e hash estável. O manifesto exige versões iguais e inventário
exato. A releitura repete as verificações, recusando links e conteúdo alterado.

O build aceita esse material somente por `--runtime-manifest`. Uma declaração
CMake privada fixa `MSVC_REDIST_DIR`; o cache real confirmou esse caminho e o
`CMAKE_TOOLCHAIN_FILE` da fixture. A guarda de compatibilidade C++ permaneceu
ativa. A prova do aplicativo também exige os hashes dessas DLLs no payload.

Não houve cópia de DLLs do System32, atualização do Visual Studio ou alteração do
runtime instalado. A orientação de compatibilidade é a da
[Microsoft](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170);
o uso dos arquivos redistribuíveis segue sua
[documentação própria](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170).
Esta fixture privada não autoriza distribuição pública ou produção.

## Artefatos e vínculo

Raízes relativas ao agente, mantidas para inspeção:

- Runtime: `build/homologation/windows-lifecycle-runtime-d055394996ca`.
- Aplicativo: `build/homologation/windows-lifecycle-app-d0742b655205`.
- Pacote: `build/homologation/windows-lifecycle-sb-2b6a102aab41`.

Identidade privada: `PlugAgenteHomologacao_5f9733521924`.
O commit exportado foi `c1f21e992eb82ef1843fea007d671a972f371b6b`; a prova cobre
**2.677 arquivos de entrada**, incluindo o ambiente sintético explícito. O build
usou o entrypoint de bootstrap revisado, dependências offline com lock obrigatório
e cache nativo publicado conferido. Não compilou o checkout/DLL original nem
incorporou as alterações concorrentes da outra tarefa.

| Vínculo               | SHA-256                                                            |
| --------------------- | ------------------------------------------------------------------ |
| Recibo do aplicativo  | `65aba97624f77c9b0c2e5bb1b7bedb1661e6988a3c04ae01657f92748e1dd516` |
| Árvore de fontes      | `bd32c17d326cbd847e30eb01b62388a6ec683239b8045a80f9ac8c08618b0aea` |
| Payload do aplicativo | `c1aaa548ab256fa18394342172227dbf2d4079dd3ba1fa79d408327d0b0e2ce6` |
| Instalador privado    | `1e81f5127da56cb2353bf5e50457507d32a2346ea7bebacdc62645d3eea2ebe2` |
| Payload do pacote     | `e072dcd9a05ae6f4d7dc4501abe65b7d7298653917a6d5f654c7984d103a62e3` |
| Manifesto de runtime  | `cba89c0a98a2adbefc423516b6d4cb5d99e8e83b4c6f8683b717afc1aaf46b81` |
| MSI de origem         | `57d65221ca418dabfcc6320215b2c05eec907690aa4f93384f2007eb9e1394b0` |
| CAB de origem         | `c346d91193246b18301cce532f2ae784fb377cb068d77bd22edec238e5746aa7` |

Aplicativo e pacote têm **93 arquivos** cada. Os três executáveis do updater
foram recompilados com a chave própria da fixture; os demais arquivos permanecem
vinculados à prova do aplicativo. O supervisor histórico continua fixado no
commit `fdb44d86b2a36df85c0133cf72167217fc1bd16e`.

## Validação executada

- Build Flutter Windows Release concluído em **179,5 s**; helper elevado
  compilado e verificação do bundle nativo aprovada.
- Empacotamento C++/Inno e compilação histórica concluídos; leitura atual do
  manifesto reconferiu origem e integridade sem executar fases de instalação.
- Teste negativo do executável privado, sem contexto de bootstrap: saída com
  código **1**, em **133 ms**. O ramo nativo revisado recusa antes da janela,
  controle do updater e entrada Dart. Não substitui teste positivo de bootstrap.
- **114 testes** do tooling de atualização aprovados, sem omissões, em 14,604 s.
- **14 regressões** de workflow aprovadas, sem omissões, em 0,172 s.
- Sintaxe Python e `git diff --check` aprovados, com avisos de normalização
  CRLF/LF nos arquivos rastreados. Nenhum index foi alterado.

As regressões incluem assinatura/publisher inválidos, arquitetura e versão
incompatíveis, modificação de bytes/manifesto/toolchain, tentativa de injeção no
CMake, hard link recusado antes da leitura e payload sem o runtime vinculado.
Os testes novos foram integrados ao job Windows existente; não houve CI remoto.

## Limites e próximo passo

O instalador não foi executado. Não houve serviço registrado/iniciado, acesso a
perfil operacional, ensaio de DML, UAC, commit, push, publicação ou deploy.
Artefatos e chave sintética permanecem nas raízes privadas; não são release.

Continuam pendentes bootstrap positivo do aplicativo compilado e homologação
instalada de atualização/recuperação com dados de fixture e contexto autorizado.
As evidências anteriores da cadeia dos três motores e da sessão de treinamento
mantêm seus próprios snapshots; não são recertificadas por esta rodada.
HTTPS e ChatGPT permanecem manuais. Nenhum gate foi concluído; `ready:false`.
