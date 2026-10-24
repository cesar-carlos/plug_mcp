# Negociação e transporte de lançamentos

> Relatório histórico extraído do registro consolidado em 2026-10-11.
> Data registrada: Não individualizada. Datas, contagens e limitações não foram reavaliadas
> nesta reorganização. [Índice](../validation.md) · [Estado atual](../README.md).

## Rodada anterior: negociação e transporte de lançamentos

Negociação `sqlOperations` v1 implementada no hub e agente; opt-in do agente
desligado por padrão. REST/`agents:command`/relay aplicam limites e revalidam a sessão
antes do envio. Não há reenvio de operações por falta de ACK. Timeout/desconexão
depois de execute indica resultado desconhecido, sem retry. Contagem nula permanece.

| Verificação                  | Evidência atual                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hub completo                 | 2.156 passaram; 18 omitidos (inclui o harness opt-in executado separadamente), em PostgreSQL 17 descartável com 41 migrations aplicadas                                               |
| Agente                       | 441 regressões selecionadas passaram, sem skips, incluindo negociação, operações, ODBC simulado, stores, transporte, schemas e shutdown                                               |
| Node/Dart por Socket.IO real | Harness isolado passou: oito chamadas via dispatch REST e relay; journal SQLite real temporário, policy e transação simuladas; uma abertura/commit incerto, duplicatas sem reexecução |
| Contratos                    | REST 1.2.0, OpenRPC e schemas sincronizados; perfil base 2.11.2 preservado, extensão independente v1                                                                                  |
| Publicação                   | Três manifestos `ready:false`; nenhum gate integral marcado; deploy/imagem/instalador/appcast continuam bloqueados                                                                    |
| Ambiente                     | Quatro motores ODBC não homologados; Node local continua abaixo de 24.21; pin imutável do contrato continua pendente                                                                  |
| Limites da evidência         | Harness não homologa motores, autoridade completa MCP/hub nem IA; bases configuradas pelo usuário não recebem DML de teste                                                            |

A formatação incidental dos sete arquivos do agente foi revertida após autorização
expressa do usuário. Diffs desses caminhos conferidos sem alterações funcionais.
A sessão não iniciou app operacional, publicou versão ou alterou bancos de negócio.

O MCP passou em 1.000 testes; 91 casos existentes dependentes de ambiente ficaram
omitidos. Lint, tipos, build, compilador 7.0.2 e formatação passaram. A suíte no
Windows precisou do Bash do Git; o Bash padrão apontava para WSL sem `/bin/bash`.
O hub passou em lint, tipos/build com TypeScript 7 e contratos; seus arquivos desta
etapa passaram na formatação. O check global de formatação do hub ainda acusa seis
arquivos preexistentes fora da etapa, preservados. O compilador usado no hub foi o
instalado no MCP, pois a instalação local do pacote nativo do hub segue pendente.
Análise Dart sem diagnósticos. Três testes do bloqueio de release do agente passaram.
Descoberta DTD e tentativa de reload não encontraram app ativo; nenhum app foi iniciado.
O container PostgreSQL exclusivo desta rodada foi parado e removido ao terminar.
