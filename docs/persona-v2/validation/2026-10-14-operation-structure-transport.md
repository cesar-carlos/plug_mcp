# Transporte estrutural de lançamentos e contrato 1.14.0 — 2026-10-14

Avanço das etapas 4/8/14 do [plano restante](../remaining-plan.md), complementando
a [fundação do agente](2026-10-14-agent-operation-structure.md). Não conclui
adoção compartilhada em DML nem qualquer gate de release.

## Implementação

Hub aceita expectedStructure opcional em sql.operation.execute, exige identidade
esperada e recusa nulabilidade desconhecida/constraints não habilitadas como
expectativas executáveis. REST, agents:command, lotes e relay exigem negociação
exata de sqlOperations.structureGuard:1, sourceSchema/sourceIdentity e
sourceConstraints quando houver chaves. O dispatch revalida depois de esperas
assíncronas; nenhum SQL é interpretado, reescrito ou repetido pelo hub.

Detalhe Client projeta somente a capability local efetivamente negociada.
MCP preserva o campo, valida a forma, confere leitura exata dos recursos e o
menor orçamento nativo antes do dispatch. A regra de leitura foi compartilhada
com consultas preservando a distinção explícita entre nomes exatos e caminhos
anteriores. Metadados e contagens auxiliares entram nos 32 comandos do agente.

Isso é transporte técnico. Nenhuma tool permite ao consumidor fornecer livremente
a expectativa, publicar conhecimento compartilhado em DML ou ampliar concessões.
Persistência de motivo seguro, nomes qualificados e adoção em publicação/
preparação/revalidação continuam pendentes.

## Contrato e CI

Contrato e baseline aditivos 1.14.0 foram gerados, revisados e conferidos com
configuração sintética. Foram acrescentados somente campo de expectativa,
capability/garantia e suas projeções opcionais; não removidos campos anteriores.

- Commit-base real do hub: bfb40becd42c5452b19b0df13698d212a0238ddc.
- Contrato: 2d933ed826428a59ada0507ae4c6aaf32a5603454a8b2f5ddfaf978ac5f35af0.
- Snapshot de fontes/contratos: 6620cd07e06210f29e4668b0edf7608bf15a2962599d2417b90d6330c5e07c57.

CI estava com ref antigo e snapshot insuficiente para gerar o contrato atual.
Agora usa o commit-base acima e patch com fontes necessárias, gerador, contrato
e baseline. Não é commit upstream nem distribuição completa do hub. Regressão
impede divergência entre ref CI e pin MCP e exige fontes no snapshot.

A reprodução local extraiu esse commit em diretório novo, aplicou o patch no
worktree explicitamente indicado, executou contract:check e comparou os bytes
com o contrato consumido. Reutilizou dependências instaladas do hub, com lock
registrado; não certifica npm ci limpo, GitHub CI remoto ou imagem candidata.
Primeira tentativa em subdiretório ignorado não comprovava aplicação do patch;
a comparação de bytes detectou isso e a reprodução foi refeita corretamente.

A configuração final bloqueia .env operacional também nos subprocessos tsx e
usa DATABASE_URL sintética sem conexão. Primeiras tentativas de preload/carga
foram descartadas como evidência; geração e checks finais foram reproduzidos
sob isolamento herdado. Nenhum segredo é incluído no contrato ou relatório.

## Cadeia persistente

Os quatro testes novos usam o gateway/adapter MCP reais, Client autenticado,
ClientAgentAccess aprovado e policy da fixture, hub Prisma, Socket.IO e agente
com configuração Drift/cofre DPAPI/journal/ODBC reais. Inspeção obtém metadados
na conexão identificada. Cada caso executa INSERT/UPDATE/DELETE de sua própria
linha, repete a chamada, envia expectativa divergente e repete a recusa. Consulta
publicada compara dados completos antes/depois, preservando a linha preexistente.

É fixture de transporte por operador, sem bypass no runtime consumidor:
não certifica preparação/aprovação de uma skill DML com padrão compartilhado.
O caso de colunas SQL Anywhere não habilita enforcement desconhecido de chaves.

| Rodada                     | Resultado                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 36acd8091857               | 38 passaram; quatro novos pararam na expectativa incorreta de HTTP 201 em vez do 200 contratado             |
| ae98ab4573a4               | 38 passaram; quatro chegaram à execução/deduplicação/recusa e falharam na suposição incorreta de base vazia |
| 31044c94902d               | 42/42; comparação corrigida preserva a linha preexistente; 184,22 segundos                                  |
| ed7ed6518b78, pin CI final | 42/42; 231,45 segundos; contrato/snapshot finais                                                            |

Os testes foram corrigidos segundo o contrato e o estado observado, sem afrouxar
portões ou eliminar cenários. Todas as rodadas são fixtures separadas; nenhum
motor obrigatório ausente foi tratado como skip.

## Demais verificações e limites

| Verificação                          | Resultado                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| MCP completo                         | 1.255 passaram; 91 opcionais não executados na suíte padrão                         |
| Hub completo, configuração sintética | 2.174 passaram; vinte opcionais não executados                                      |
| PostgreSQL v2                        | 194/194 também na repetição com pin final                                           |
| Chromium v2                          | 22/22 antes do ajuste final do pin CI; código funcional do transporte já atualizado |
| Node/compilador                      | Node 24.21.0; TypeScript 7.0.2 real                                                 |
| MCP/hub estáticos                    | Lint, tipos e builds passaram; geração/check de contrato reproduzidos               |

Testes opcionais da suíte padrão não certificam seus gates. Chromium usa
autoridade sintética própria e não certifica toda a jornada estrutural DML,
leitor de tela, zoom real, plugin privado ou TLS público.

Cada motor registrou quatro RPCs estruturais de operação aceitos: execução e
duplicata, recusa terminal e duplicata. Observer conserva somente método,
contagens/códigos e nomes de campos, sem SQL, parâmetros ou resultados.
Comprovante ainda não informa o motivo durável da recusa; o teste não o inventa.

As quatro fixtures foram removidas especificamente após as rodadas, incluindo
bancos, volumes, processos, DSNs e arquivos próprios. Diretórios de reprodução
contêm fontes e artefatos sem segredos, no cache ignorado; não são distribuição.

Versões reportadas: PostgreSQL 17.0.11, SQL Server 16.00.4236, SQL Anywhere
16.00.0000 e Firebird 06.03.1812 WI-V Firebird 5.0. Hashes dos drivers, fontes,
contratos, locks, entradas Prisma e manifestos no
[inventário](2026-10-14-operation-structure-transport-files.json). Captura no
fechamento inclui alterações locais concomitantes; não certifica outras jornadas.

Ainda faltam motivo durável de recusa, adoção DML compartilhada, nomes qualificados,
matriz integral de constraints/revogação/concorrência, mínimos privilégios,
crashes reais, instalador, Redis/TLS distribuídos, integrações, plugin e avaliação
da IA. Manifestos dos três projetos continuam ready false e nenhum gate aceito.
Nenhuma branch, commit, push, publicação de imagem ou deploy foi realizado.
