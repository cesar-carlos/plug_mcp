# Relacionamentos estruturais DML — 2026-10-15

Evidência parcial; não encerra o gate de conhecimento nem autoriza deploy.
Os treze gates continuam pendentes, com `ready: false`.

## Escopo

O contrato opcional `relationships` das operações reutiliza o schema de consultas.
Valida tabelas, campos, pares sem duplicação, IDs e caminhos. A adoção fixa FKs
compostas na filha, direção reversa, unicidade 1:1 e todos os elos N:N. Inclui as
tabelas/colunas relacionadas como dependências de leitura estrutural, sem ampliar
escrita nem permitir JOIN em DML. A validação vigente também confere correspondência
entre os relacionamentos treinados e o conteúdo compartilhado do pacote.

Base técnica `persona-v2-operation-relationships-1`; sem migration nova, mudança
do contrato de transporte, commit, push ou publicação de imagem. Snapshots antigos
não foram reescritos. Alterações locais de outras frentes foram preservadas.

O [inventário](2026-10-15-operation-relationships-files.json) registra os commits-base,
hashes do fluxo e arquivos do agente, versões normalizadas informadas pelos motores
e versões/hashes dos drivers ODBC. Os treze arquivos do fluxo conservaram seus
bytes durante a rodada final. Esse inventário parcial não é snapshot integral de
produção; os checkouts contêm alterações locais de outras frentes.

## Verificações

- Node 24.21.0 e TypeScript 7.0.2: tipos e build passaram.
- Lint passou; unitários persona-v2: 396 passaram.
- Integração PostgreSQL: 194 passaram em bancos temporários próprios da suíte.
- Regressão geral: 1.311 passaram; 91 casos opt-in ficaram excluídos, sem receber
  aceite por essa execução.
- Unitários cobrem FKs compostas/reversas, unicidade 1:1, N:N, campos inexistentes,
  pares duplicados, caminhos incompletos e enforcement desconhecido/desabilitado/
  não validado. Recusa de snapshot divergente e capacidades somente de leitura.
- Cadeia persistente final: **35/35 passaram**, 228,20 s, fixture
  `se7e_persona_0f0627f8d8d4_test`, hub Prisma e agente com cofre/journal reais.
- Rodada inicial: 34/35 passaram, 307,50 s, fixture
  `se7e_persona_5ab51c7cf1c8_test`. O helper DML alterava o objeto editorial usado
  pela consulta SQL Anywhere. Corrigido com cópia independente do conteúdo antes
  de acrescentar chaves; nenhuma proteção de enforcement foi afrouxada.
- Ambas as fixtures foram removidas pelo script de limpeza com conferência de
  propriedade/alvos. Nenhum recurso operacional foi usado.
- Formatação, verificação documental e diferenças sem whitespace inválido passaram.

Nos cenários relacionais, PostgreSQL e SQL Server executam INSERT/UPDATE/DELETE
com quatro recursos na expectativa estrutural. A remoção de uma FK composta
utilizada recusa nova operação com `SOURCE_STRUCTURE_MISMATCH`; repetir a mesma
identidade conserva a recusa durável. SQL Anywhere recusa o pacote antes do
dispatch por enforcement desconhecido. Os testes de unicidade 1:1 são unitários;
essa rodada nativa não certifica todas as variantes de cardinalidade.

## Limites

A extensão relacional da cadeia usa compilação real do pacote com catálogo,
publicação e evidência persistidos, seguida do gateway MCP → hub → agente. É
uma fixture de operador: não substitui a matriz completa de publicação e aprovação
consumidora de todas as combinações relacionais. O fluxo consumidor de operação
compartilhada e os demais cenários da suíte continuam sendo verificados separadamente.

SQL Anywhere conserva enforcement `unknown` e recusa adoção dependente de PK/FK.
Recusa correta não equivale a suporte positivo dessas constraints. Não foram
homologados nesta tarefa todos os perfis, tipos, drivers, janelas de crash,
instalador desktop, TLS público, plugin real ou avaliação da IA. A matriz de
aceite permanece aberta.
