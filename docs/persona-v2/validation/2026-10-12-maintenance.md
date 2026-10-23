# Manutenção de persona e fontes — 2026-10-12

Rodada da entrada de desenvolvimento `main-persona-v2.ts`, na branch existente,
com alterações locais preservadas e sem commit/push/deploy. Base Git MCP:
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`.
O HEAD sozinho não identifica o candidato; hashes dos componentes principais
estão abaixo. Regras/contrato: [onboarding](../onboarding.md),
[catálogo](../catalog.md) e [matriz de aceite](../acceptance.md).

## Entrega exercitada

- Edição de persona sem fonte, especialidade e instruções, com versão/CAS.
- Edição de metadados e recortes físicos da fonte, preservando sua identidade.
- Troca cifrada de credenciais após verificação pelo port do hub/agente,
  sem rede dentro da transação MCP, com nova validação do responsável e versão.
- Suspensão das publicações locais e dependências transitivas da fonte editada,
  preservando fontes independentes e vínculos de outras personas na mesma base.
- Prova divergente de identidade suspende vínculos conhecidos; falha de
  autenticação/transporte não modifica credenciais nem presume troca de banco.
- Hash de pacote novo de consulta inclui fingerprint da fonte: relatório antigo
  não aprova republicação após troca de credenciais, mesmo com SQL/capacidades iguais.
- Descarte de JWT e login em voo da credencial editada, sem reutilização tardia.
- Console edita, troca credenciais, republica e consulta; conflito preserva campos
  até recarregamento explícito. Segredos ficam fora de respostas e auditoria.

Nenhuma migration aplicada foi alterada. As novas mutações usam colunas existentes
e a mesma unidade de trabalho com locks de persona antes de token. Snapshots e
relatórios históricos são preservados; tokens não recebem permissões novas.
Não há tool MCP nova de administração nem recebimento de credenciais por tools.

## Ambiente e isolamento

Windows/PowerShell, Node **24.21.0**, TypeScript **7.0.2**, `pg` **8.23.1** e
Playwright **1.63.0** com Chromium. As fixtures usam imagem `postgres:17-alpine`,
container novo `persona-maintenance-<UUID>`, senha aleatória, porta local dinâmica
e bancos próprios com sufixo `_test`. O runner não registrou `server_version`
ou digest de imagem nesta rodada; esses dados serão necessários no aceite do motor.

PostgreSQL de controle e dados das duas fontes do navegador são reais e
descartáveis. A autenticação/hub dos testes é sintética. O teste de manutenção
injeta `SourceVerificationPort`; o navegador usa `PlugServerGatewayPort` sintético
que consulta somente suas bases PostgreSQL próprias. A composição normal continua
usando REST do plug_server; não foi criado um adapter de acesso direto ao ERP.

Os containers desta rodada foram removidos pelo bloco `finally`; o container
PostgreSQL preexistente foi preservado. Não foram usadas fontes cadastradas,
credenciais operacionais, armazenamento do hub/agente ou bases de negócio.

## Resultados

| Verificação                     | Resultado                                                               |
| ------------------------------- | ----------------------------------------------------------------------- |
| `node:check` / `compiler:check` | Node e TypeScript reais aprovados                                       |
| `typecheck`, `lint`, `build`    | Aprovados                                                               |
| `training:check`                | Base/contrato fixado aprovados, em leitura do checkout do hub           |
| `test:persona-v2`               | 238 testes aprovados                                                    |
| `npm test`                      | 1.120 aprovados; 91 opcionais omitidos conforme configuração existente  |
| `test:persona-v2:postgres`      | 78 aprovados em seis arquivos, incluindo nove casos novos de manutenção |
| `test:persona-v2:browser`       | Cinco cenários aprovados no Chromium, incluindo conflito e republicação |
| `web:check`                     | Lint, tipos, 23 testes e build aprovados                                |
| Formatação / `docs:check`       | Arquivos tocados e contratos documentais aprovados                      |

Tentativas no sandbox encontraram restrições de arquivos temporários e conexões
locais (`ENOENT`/`EACCES`). Os testes foram reexecutados com temporários no workspace
e permissão para servidores/fixtures locais, sem enfraquecer assertions ou gates.
As omissões da suíte geral não substituem suítes obrigatórias de homologação.

Os testes PostgreSQL cobrem CAS concorrente, preview obsoleto, snapshot imutável,
suspensão transitiva, fontes/personas independentes, cifragem e ausência de segredo
em respostas/auditoria, falha upstream, identidade divergente, relatório obsoleto,
mudança durante verificação, responsável revogado e controles de navegador.
O teste de JWT cobre invalidação de login pendente e isolamento do novo login.

## Identificação do candidato

SHA-256 dos componentes principais; paths são relativos à raiz MCP.

| Arquivo                                                   | SHA-256                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/application/persona-v2/maintenance.ts`               | `912e837753fcd3e2a051e1367275041858fcd9082b3f61c1741e20ffb1edf56e` |
| `src/application/persona-v2/query-training.ts`            | `58731e91f0905301ca839f6b0f497d445c87f220a001d418db4c319a9c36fee0` |
| `src/infrastructure/persistence/persona-v2/repository.ts` | `dd768d315b17e8ea8f7d846f9024e01005e6c1fe93266927de54ad9c23de583a` |
| `src/infrastructure/plug-server/source-token-manager.ts`  | `660763493ecc85d611afef46ff13d191a587a82dc83e68b4e217f65b1a219d46` |
| `web/src/persona-v2/SourceSettings.vue`                   | `540805d1376da4d47db094c5f2ef4fb478458fbe08a514d6cc6a0348862993f6` |
| `tests/persona-v2/maintenance.postgres.test.ts`           | `e2d64df03f0884c4edba02fb41bcea3277e4998f769e099af14a3aff9fa16c1e` |
| `tests/persona-v2-browser/persona.spec.ts`                | `020719d3683c851f5271fdce8f52d64f509f90894d9de80f298798ba0a25ea8f` |

## Limites e trabalho seguinte

Esta rodada não homologa os quatro motores, instalação persistente do hub/agente,
troca de credenciais na cadeia REST/Socket.IO/ODBC real ou resposta da IA consumidora.
As evidências da [cadeia isolada anterior](2026-10-12-chain-four-engines.md) mantêm
seu próprio candidato e alcance; não são automaticamente promovidas para esta revisão.

Permanecem pendentes runner de consultas, runners de publicação dos outros motores,
treinamento MCP autorizado, curadoria/grafo completos, classificações por campo/token,
administração por delegação, OAuth, integrações, demais jornadas e operação/corte.
Suspensão/recuperação administrativas e reenrolamento ainda não foram implementados.
O que ainda falta está no [trabalho restante](../remaining-plan.md) e na [matriz de aceite](../acceptance.md).

Os três manifestos continuam com **`ready: false`**, nenhum gate concluído e
13 gates exigidos. Nenhuma evidência desta rodada libera deploy ou imagem.
