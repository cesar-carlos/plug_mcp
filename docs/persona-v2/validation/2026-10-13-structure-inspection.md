# Inspeção estrutural e adoção inicial em consultas

Rodada de 2026-10-13, America/Cuiaba. Avanço parcial da etapa 4 do
[plano restante](../remaining-plan.md). **Nenhum gate foi encerrado.** Deploy,
publicação de imagens e corte continuam bloqueados nos três projetos.

## Candidato e ambiente

Os checkouts possuem alterações locais. HEAD é somente referência; os hashes
dos 69 arquivos centrais estão no [inventário](2026-10-13-structure-inspection-files.json).
O inventário não representa o checkout inteiro nem aceite de release.

| Projeto | HEAD de referência                         |
| ------- | ------------------------------------------ |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` |
| Hub     | `0d2c6b488438a77be71b39e514cd06ab11fbb95e` |
| Agente  | `570e797b728eafa1cdc950be5e446ab7dd1c497c` |

Contrato REST aditivo **1.10.0**, SHA-256
`829c32650202b33c4a59dc2928c16377794bc2ac611d4b5346ce05130b55a38e`.
Snapshot dos contratos contra o commit-base do hub:
`7c82c8119527caccd4836b69b031f0586e259e5c164e6788b5a1ce9d68ec61f8`.
Não é um commit upstream. Node **24.21.0**, TypeScript **7.0.2** real.

Fixture final `se7e_persona_3fb2eee72fd8_test`: PostgreSQL de controle separado
do hub PostgreSQL/Prisma; processos HTTP MCP/hub independentes; agente com
configuração Drift, cofre Windows DPAPI e journal SQLite próprios. REST,
Socket.IO, policies, autorização Client/ClientAgentAccess e ODBC reais. Os
processos reiniciam sem recuperar credenciais do bootstrap. Somente fontes e
dados sintéticos dedicados; nenhuma fonte cadastrada pelo usuário foi utilizada.

| Motor        | Versão devolvida pelo agente/ODBC |
| ------------ | --------------------------------- |
| PostgreSQL   | `17.0.11`                         |
| SQL Server   | `16.00.4236`                      |
| SQL Anywhere | `16.00.0000`                      |
| Firebird     | `06.03.1812 WI-V Firebird 5.0`    |

Strings preservadas conforme a prova, sem inferir patches não informados.
Drivers e bibliotecas têm versões e SHA-256 no inventário: psqlODBC 18.00.0000,
SQL Anywhere 16.0.0.2043, SQL Server ODBC 18, Firebird ODBC WI_T2.0.5.156 e
fbclient WI-V5.0.4.1812. Redis reservado pela fixture não foi usado nesta matriz.

## Resultado e alcance

| Verificação                                                    | Resultado                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Cadeia persistente completa, sem filtro                        | **30/30**, quatro motores, sem skip                                   |
| Regressão PostgreSQL persona-v2                                | **154/154** em dez arquivos, bancos próprios                          |
| Unitários v2, contrato fixado, adapter REST e guard de release | **299/299** em 28 arquivos                                            |
| Hub: metadados, negociação, transporte, validadores e paridade | **58/58** em cinco arquivos                                           |
| Agente: conexão verificada, drift, prazo, schemas e descoberta | **12/12** em dois arquivos                                            |
| Análise estática Dart dos arquivos alterados                   | Aprovada, sem issues                                                  |
| MCP                                                            | Tipos, lint dos subsistemas alterados, build, formatação e docs:check |
| Hub                                                            | Tipos e lint afetados; geração/checagem do contrato                   |

Contagens pertencem a suítes diferentes; não somar para declarar cobertura
integral. Diagnósticos intermediários filtrados não são evidência de aceite;
a rodada final acima executou todos os 30 casos do runner, sem exclusões.

A inspeção usa consultas fixas aos catálogos próprios de cada motor, sempre
pelo hub/agente. Confirma identidade na conexão antes/depois e preserva todos
os pares ordenados de PK/FK compostas. Relacionamentos com alvos fora do escopo
não são retornados. Observações são imutáveis (migration 0013); auditoria contém
somente referências. Metadados não habilitam execução ou aprovam significado.

Cada motor publica um padrão sintético, adota referência e evidência exatas em
uma skill, exige concessão nova e executa SELECT recortado. O agente confere as
colunas antes/depois na própria conexão. Contexto e resultado informam origem
do conhecimento. Edição do padrão conserva a versão usada pela skill; suspensão
da versão impede leitura da skill e consulta. A regressão anterior de consultas,
cruzamentos, DML aprovado, ciclo de fontes e journals após reinícios permanece.

Falhas corrigidas na rodada: paginação de metadados confundida com paginação SQL;
remoção de nulos obrigatórios pelo wire; helpers genéricos de catálogo incompatíveis
com os motores; validador procedural recusando o contrato estrutural já aceito pelo
schema; definição OpenAPI ativa incompleta. Os testes agora exercitam ambos os
validadores, descarte após drift e prazo antes de iniciar outro comando auxiliar.

## Limites e pendências

Esta rodada comprova o recorte inicial implementado, não a conclusão da etapa 4.
Ainda faltam constraints habilitadas/validadas e índices únicos, perfis físicos,
curadores de particularidades, DML compartilhado, composição de evidências de
várias páginas, jornadas de inspeção/adoção no console e curadoria/runners restantes.
Chaves observadas continuam com estado desconhecido; dependências que precisem
desse estado são recusadas como inconclusivas.

Completar mínimos privilégios, views/tipos, drift físico real e revogação em
trânsito, duas personas/responsáveis com versões independentes e demais cenários
da [matriz](../acceptance.md#shared-knowledge-and-compatibility). Não certifica
instalador desktop, TLS/DNS público, Redis distribuído, plugin no ChatGPT real,
acessibilidade ou comportamento da IA consumidora. Não havia app Flutter ativo
no DTD para hot reload; foram executados processos novos e reinícios reais do
companion isolado, sem abrir o aplicativo operacional.

Os manifestos MCP/hub/agente permanecem `ready: false`, 14 gates obrigatórios
e zero gates concluídos. Sem commit, push, deploy ou publicação de imagens.
Os processos da fixture são encerrados pelo runner. A tentativa de remoção final
pelo manifesto de propriedade foi bloqueada porque o daemon Docker estava
indisponível; a limpeza continua pendente, sem contornar a conferência de
propriedade. Quando disponível, usar o mesmo manifesto para remover contêineres,
DSN HKCU e arquivos exclusivos, sem atingir bancos, cofres ou configurações
operacionais. Payloads/logs privados não integram o inventário nem o repositório.
Os hashes foram atualizados offline após a revisão das instruções do runtime;
versões dos motores preservam as observações da rodada executada.
