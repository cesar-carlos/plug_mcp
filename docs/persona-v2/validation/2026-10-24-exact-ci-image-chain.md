# Imagem exata do CI e cadeia persistente — 2026-10-24

## Resultado e alcance

**85/85 testes aprovados, sem filtro, em 714,35 s**, com runtime MCP em container,
hub Prisma, agente e três bancos de fixture. Inventários antes/depois idênticos.
Janela: 08:52–09:04 (America/Cuiaba). As evidências preservam timestamps UTC.
Não constitui aceite completo dos 13 gates nem autorização de produção persona-v2.

- MCP `a6af43168223e74640fcf73e33b1df42e48fb58a`;
  [CI 40093795739 aprovado](https://github.com/cesar-carlos/plug_mcp/actions/runs/40093795739).
- Hub isolado `da457e05e3fd4ee407d7aefb2c58d82c7e6d92f5`;
  [CI 40092383266 aprovado](https://github.com/cesar-carlos/plug_server/actions/runs/40092383266).
  REST/Socket passaram na repetição controlada; a primeira falha permanece histórica.
- Agente isolado `e992cbaa35fef6c764dfea4a1dab9550bff66f59`.
- [Inventários completos](../../validation/2026-10-24-exact-ci-image-chain/image-sources.json),
  [runtime da fixture](../../validation/2026-10-24-exact-ci-image-chain/candidate-image.json)
  e [versões reportadas pelo RPC](../../validation/2026-10-24-exact-ci-image-chain/engine-versions.json).

| Motor        | Versão reportada pelo RPC | Driver Windows            |
| ------------ | ------------------------- | ------------------------- |
| PostgreSQL   | `17.0.11`                 | psqlODBC `18.00.0000`     |
| SQL Server   | `16.00.4236`              | ODBC Driver 18 `18.6.1.1` |
| SQL Anywhere | `16.00.0000`              | `16.0.0.2043` (64-bit)    |

Versões RPC são reproduzidas literalmente; não inferem granularidade de patch
que o contrato não retornou. Fixtures usam credenciais privilegiadas: não provam
identificação sob um usuário de banco com permissões mínimas.

## Origem e identidade da imagem

Artefato GitHub `12560465835`, `persona-v2-tested-image-amd64`, da revisão MCP acima.
Download único por `gh run download`, sem reconstrução ou publicação. O digest
ZIP informado pela API é `a52ed4bbb8cc1a46c794e0b39af6cdd7ed2f5283976e717a1c582c264c0bdf95`;
o ZIP não foi preservado pelo downloader, portanto esse valor não é hash local aferido.

A [prova original do CI](../../validation/2026-10-24-exact-ci-image-chain/image-proof.json)
foi preservada. Tar local: 356647936 bytes, SHA-256
`451f01d820a7a6b65cd954c32e282f2c54b5bf100e32d3888381c863d3d5c840`.
Config digest da prova:
`sha256:9fb4d4e34d0c47312ad5a6f569958e2d8a3447b54caf002eff1a11d63673bc3c`.
Manifest OCI carregado:
`sha256:be0e52fb4378b0d8db15bbb137a91ae125a1abf4b80b5b868a582cfd489e9562`.

Docker clássico e containerd identificam essas representações de maneira diferente.
A correção do verificador exige o manifest no tar já verificado, digest/tamanho
exatos e referência à configuração original, além de revisão, plataforma e runtime.
Não aceita equivalência por tag. Passaram 26 regressões de integridade/origem,
verificação no artefato real, tipos, lint, formatação e documentação.

## Falhas preservadas e correção de ambiente

1. Uma rodada anterior, MCP `639bb2d`/hub `8f7cf8a`, terminou com 68 aprovados e
   17 falhos. O checkout compartilhado do hub mudou durante a execução; inventário
   final divergente invalidou a rodada. Não é prova estável do candidato.
2. [Rodada por fontes a6af431](../../validation/2026-10-24-exact-ci-image-chain/source-failed.json):
   84 aprovados, um falho no login Chromium; inventários estáveis. Faltava o build web.
3. Após gerar os assets, a [repetição dirigida](../../validation/2026-10-24-exact-ci-image-chain/browser-hidden-path-failed.json)
   ainda falhou (um falho, outros 84 não executados por filtro). A raiz do worktree
   continha `.cache`: `sendFile` com caminho absoluto retornou 404. Reprodução
   HTTP efêmera confirmou 404 nesse caminho e 200 com raiz explícita.
4. Moveu-se somente o worktree próprio para um caminho sem diretório oculto.
   [Percurso dirigido aprovado](../../validation/2026-10-24-exact-ci-image-chain/browser-corrected.json):
   um aprovado, outros 84 não executados por filtro, inventários estáveis.
   Nenhuma asserção, timeout ou controle de arquivos ocultos foi alterado.
5. Rodada integral final na imagem: 85/85, sem filtro. Não somar contagens das
   repetições como cobertura adicional.

Cada rodada utilizou fixture nova. Limpeza pelo script de ownership confirmou a
remoção dos containers, volumes exclusivos, processo SQL Anywhere, DSN e diretório
privados. Serviços operacionais, tokens e bases de negócio foram preservados.
Imagens e evidências sem segredos foram conservadas; manifests com credenciais
não integram este relatório.

## Matriz de alcance por gate

| Gate                                  | Comprovado neste recorte                                                                           | Lacuna / limite preservado                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| shared-knowledge-and-compatibility    | Inspeção, perfis, adoção, curadoria, histórico e revogação na cadeia e suítes CI                   | Não certifica toda extensão SQL ou todas instalações Data7                                                                          |
| identity-and-authorization            | Identidade, permissões, CAS, consentimento, delegação e revogação                                  | Falta prova de mínimos privilégios do usuário DB e alcance exato dos procedimentos DBA de cópia/restauração                         |
| training-and-local-query              | Publicação, runners, consulta, classificação, limites, cache/anexos e percurso Chromium            | `scripts/evaluate-consumer.ts` ainda usa domínio legado: falta avaliação de IA consumidora v2 identificada                          |
| federation                            | Consultas publicadas, cruzamentos PostgreSQL/MSSQL e PostgreSQL/SQL Anywhere, limites/proveniência | Não substitui avaliação semântica da IA                                                                                             |
| agent-operation-journal               | DML, deduplicação, confirmação perdida, reinício com journal e acompanhamento                      | Crash durante commit e conclusão nativa tardia exigem prova específica; perda de confirmação injetada não equivale a esses cenários |
| hub-operation-contract                | Pin/snapshot/contrato, CI hub e transporte persistente na imagem                                   | CI sem `RUN_DART_SQL_OPERATION_TRANSPORT` não comprova sozinho recuperação Dart nativa                                              |
| operation-approval-and-reconciliation | Aprovação Client, preparação, concorrência, rollback, unknown, conciliação e retenção nas suítes   | Não aprova operações de negócio nem autoriza repetição de unknown                                                                   |
| external-rest-and-mcp                 | Adapters, setups, descoberta/importação, publicação, conciliação e editores cobertos pelo CI       | Fixtures TLS não comprovam homologação pública de provedores exigida pelo aceite                                                    |
| oauth-and-console                     | OAuth/consentimento/revogação e percurso real na imagem; CI Chromium                               | HTTPS/ChatGPT manual e aceite funcional humano dispensados por DV2-015, não aprovados                                               |
| postgres-real                         | Cadeia nativa integral no motor/driver registrados                                                 | Escopo das fixtures declarativas, sem certificação irrestrita de SQL                                                                |
| mssql-real                            | Cadeia nativa integral no motor/driver registrados                                                 | Mesmo limite de escopo                                                                                                              |
| sybase-real                           | Cadeia nativa integral, UUID e constraints no motor/driver registrados                             | Não extrapolar outras versões; prova insuficiente continua bloqueando                                                               |
| coordinated-cutover                   | Artefato CI exato, runtime empacotado, inventários e limpeza                                       | Não houve corte MCP-v2, restauração com chaves/revogações/unknown ou publicação de instalador do agente                             |

Suítes e cenários: [cadeia](../../../tests/homologation/persona-chain.test.ts),
[percurso Chromium](../../../tests/helpers/persona-chain-browser.ts),
[matriz de aceite](../acceptance.md) e [contrato de evidências](../release-evidence.md).
As jornadas já implementadas não voltam a ser classificadas como implementação
pendente por ausência de aceite formal.

O diff do agente `3bfad1ae..e992cba` não altera RPC, stores, drivers, pubspec ou
fixtures de homologação. Em `lib`, muda apenas o ciclo de processos de ações,
relacionado à captura de stdout/stderr. Isso permite revisar reaproveitamento de
provas do journal, mas os nove casos históricos precisam registro/hash e alcance
comprovados; não foram aceitos automaticamente neste relatório.

## Corte restrito do hub

A atualização somente do hub foi autorizada e executada pelo chat responsável,
sem publicar MCP/agente. Seu alcance e recuperação estão no
[registro do hub](https://github.com/cesar-carlos/plug_server/blob/19afd26/docs/decisions/2026-10-24-server-only-dependency-release.md).
A exceção não encerra os 13 gates nem altera `ready:false` no MCP. Backup/restauração
de arquivos do hub não equivale a restauração de banco ou a corte persona-v2.
