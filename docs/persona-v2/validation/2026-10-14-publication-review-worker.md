# Prazo de publicação e worker de revisão — avanço parcial

Rodada de 2026-10-14, America/Cuiaba. Etapas 4, 12 e 13 do
[plano restante](../remaining-plan.md). Nenhum deploy, publicação de imagem,
branch, commit ou push. Os três manifestos conservam `ready: false`, catorze
gates obrigatórios e nenhum concluído.

## Candidato e implementação

O [inventário](2026-10-14-publication-review-worker-files.json) registra revisões
efetivas, alterações locais, hashes do recorte e cinco drivers. Não representa
commit upstream ou snapshot completo dos checkouts. Código de produto do hub e
agente não foi modificado neste bloco. Migration aditiva 0020 conserva snapshots,
calendários anteriores e migrations aplicadas.

- Novas publicações de skill, padrão e perfil exigem prazo futuro escolhido pelo
  responsável/curador. Plano e prévia fixam conteúdo, revisão, escopo, autoria,
  versão e data. Alteração ou vencimento impede confirmar a prévia anterior.
  Publicação e primeiro calendário são transacionais. Conteúdo histórico sem
  calendário permanece não configurado; nenhuma data é inventada.
- Consumidor delegado não escolhe prazo. O responsável configura o plano humano
  para o conteúdo atual, com sessão Client e CSRF. Token conserva seus portões e
  não herda plano de outra revisão. Auditoria registra somente metadados.
- Worker v2 tem entrada de desenvolvimento separada, verificação de migrations,
  bloqueio de produção, lease persistente e lotes limitados. Duas instâncias e
  reinício não duplicam tarefa/notificação por versão. Prazo novo ou suspensão
  encerra tarefa anterior; não altera publicação ou permissões.
- Notificações são internas ao console, com leitura individual e autorização
  vigente do alvo. Ler não conclui revisão. Perfil exige acesso remoto atual à
  mesma base. Worker não consulta ERP, não usa credenciais das fontes, não publica,
  aprova ou repete operações incertas. Vencimento não suspende consultas.

[Contrato, execução e limites](../review-worker.md).

## Validação

| Verificação                           | Resultado                                               |
| ------------------------------------- | ------------------------------------------------------- |
| Persistência PostgreSQL v2            | 179/179 em doze arquivos; casos afetados repetidos      |
| Cadeia persistente dos quatro motores | 30/30, sem skips                                        |
| Chromium                              | 20/20                                                   |
| Frontend                              | 31/31, lint, tipos e build                              |
| Regressão geral                       | 1.200 passaram; 91 opcionais em seis arquivos ignorados |

Node 24.21.0, TypeScript 7.0.2 real, lint, tipos/build do servidor, contrato
fixado do hub, documentação e formatação foram verificados. Opcionais da suíte
geral não certificam os motores, plugin externo ou avaliação de IA.

Persistência e Chromium usam PostgreSQL próprio com autoridade/inspeção
sintéticas. Casos cobrem prazo ausente/passado, prazo alterado e vencido antes
da confirmação, rollback da publicação, versões históricas, consumidor sem
plano e tentativa de escolher data pela IA. Worker cobre concorrência de duas
instâncias, lease abandonado, processo reiniciado, unicidade, leitura sem concluir
revisão, acesso remoto revogado e tarefa de outra publicação recusada. Snapshot
conserva hash. Console cobre configuração, aviso vencido, leitura, revisão humana
e encerramento da tarefa, preservando as demais jornadas.

A cadeia separada usa PostgreSQL MCP, hub PostgreSQL/Prisma, autenticação e
ClientAgentAccess reais de fixture, processos independentes, companion com
Drift/cofre Windows DPAPI e journal. SQL/prova passam por MCP → REST hub →
Socket.IO agente → ODBC. PostgreSQL, SQL Server, SQL Anywhere e Firebird exercitam
publicação com prazo, tarefa/notificação de perfil adotado, leitura, revisão
humana e consulta autorizada mesmo com revisão vencida, além das regressões.
Worker usa somente o controle MCP; não executa SQL nas bases de negócio.

Fixture final: `se7e_persona_8ec7e6707031_test`. Rodadas anteriores bem-sucedidas
usaram `se7e_persona_a4557ba00a15_test` e `se7e_persona_be1fb96571ce_test`.
Nenhuma fonte ou credencial operacional foi utilizada. Limpeza confere escopo,
processos, labels, volumes e caminhos e remove somente essas fixtures. Versões
nativas dos motores não foram recoletadas; drivers constam do inventário.

## Falhas tratadas e limites

Expectativas antigas de calendário não configurado e prévias sem data foram
atualizadas para o novo contrato, sem dispensar os portões. Auditoria distingue
o humano que escolheu o prazo do consumidor que publicou. Na automação Chromium,
o seletor da decisão foi corrigido e a publicação passou a ser localizada pelo
ID da skill selecionada, evitando colisão entre fixtures com mesmo slug. A
rodada final passou. Avisos de anotação de dependências do build e de resposta
JSON do SDK MCP não foram tratados como prova de notificações SSE: esta entrega
usa notificações persistidas no console.

Uma fixture adicional (`se7e_persona_5a28230199b1_test`) não conseguiu vincular a
porta local do SQL Anywhere. Ela foi encerrada e removida após comprovação de
propriedade; uma fixture nova executou a rodada. Falha não foi convertida em skip
nem em aprovação de motor ausente.

Notificações externas, outbox, retenção, rotação de chaves, outros jobs e
distribuição do worker permanecem pendentes. O console mostra vinte notificações
recentes por publicação e sinaliza corte; não oferece inbox global ou paginação
adicional de notificações nesta entrega. Companion não certifica instalador
desktop; testes internos não certificam TLS/proxy públicos, Redis distribuído,
instalação privada do plugin, leitor de tela, zoom real de 200% ou IA consumidora.
Templates/datasets, compatibilidade ampliada, adoção DML e os demais gates seguem
pendentes. Enforcement SQL Anywhere continua desconhecido.

Esta rodada acrescenta evidência parcial aos gates de conhecimento, treinamento,
OAuth/console e operação; não encerra gate ou autoriza produção.
