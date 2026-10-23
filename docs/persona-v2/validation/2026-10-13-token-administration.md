# Administração por token e tetos delegados no hub

Rodada de 2026-10-13, America/Cuiaba. Avanço parcial da etapa 3 do
[plano restante](../remaining-plan.md). Nenhum gate foi encerrado; deploy,
imagens e corte continuam bloqueados.

## Candidato e contratos

| Projeto | HEAD de referência                         |
| ------- | ------------------------------------------ |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` |
| Hub     | `0d2c6b488438a77be71b39e514cd06ab11fbb95e` |
| Agente  | `570e797b728eafa1cdc950be5e446ab7dd1c497c` |

Checkouts contêm alterações locais; HEAD não identifica sozinho o candidato.
O [inventário de arquivos centrais](2026-10-13-token-administration-files.json)
registra SHA-256 de código, contratos e testes desta rodada; não é inventário
completo dos checkouts nem aceite de release. Sem commit, push ou deploy.

Contrato REST aditivo **1.8.0**, SHA-256
`3c55b34913e46cdc8e7b7758b89f0b90697bf861f692d29101561fe458cb4b91`.
Patch reproduzível dos contratos contra o commit-base do hub:
`9694c856d5b32a60271cd1771f0bf71293a82d08610afccfb9d3a097dafc4870`.
Snapshot não é commit upstream nem snapshot integral do hub.
Migrations aditivas: MCP 0012 e Prisma `20261013000000_persona_delegation_permissions`.
Delegações anteriores mantêm somente `gerenciar_fontes`; dados privados não
são compartilhados ou convertidos.

## Alcance funcional

- Teto administrativo selecionado pelo responsável, persistido no hub/MCP e
  conferido na prova ativa. Token e consentimento são limites independentes.
- Unidade autorizada para treinamento/publicação privados por sessão, Bearer
  e OAuth; hub fora da transação, locks ordenados, CAS, prazos e revalidação
  local antes do commit. Rascunhos/dependências fora das fontes concedidas
  permanecem invisíveis; preview vincula a autoridade exata.
- Listagem/edição/revogação de outros tokens dentro dos tetos concedidos,
  incluindo consentimento e prazo. Autoedição e privilégios superiores negados.
- Autoria de token/concessão separada do recurso token administrado; histórico
  e auditoria conservam metadados, sem SQL, parâmetros ou segredos.
- Console oferece seleção explícita de permissões, fontes e delegação; OAuth
  oferece somente o subconjunto implementado e consentido. Aprovação de
  lançamentos continua exclusivamente pelo responsável na sessão Client.

## Validação executada

| Verificação                                               | Resultado                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Unitários v2                                              | 263 casos aprovados / 24 arquivos                                         |
| PostgreSQL v2, incluindo upgrade e administração          | 154 casos aprovados / 10 arquivos                                         |
| Cadeia persistente MCP → hub → agente → quatro motores    | 22 casos aprovados                                                        |
| Transporte HTTP, pin do hub, release e pacote             | 42 casos aprovados / 4 arquivos                                           |
| Hub: serviço e HTTP de delegação, autoridade em memória   | 6 casos aprovados / 2 arquivos                                            |
| Chromium: OAuth/consentimento/setup HTTPS                 | 4 casos aprovados                                                         |
| Chromium: emissão administrativa e percurso de duas bases | 2 casos aprovados                                                         |
| Frontend                                                  | lint, tipos, 28 testes e build aprovados                                  |
| MCP                                                       | lint, tipos, build, Node 24.21.0, TypeScript 7.0.2 e docs:check aprovados |
| Hub                                                       | tipos, lint, geração e verificação do contrato aprovados                  |

Totais são de suítes diferentes; não somar para declarar cobertura integral.
Formatação e docs:check aprovados; os três manifestos continuam `ready: false`,
14 gates obrigatórios e nenhum aceito. Não transformar contagem de testes em aceite.

A nova prova persistente cria delegação no hub Prisma real, treina/publica por
tools administrativas nos quatro dialetos e emite concessão explícita separada
para consultar cada publicação. Resultados retornam valores reais da fixture,
origem e completude; o token administrativo permanece sem concessões de execução.
O restante da suíte preserva cruzamentos, DML aprovado, journals incertos,
reinícios e ciclo de vida de fontes. Não equivale à matriz integral de falhas.

PostgreSQL de controle/testes separado; hub Prisma usa banco próprio. Fontes,
policies, identidades, cofres Drift/Windows DPAPI e journals são exclusivos da
fixture. Nenhuma fonte cadastrada pelo usuário foi utilizada.

Imagens da cadeia:

- PostgreSQL `postgres:17-alpine`, ID `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
- SQL Server `mcr.microsoft.com/mssql/server:2022-latest`, ID `sha256:0ec7739e1c5ec2f57861facbe1f2b74f1d3e147c7c97edf91eeea920c5944d9c`.
- Redis `redis:7.4-alpine`, ID `sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499`; não certifica cache distribuído.
- Drivers medidos: psqlODBC 18.00.0000, Firebird `WI-V5.0.4.1812`, SQL Anywhere ODBC `16.0.0.2043 (64-bit)`.

## Falhas corrigidas e limites

A primeira rodada encontrou HTTP 503 local após o hub já revogar a delegação
com HTTP 204. O adapter criava uma Response com corpo em status sem conteúdo;
agora conserva corpo nulo para 204/205/304 e HEAD. Testes HTTP nativos e a rodada
persistente completa foram repetidos e passaram. Não houve repetição de DML
incerto; as rodadas usaram fixtures independentes.

Vitest precisou de TEMP/TMP exclusivos no workspace para evitar desaparecimento
do cache SSR do sandbox. A primeira regressão também encontrou uma expectativa
de ledger anterior a 0012; o upgrade agora confere todos os checksums anteriores
e o teto conservador das delegações existentes.

Permanecem pendentes: emissão/rotação delegadas de tokens pelo navegador,
administração de integrações, extensão às jornadas de manutenção/curadoria
restantes, matriz integral de concorrência/revogação/entrega, instalação desktop,
TLS/DNS público, Redis distribuído, plugin ChatGPT real e avaliação da IA.
A cadeia usa HTTP loopback; a audience HTTPS da prova é conferida na fronteira
da aplicação, não comprova TLS público. Chromium usa TLS nativo e certificado
de fixture; autoridade e DNS CIMD sintéticos não equivalem ao ambiente real.

O plano continua pendente de aceite integral dos 14 gates, com `ready: false`.

## Limpeza

As duas rodadas usaram fixtures independentes, removidas pelo controlador com
checagem de manifesto/propriedade. PostgreSQL efêmero dos testes também foi
removido após confirmar ID e label. Processos, DSN, bases, volumes temporários e
segredos de fixture foram descartados; o container preexistente
`plug_mcp-postgres-1` permaneceu intacto. Nenhum recurso operacional foi alterado.
