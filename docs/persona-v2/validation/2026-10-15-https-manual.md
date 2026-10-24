# Preparação HTTPS e conexão manual — 2026-10-15

Evidência parcial de desenvolvimento. `ready: false`; nenhum gate encerrado.

## Inspeção e decisão

O DNS local não resolveu `homolog-mcp.se7esistemassinop.com.br` nesta rodada.
Isso não prova a ausência global do registro. Os domínios operacionais resolveram
para o servidor existente; a tentativa SSH com alias configurado e autenticação
não interativa foi recusada. Nenhuma configuração remota foi alterada.

O operador determinou deixar DNS/servidor e conexão ChatGPT para validação manual.
Não foram feitas novas tentativas de provisionamento após essa decisão.

O plugin privado pessoal Se7e foi localizado e seus metadados lidos: versão 1.0.0,
release `PluginRelease_75d4e52f45608191b2a0bf7334468236`, plugin
`plugin_asdk_app_6ac574cb9a9c8191bc9befc42318598c`. A fonte retornada contém apenas
`.app.json` e `.codex-plugin/plugin.json`. Esses arquivos identificam a app,
mas não comprovam URL remota, ambiente, OAuth v2 ou instalação do pacote local
com skills. Não se reutilizou esse ID como se fosse uma conexão de homologação,
não se alterou a app e não se publicou atualização do plugin.

## Implementação local

`persona:https-check` é separado do verificador legado. Recebe argumentos
explícitos, não carrega `.env`, não consulta banco nem recebe credenciais.
Confere contratos OAuth v2 e challenge usando o transporte HTTPS limitado já
existente. Pilot verifica também CIMD e pacote persona-v2/ChatGPT correspondente.
O relatório nunca certifica conexão real, isolamento da infraestrutura ou release.

Nove testes passaram: argumentos/origem isolada, ausência de autoridade por
discovery, recusa de scope/issuer/endpoint/PKCE/audience divergentes, challenge,
redirect/erros sem vazamento e vínculo de pacote/CIMD. Usam dependências
sintéticas; não são evidência HTTPS pública. Tipos, lint, build, formatação e
`docs:check` passaram. O guard de release recusou publicação como esperado.

Commit-base MCP: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais
preservadas. Inventário parcial do código desta entrega (SHA-256):

| Arquivo                                    | Hash                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| scripts/homologation/persona-https.ts      | `8319905b76defab06146f4b494574510b6e490fae16ac1cbf27098c2d13507d3` |
| scripts/check-persona-https.ts             | `4cda1cc7b69eb60db4978ee8c4021f5d534a84a403068b4c01135b7eadc4796c` |
| tests/unit/persona-https-readiness.test.ts | `063cdf52dffc42d5ba18d8af499d144247963da61e9c74134a338c75cecbe4f7` |

Node 24.21.0 e TypeScript 7.0.2. Sem fixture de banco nesta rodada; os nove
testes duraram 1,75 segundo. Não se reutiliza o resultado da cadeia anterior
como comprovação de HTTPS público ou instalação do cliente.

## Pendências

Executar o [roteiro manual](../oauth.md#homologação-https-e-conexão-manual):
infraestrutura dedicada, DNS/certificado/proxy, allowlist real, conexão privada,
consentimento, conversa nova, consulta publicada e revogação isolada. Registrar
evidências sanitizadas do candidato exato e avaliar a IA separadamente.

Não houve deploy, publicação de imagem/pacote, transferência de credenciais,
SQL de negócio ou alteração do manifesto de liberação.
