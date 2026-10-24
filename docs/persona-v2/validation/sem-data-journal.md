# Journal, RPC e executor do agente

> Relatório histórico extraído do registro consolidado em 2026-10-11.
> Data registrada: Não individualizada. Datas, contagens e limitações não foram reavaliadas
> nesta reorganização. [Índice](../validation.md) · [Estado atual](../README.md).

## Rodada anterior: journal, RPC e executor do agente

Journal Drift, bootstrap/DI/shutdown e os três métodos RPC estão integrados ao
executor ODBC. A transação usa uma conexão dedicada, autorização vigente antes
de cada etapa/commit, parâmetros e outputs tipados, condições de linhas e limites.
Timeout nativo reserva a conexão até a chamada terminar, sem rollback concorrente.
O schema 2 acrescenta hash local de conteúdo e preserva registros da geração 1.

| Verificação atual                   | Evidência                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Família nova de operações do agente | 78 testes passaram, sem skips: SQLite real e ODBC simulado                                                          |
| Regressões do agente                | 342 testes passaram: RPC, schemas, persistência, operações, manutenção e shutdown                                   |
| Dart                                | Análise de `lib` e testes novos sem diagnósticos; formatação dos componentes envolvidos verificada                  |
| MCP                                 | 1.000 testes passaram; os mesmos 91 casos dependentes de ambiente ficaram omitidos; lint, tipos e build passaram    |
| Hub                                 | Contrato gerado e compatibilidade OpenRPC passaram: 6 testes; outros 38 passaram para validação/recusa de operações |
| Publicação                          | Gates dos três projetos continuam recusando; `ready:false`, nenhum aceite integral marcado                          |
| Hot reload                          | Descoberta DTD e tentativa de reload sem app ativo; nenhum agente operacional foi iniciado                          |
| Quatro motores reais                | Não homologados; testes simulados não satisfazem esse gate                                                          |

Os testes novos incluem dispatch RPC real, claim antes do SQL, concorrência de
duplicatas, mesmo fingerprint com conteúdo diferente, bindings de identificadores,
parâmetros com texto malicioso, decimais exatos, limites/condições, revogação e
mudança de fonte/credencial, cancelamento entre etapas e após início do commit,
rollback incerto, perda da confirmação do commit, quarentena nativa, migração
aditiva e recuperação após reinício. Schemas são carregados e validados de verdade.
O vínculo ODBC preserva senhas delimitadas e recusa injeção em atributos da base.

Na rodada anterior, o hub mantinha `CAPABILITY_UNAVAILABLE` antes do encaminhamento. OpenRPC identificava
as adições como `pending hub-side wiring`; perfil negociado permanece 2.11.2 e
nenhuma capability transacional habilitada é anunciada. Permanecem pendentes
capabilities/transporte integrado, gramática e identidade física por motor,
publicação/runner de operações, adapter/composição padrão MCP, resultados por
etapa cifrados, conciliação, retenção e homologação real dos quatro motores.
As limitações de Node e referência imutável do contrato descritas abaixo permanecem.

Nenhum deploy, commit, reset operacional ou DML em fontes de usuários foi executado.
