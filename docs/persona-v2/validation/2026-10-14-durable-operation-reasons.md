# Motivo durável de operações SQL — 2026-10-14

Avanço das etapas 4/8/14 do [plano restante](../remaining-plan.md). Complementa
o [transporte estrutural](2026-10-14-operation-structure-transport.md); não conclui
adoção compartilhada em DML, os demais requisitos ou o aceite de qualquer gate.

## Implementação e contrato

Journal separado do agente recebe coluna nullable `failure_code` por migração
aditiva 2→3, preservando 1→2. Códigos são enum de domínio; persistência não recebe
texto arbitrário, SQL, parâmetros, recursos ou diagnóstico nativo. Falha de
identidade/estrutura antes da transação conserva sua categoria segura, mesmo
depois de get, duplicata e reinício. Código desconhecido vira categoria genérica
segura; não armazena o texto original. Sucesso não pode carregar falha.

Recuperação registra `SQL_OPERATION_INTERRUPTED` somente em registros em execução
interrompida, mantendo resultado desconhecido. Terminal antigo permanece sem
motivo; cancelamento posterior não altera seu comprovante. Código não prova
commit/rollback e não torna operação executável. Journal separado continua sem
garantia de execução exatamente uma vez.

RPC/OpenRPC e contrato hub 1.15.0 adicionam `failureCode` opcional enumerado nos
estados cancelada, rollback confirmado e desconhecido. Hub preserva transporte;
MCP valida código/estado, conserva persistência e entrega autorizada. Expectativas
estruturais continuam restritas a capabilities vigentes e leitura exata, sem SQL
interpretado pelo hub. Nenhuma migration do MCP/hub ou concessão foi alterada.

## Candidato e reprodução

- Hub commit-base real: `bfb40becd42c5452b19b0df13698d212a0238ddc`.
- Contrato 1.15.0 SHA-256: `a8e8bc82a9b6d995c8637bf47bc35e17d44c5b21aba60889be25654ac60f4e60`.
- Snapshot SHA-256: `7f1b746a782b5023aed562cb40edbf72dbe39a15498fcba2e36a949604aa1948`.
- Snapshot inclui fontes/gerador e artefatos, aplicado ao commit-base em diretório
  isolado; comparação byte a byte e geração `contract:check` aprovadas. Junction
  temporária de dependências retirada após verificar seu destino.

Snapshot não é commit upstream nem comprova instalação limpa, distribuição
completa ou pipeline remoto. Inventário identifica as revisões/arquivos efetivos.

## Verificações

| Verificação                                                    | Resultado                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| Agente: executor, journal, upgrade, schema e ODBC direcionados | 95 testes aprovados                                             |
| Agente: análise estática e geração Drift                       | Aprovadas; geração restrita ao journal                          |
| Hub: lint, tipos, build e contrato                             | Aprovados, ambiente sintético sem leitura de `.env` operacional |
| Hub: regressão completa                                        | 2.174 aprovados, 20 opcionais não executados                    |
| MCP: regressão unitária v2 final                               | 372 aprovados                                                   |
| MCP: integração PostgreSQL v2                                  | 194 aprovados, 13 arquivos                                      |
| MCP: tipos, build e lint                                       | Aprovados                                                       |
| Cadeia persistente, primeira rodada                            | 42 aprovados, 223,65 segundos                                   |

Regressão completa final MCP: **1.287 aprovados**, 91 opcionais não executados.
Rodada final da cadeia: **42 aprovados em 210,11 segundos**. Verifica, nos quatro
motores, igualdade do comprovante antes/depois de reiniciar agentes e ao repetir
execute. Cada journal conserva uma única recusa estrutural, mesmo com cinco
chamadas execute guardadas observadas por motor. Nenhuma contagem encerra gate;
os opcionais não executados também não viram evidência de aceite.

## Ambiente e limites

Fixtures: `se7e_persona_3c89f57666ef_test` e `se7e_persona_899a342d1591_test`;
ambas removidas após capturar evidências e verificar seus alvos, incluindo
containers/volumes, processos, DSN e diretórios exclusivos.
Hub usa PostgreSQL/Prisma e autenticação/aprovação reais de
fixture. Agente usa Drift/DPAPI/ODBC e journal reais; MCP e hub são processos
independentes. No caminho estrutural de operações, a chamada é pelo carrier de
operador, sem anunciar publicação/preparação compartilhadas disponíveis à IA.

A primeira tentativa de iniciar a cadeia recusou fixture fora do TEMP corrente
antes de carregar testes. Corrigido o ambiente do processo sem afrouxar o guard.
A busca inicial no diretório de instalação Firebird constatou ausência dos
binários; a preparação foi feita com runtime dedicado já disponível no projeto,
sem abrir base, DSN, configuração ou cofre operacional.

Hot reload foi tentado após descoberta DTD; não havia aplicação Flutter ativa.
Não se iniciou o app operacional para satisfazer essa verificação. Isso não
certifica instalação desktop. Falhas iniciais do script auxiliar e aviso de const
foram corrigidos antes dos testes direcionados e análise final.

Versões observadas: PostgreSQL `17.0.11`, SQL Server `16.00.4236`, SQL Anywhere
`16.00.0000` e Firebird `06.03.1812 WI-V Firebird 5.0`. Não certificam todos os
patches/configurações nativas. Os quatro journals têm schema 3 e conservam
`SOURCE_STRUCTURE_MISMATCH`, `SQL_OPERATION_ROW_LIMIT` e
`SQL_OPERATION_NATIVE_FAILED` nas categorias correspondentes; sucesso fica sem código.

Drivers, hashes e metadados estão no
[inventário](2026-10-14-durable-operation-reasons-files.json). Regressões não
reexecutam todas as homologações históricas; navegador não foi reexecutado nesta
rodada, sem alteração de UI. Formatação normalizou finais de linha mistos no
documento alterado do hub, sem diferença de texto.
SQL Anywhere conserva enforcement desconhecido. Mínimos privilégios nativos,
quedas reais durante commit, publicação DML compartilhada, instalação/plugin,
avaliação da IA e demais gates continuam pendentes. Não houve imagem, commit,
push, deploy ou liberação; os três manifestos permanecem bloqueados.
