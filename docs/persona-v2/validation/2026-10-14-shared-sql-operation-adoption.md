# Adoção compartilhada de operações SQL — 2026-10-14

Evidência parcial de conhecimento, autorização, publicação, operações e motores.
O escopo vigente é PostgreSQL, SQL Server e SQL Anywhere. Os três manifestos
permanecem `ready: false`, com treze gates exigidos e nenhum concluído.

## Revisão e escopo

Commits-base: MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub
`bfb40becd42c5452b19b0df13698d212a0238ddc` e agente
`fdb44d86b2a36df85c0133cf72167217fc1bd16e`. Alterações locais foram preservadas,
sem commit, push, publicação ou deploy. O
[inventário](2026-10-14-shared-sql-operation-adoption-files.json) conserva os
hashes do fluxo testado e distingue mudanças posteriores de outra frente.
Não é snapshot integral de produção ou certificação do novo candidato combinado.

Base v2 `persona-v2-shared-operation-knowledge-1`. Contrato hub aditivo 1.15.0,
fixado por commit-base, patch e snapshot. O verificador local do contrato passou
antes das rodadas; enum de transporte legado não equivale a suporte v2 a Firebird.
Não houve migration nova ou alteração de migration aplicada nesta tarefa.

O pacote publicado fixa padrão, perfil opcional, evidência e hashes. Exige grão,
classificação livre, significado/regras/tipos correspondentes e identidade
PK/UNIQUE comprovada. Recorta dependências utilizadas; não inclui declarações
ou chaves sem uso. Preparação/fingerprint incluem `expectedStructure`; aprovação
humana e concessões são separadas. Revalida conhecimento na descoberta,
preparação, aprovação, commit local, dispatch e entrega. Recusa estrutural
comprovada persiste receipt e suspende somente a publicação utilizada.

## Rodadas

| Rodada                                    | Resultado e limite                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Inicial: `se7e_persona_0153e424f1d2_test` | 32/32 passaram, 158,88 s; anterior ao recorte e à base finais                                 |
| Tentativa de reutilização da fixture      | Setup ODBC falhou em CREATE das tabelas estruturais existentes; nenhum dos 32 casos executado |
| Final: `se7e_persona_9eb97fc07843_test`   | 32/32 passaram, 176,87 s, em infraestrutura nova                                              |

A tentativa de reutilização não é evidência positiva nem skip de aceite. A
falha ocorreu no setup, antes dos cenários; foi preservada no registro e corrigida
usando fixture nova, sem apagar seletivamente tabelas para mascarar o problema.
Ambas as fixtures foram removidas pelo procedimento com verificação de
containers/labels, volumes, DSN, processo SQL Anywhere e caminho temporário.

Na rodada final, os vinte arquivos do fluxo adotado conservaram os mesmos bytes
antes/depois da execução. Após a liberação coordenada, o outro chat acrescentou
seus testes genéricos ao arquivo da cadeia. Essa alteração posterior não recebe
automaticamente a evidência de 32/32; o inventário distingue hash testado e atual.

## Verificações

Node 24.21.0, TypeScript nativo 7.0.2, PostgreSQL 17, SQL Server 2022 e SQL Anywhere
16, via ODBC e companion de fixture. Patch exato de cada motor/driver não foi
arquivado nesta rodada; deve integrar a matriz integral do candidato combinado.

| Verificação                                                        | Resultado                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Cadeia persistente MCP → hub → agente                              | 32/32, nos três motores vigentes                                  |
| Regressão completa MCP                                             | 1.294 aprovados, 91 opt-in não executados; 143 arquivos aprovados |
| PostgreSQL v2                                                      | 194/194 em 13 arquivos                                            |
| Adoção/operações dirigidas após acrescentar conciliação estrutural | 40/40 em 2 arquivos                                               |
| TypeScript 7, build backend e lint dos arquivos afetados           | Passaram nas verificações dirigidas                               |
| Documentação e manifesto                                           | Links/contratos sem problemas; publicação recusada                |

Os 91 opt-in não substituem testes obrigatórios: a cadeia e PostgreSQL acima
foram executados explicitamente. O lint/tipos globais capturaram arquivos do
runner genérico ainda em edição; seus erros foram encaminhados à frente dona.
As correções e a validação integral dessa frente permanecem evidências separadas.
Não foi executada nova rodada Chromium, plugin privado ou avaliação da IA.

## Cenários e resultados comprovados

- PostgreSQL/SQL Server: inspeção real, publicação do padrão, runner com guarda
  na conexão de fixture, publicação da operação, novas concessões, preparação
  cifrada e aprovação Client do conteúdo estrutural exato.
- INSERT/UPDATE/DELETE com outputs, IDs gerados, condições de concorrência,
  rollback, journal, resultado desconhecido e reinício pela cadeia persistente.
- Suspender o padrão bloqueia o dispatch de preparação já aprovada, sem
  desfazer efeitos anteriores ou compartilhar resultados/credenciais.
- SQL Anywhere: adoção compartilhada recusada com `INCOMPLETE_INPUT` por
  enforcement desconhecido; operação privada original continua separada.
  Não houve fallback automático nem publicação compartilhada indevida.
- Runner sem guarda estrutural recusado antes de gravar aprovação do pacote.
- Testes dirigidos: classificação/grão ausentes, tipo divergente, evidência
  expirada/de outra versão, chaves desconhecidas, particularidade de outra base,
  suspensão, ausência de dependências sem uso e receipt preservado antes do bloqueio.
- Conciliação encaminha prova do marcador à conexão de leitura sem reenviar DML.

Metadados do controle da rodada final confirmam duas publicações de operação com
conhecimento/prova (PG/MSSQL), uma privada (SQL Anywhere) e a base final nas três.
Havia quinze operações com payload cifrado: três concluídas, três com rollback,
três canceladas, três desconhecidas e três aprovadas bloqueadas depois. Nenhum
payload, SQL, parâmetro, credencial ou resultado de negócio foi arquivado no relatório.

## Pendências preservadas

Enforcement SQL Anywhere, dependências relacionais DML adicionais, matriz de
perfis/duas personas/revogação em trânsito, limites e tipos nativos completos,
runners genéricos, quedas reais nas janelas de commit, console e demais etapas
continuam no [plano restante](../remaining-plan.md). Os testes de perfil DML
desta rodada são unitários; não representam toda a homologação nativa de perfis.

O companion é operador-only, com fixture de operação conhecida; não é instalador
desktop nem runner genérico. Nenhuma fonte cadastrada pelo usuário foi utilizada.
O novo trabalho do outro chat e o candidato combinado exigem suas próprias
regressões. Nenhum gate foi encerrado e produção permanece bloqueada.
