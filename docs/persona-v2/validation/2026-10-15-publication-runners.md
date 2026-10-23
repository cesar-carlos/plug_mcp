# Runners genéricos de publicação — 2026-10-15

Evidência parcial de desenvolvimento. `ready: false`, treze gates requeridos,
nenhum encerrado. Não autoriza deploy, publicação de imagem ou corte.

## Entrega

`persona:test-publication` recebe manifesto local explícito, sem credenciais,
e seleciona consulta, operação SQL ou cruzamento. Distingue fonte pretendida da
fixture, fixa hashes, revisão, casos e dependências. SELECT/DML são executados
pelo hub/agente; provisionamento privado aceita somente seeds tipados. Relatório
é invalidado antes dos testes, com revalidação entre casos e antes da aprovação.
Cruzamentos revalidam também cada leitura e dependências já consultadas.

Casos declarativos verificam resultados tipados, vazio, SQL adaptado, operações
transacionais e erros determinísticos. Falha de transporte/preparação/limpeza não
aprova um erro esperado. Fixture com efeito incerto fica inutilizável; não há
retry automático. Operações conciliáveis geram UUID novo por caso/rodada: ID
declarado é alias somente do campo tipado do marcador, sem interpolação de SQL
ou reutilização de receipt. Revisão semântica permanece humana.

Migration aditiva `0023_publication_run_evidence.sql` armazena metadados do runner,
fontes/identidades, versões e dependências. Não preenche provas de relatórios
antigos nem modifica publicações existentes. Base técnica atual:
`persona-v2-publication-runners-1`.

## Rodadas

- Final: **43/43**, **248,51 s**, fixture `se7e_persona_e428688deae1_test`.
  MCP → hub PostgreSQL/Prisma com autenticação e ClientAgentAccess reais da
  fixture → agente nativo/ODBC com cofre, configuração e journal duráveis.
  PostgreSQL `17.0.11`, SQL Server `16.00.4236`, SQL Anywhere `16.00.0000`.
- Consultas modelo/adaptadas, operações parametrizadas/adaptáveis, rollback e
  marcador conciliável em duas rodadas passaram nos três motores. Cruzamentos
  publicados PostgreSQL/MSSQL e PostgreSQL/SQL Anywhere passaram com correspondência,
  ausência, Unicode, resultado vazio e recusa de orçamento. Relatórios de
  cruzamento conservaram duas fontes e hashes das publicações dependentes.
- Primeira rodada: **39/43**, **217,36 s**, fixture
  `se7e_persona_a1cf9996c18c_test`. Encontrados resultado local parcialmente escrito
  e representação nativa de UUID SQL Anywhere; os cruzamentos ficaram impedidos
  pelas dependências anteriores. Companion passou a publicar o resultado por
  rename atômico. Comparação do marcador usa `CAST(... AS VARCHAR(36))` na
  projeção de verificação, preservando igualdade exata. Nenhum efeito foi reenviado
  para recuperar essa rodada; a validação final usou bases novas.
- Tentativa inicial de criar `se7e_persona_e218d8676036_test` falhou por conflito
  de porta SQL Anywhere antes dos testes. Recursos pertencentes à fixture foram
  removidos. Não conta como homologação.
- **444 testes unitários v2** e **195 integrações PostgreSQL** passaram. Cobrem
  revogação entre casos, fonte pretendida distinta da fixture, dependências,
  truncamento, limpeza incerta, manifesto local, recusa de segredos/destinos
  externos e ledger das migrations. Tentativa PostgreSQL em sandbox recebeu
  `EACCES`; repetida com acesso à fixture, sem skips de aceite.
- Node **24.21.0**, TypeScript **7.0.2**, lint, tipos, build e formatação passaram.
  Documentação e manifesto de bloqueio verificados ao concluir a tarefa.
- Análise do companion alterado passou sem problemas. As duas fixtures de
  execução foram removidas pelo script de ownership, incluindo recursos próprios.
  Nenhuma base de negócio do usuário foi utilizada.

O [inventário](2026-10-15-publication-runners-files.json) registra commits-base,
hashes dos arquivos e drivers após a rodada. Checkout sujo preservado; não é
snapshot integral de release. Não houve mudança de contrato público do hub.

## Limites e continuidade

O runner operacional exige companion local e fixtures explicitamente preparadas.
O teste nativo ainda usa fonte pretendida e fixture iguais; separação entre
fontes distintas tem cobertura unitária, sem certificação nativa equivalente.
Runners antigos PostgreSQL/sintéticos não são convertidos em provas de transporte.
Não certifica todas as combinações, tipos, collations, triggers, relacionamentos
compartilhados, nem a jornada completa de casos/relatórios no console. Runner de
ações externas permanece dependente das integrações. Adoção compartilhada exige
guardas estruturais reais da fixture; ausência de prova não aprova publicação.

Não houve nova avaliação do plugin privado, IA consumidora, acessibilidade,
instalador desktop ou imagens. O companion não substitui o aplicativo instalado.
Mudanças posteriores no agente, hub ou MCP exigem repetir verificações afetadas.

Referências: [contrato](../homologation-chain.md),
[plano restante](../remaining-plan.md), [aceite](../acceptance.md).
