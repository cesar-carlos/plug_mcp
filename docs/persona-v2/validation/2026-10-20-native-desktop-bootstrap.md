# Revalidação do bootstrap desktop nativo — 2026-10-20

Alvo `plug_agente/tool/homologation/desktop_bootstrap_fixture.dart` recompilado
em Windows debug com Flutter, sem alterações no código do agente/hub.
Bundle completo copiado para `build/homologation/desktop-bootstrap`.
Não foi iniciado o perfil operacional; os testes criaram perfis temporários
próprios e os removeram em `finally`.

## Resultado

`vitest.desktop-bootstrap.config.mjs`, no hub, com
`RUN_NATIVE_DESKTOP_BOOTSTRAP=true` e `PLUG_AGENTE_ROOT` explícito:
**dois arquivos e dois testes aprovados**, início 12:57:21, 91,05 segundos.
Node 24 do wrapper do MCP; Vitest 5.0.4 do hub.

- Perfil vazio: AppInitializer, DI, primeira renderização, cofre DPAPI,
  integridade SQLite, descoberta RPC, encerramento e novo processo.
- Perfil configurado: configuração privada persistida, sessão restaurada e
  refresh pelas rotas reais do hub antes/depois do reinício. O segundo processo
  não recebe o seed de credenciais. Identidade da instalação/configuração
  preservada, identidade da sessão nova e encerramento verificado.
- Operações SQL permanecem desabilitadas e não anunciadas.

## Identificação dos artefatos

Checkouts com alterações locais; hashes identificam os arquivos exercitados,
não um commit, release ou inventário integral:

| Artefato                                           | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| Executável debug `plug_agente.exe`                 | `a755f1f9c262f07952c1b43c2944b3254eebd05b24d05b2a88352859b8c1ec4d` |
| `desktop_bootstrap_fixture.dart`                   | `c4b88aa931bab28092890c97f164d22e9c10905e3858e94a29e6ca3ca2227fb7` |
| `configured_desktop_bootstrap.integration.test.ts` | `8c84405dc92d3a1b61804a6f41af2ce8fa9d85c0c8b4ec06e2312e4fa3cfabcb` |
| `desktop_bootstrap.integration.test.ts`            | `29c5201865c90791f12539bc9739314364c0cd6e6b08dc6cfac2c898313c0bdb` |

Logs locais: `node_modules/.cache/persona-desktop-bootstrap-build.log` e
`node_modules/.cache/persona-desktop-bootstrap-current.log`.

## Limites

O hub desse runner usa autoridade em memória. O alvo SQL Server do perfil
configurado é deliberadamente inacessível em loopback; este teste não executa
consultas de negócio. Não substitui a cadeia Prisma dos três motores, o
instalador completo, upgrade/desinstalação, ativação por logon/protocolo,
concorrência entre processos no cofre ou instalação de produção.

Registros de notificações/atualização e reparo de autostart permanecem isolados
ou desabilitados no alvo; não foram homologados por esta rodada. A compilação
terminou com avisos nativos, incluindo C4702 em `windows/updater/service_main.cpp`;
não se declara build sem avisos nem aceite do atualizador.

O plano deve separar bootstrap nativo implementado/revalidado dessas pendências,
sem anunciar sua ausência ou conclusão integral da etapa. Deploy, publicação
de imagens e instalador/appcast continuam bloqueados. Nenhum gate encerrado.
