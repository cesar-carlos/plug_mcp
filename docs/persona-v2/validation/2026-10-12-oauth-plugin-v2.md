# OAuth v2 e candidato do plugin — 2026-10-12

Evidência parcial de desenvolvimento para `oauth-and-console` e
`coordinated-cutover`. Não encerra gates. O manifesto permanece `ready: false`,
`completedGates: []`; deploy e publicação de imagens continuam bloqueados.

## Revisão e ambiente

HEAD MCP: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais
preexistentes e desta rodada sem commit. Os hashes identificam os arquivos
efetivamente verificados; HEAD sozinho não representa o candidato. Hub e agente
não foram alterados ou homologados novamente nesta rodada.

Windows/PowerShell, Node **24.21.0**, TypeScript real **7.0.2**, Vitest **5.0.3**,
Playwright **1.63.0**, Chromium **153.0.8010.12**, pg **8.23.1** e PostgreSQL
**17.11** (`postgres:17-alpine`). Container exclusivo, porta loopback dedicada,
bancos aleatórios com sufixo `_test` e credenciais somente de fixture. Nenhuma
fonte cadastrada ou base de negócio do usuário foi utilizada.

O navegador utilizou HTTPS nativo com certificado sintético fixado. O leitor
CIMD verificou TLS e metadados; resolução/classificação DNS pública foi simulada
para alcançar o servidor local dedicado. Isso não comprova TLS/DNS público.
Autoridade Client/hub e transporte de consulta foram sintéticos nas suítes.

## Entregas verificadas

- OAuth próprio da v2, opcional e desabilitado por padrão: discovery,
  `se7e:persona`, allowlist específica, resource fixo `/mcp/chatgpt`, redirects
  exatos, PKCE S256, consentimento explícito e interseção de permissões.
- Transação de 15 minutos, código de 60 segundos, access token de 15 minutos,
  concessão de até 30 dias limitada pelo originador e refresh rotativo. Replay
  comprovado revoga a família; cliente/verificador incorretos não a revogam.
- Persistência cifrada v2, hash de identificadores opacos, locks ordenados,
  auditoria transacional e migration aditiva `0009_oauth_integrity.sql`.
  Revogação e consumo são irreversíveis; rollback também desfaz auditoria.
- Isolamento entre Bearer manual e OAuth. `get_profile` entrega identidade opaca
  estável; `revogar_conexao_chatgpt` encerra somente a conexão atual, com receipt
  terminal. O MCP anuncia schemas, scope e challenge de reconexão.
- Consulta usa concessões vigentes e revalidação antes da entrega: fonte não
  concedida foi recusada antes do envio; revogação durante leitura descartou
  resultados. Este caso usa PostgreSQL real e transporte sintético.
- Montagem/validação offline da variante ChatGPT v2 separada da portátil e do
  legado, catálogo correspondente e skills atualizadas. IDs usados nos testes
  são exclusivamente de fixture; nenhum pacote foi instalado ou distribuído.
- Console informa disponibilidade e permite copiar endereço sem Bearer.
  Credenciais entram no formulário HTTPS; não são refletidas, persistidas no
  navegador ou incluídas no pacote.

Administração por OAuth permanece bloqueada até a delegação revogável do
responsável no hub. Aprovação humana não é delegada pelo consentimento OAuth.

## Resultados

| Verificação                                                                        | Resultado                                                                                           |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Suíte PostgreSQL v2 completa, 8 arquivos                                           | 124 testes aprovados                                                                                |
| Repetição das suítes afetadas após ajuste final de replay/base técnica, 2 arquivos | 58 testes aprovados: 26 OAuth e 32 consultas                                                        |
| Unidade v2, pacote, OAuth legado e TLS nativo, 28 arquivos                         | 330 testes aprovados                                                                                |
| Repetição de unidade v2/pacote após atualização de instruções, 25 arquivos         | 280 testes aprovados                                                                                |
| Chromium OAuth HTTPS, execução final completa                                      | 3 cenários aprovados: consentimento/perfil/revogação, cancelamento/erro seguro e console/cópia      |
| Chromium console manual, cenário de conexão afetado                                | Aprovado, incluindo OAuth desabilitado                                                              |
| `web:check`                                                                        | Lint, tipos, 28 testes em 10 arquivos e build aprovados                                             |
| Lint, typecheck e build do servidor                                                | Aprovados                                                                                           |
| `node:check`, `compiler:check`, `training:check`                                   | Aprovados; consulta Git do contrato do hub executada somente para leitura                           |
| Formatação integral                                                                | Aprovada antes do registro desta evidência; arquivos documentais conferidos novamente ao final      |
| `docs:check`                                                                       | 76 arquivos, 443 links, 19 rules, 17 exemplos JSON, 19 exemplos de schema, 14 gates; zero problemas |
| `persona:release-check`                                                            | Recusou publicação conforme esperado (`ready: false`)                                               |

Totais sobrepostos não devem ser somados. Comandos principais: wrapper
`scripts/with-project-node.ps1`, Vitest com `vitest.persona-v2.config.ts`, Vitest
unitário, Playwright `tests/browser/persona-v2-oauth.spec.ts`, `web:check`, lint,
typecheck e build. PostgreSQL exigiu `PERSONA_V2_TEST_DATABASE_URL` explícito;
TEMP/TMP foram direcionados à pasta de cache de testes do workspace.

O Chromium encontrou bloqueio de redirect pela CSP: a página de consentimento
foi corrigida para aceitar somente a origem do redirect validado. A repetição
completa passou. Um seletor de navegação do teste foi ajustado para aguardar a
sessão carregada; não houve afrouxamento de autorização.

## Identificação dos arquivos

SHA-256 dos arquivos efetivos:

| Arquivo                                              | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `src/application/persona-v2/oauth.ts`                | `CBBDCBB18619BFE301351BB3A69DA4E3F4FF8442708A1D01F0A4615BB367860D` |
| `src/infrastructure/persistence/persona-v2/oauth.ts` | `2C103D63C2532AF1BBC3D7FA73B0F8F37465C1641C7203BDA0063BFA24976E02` |
| `src/infrastructure/http/persona-v2-oauth.ts`        | `23FBB7D7973173B04C1BBE02EA910384169C056E34AC8DD61C1C2F1BD4B15CC6` |
| `src/infrastructure/mcp/persona-v2-http.ts`          | `FC8910875CFC1478429A31000E1C90A35E28A88A79DEE618D91118458F6DA1FE` |
| `src/infrastructure/plugins/tool-catalog.ts`         | `7029B422AD7D1A4E15B866EE8BC09418F65AAF92328573E6C7772E136F8ADD65` |
| `migrations/persona-v2/0009_oauth_integrity.sql`     | `71A9C14A7A7AAE91D14BF10554563885FFB30A7FD55F7F69F188EB2E5A0BAC1B` |
| `src/application/persona-v2/training-base.ts`        | `E90A6D9B8E12D3599A872D3454E6845C3E113316AB3793C4D1731FD3B0C13FF7` |
| `contracts/persona-v2-release.json`                  | `212DC6BB71232A8BDB8FFE57E5AC78CD21C152B5383EF8689D3C8DF55ED0CBCD` |

Contrato do hub preservado: commit-base
`0d2c6b488438a77be71b39e514cd06ab11fbb95e`, snapshot
`4b246fc8a79eac0f2273eb9da2b1cf458cb2e6ec3ae46e6c81735a8c362b36fc`.
Snapshot não é commit upstream. A base técnica v2 passa a
`persona-v2-oauth-1`; publicações existentes não adotam a versão automaticamente.

## Limites e limpeza

Não houve instalação privada no ChatGPT, conversa nova no cliente real,
provisionamento de conexão real ou teste com endpoint público de homologação.
Ainda faltam essas evidências, setups temporários, administração/delegação no
hub, gestão completa de conexões e rotinas operacionais do worker. Esta rodada
não homologou a cadeia persistente nos quatro motores, integração externa ou IA
consumidora. [Contrato](../oauth.md) e [plano restante](../remaining-plan.md).

O container `se7e-oauth-v2-fixture-20261012` foi removido ao final com seu único
volume anônimo, após conferir rótulo `se7e.fixture=oauth-v2-20261012`, imagem e
identificador do volume. A ausência de ambos foi verificada. Servidores e bancos
temporários das suítes foram encerrados. Outros containers, volumes, cadastros,
conexões e armazenamentos foram preservados. Nenhum deploy, push, publicação de
imagem ou instalação de plugin foi realizado.
