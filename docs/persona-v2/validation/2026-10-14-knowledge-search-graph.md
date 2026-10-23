# Busca e grafo do conhecimento publicado — avanço parcial

Rodada de 2026-10-14, America/Cuiaba. Etapas 4 e 13 do
[plano restante](../remaining-plan.md). Deploy, publicação de imagens, commit e
push não foram realizados. Os três manifestos continuam com `ready: false`,
catorze gates obrigatórios e nenhum concluído.

## Candidato e alcance

Os checkouts conservam alterações locais. O
[inventário](2026-10-14-knowledge-search-graph-files.json) fixa hashes do recorte
avaliado, revisões e binários de drivers. Não representa commit upstream nem
snapshot completo dos três projetos. Migrations anteriores permanecem intactas;
0017 acrescenta somente o índice derivado, com vínculo ao snapshot exato.

Node 24.21.0 e TypeScript 7.0.2 real foram verificados. Contrato fixado do hub e
snapshot passaram por `training:check`. Código/contratos de produto do hub e
agente não foram modificados neste bloco.

Entrega:

- `buscar_contexto` pesquisa finalidade, significado, regras, relacionamentos,
  parâmetros e exemplos aprovados do snapshot concedido. Não pesquisa SQL,
  rascunhos, candidatos, campos recusados ou catálogos não concedidos.
- Índice por publicação/hash e versão é reconstruível. Hash divergente, índice
  ausente ou versão anterior exigem reconstrução; o índice não autoriza leitura.
  Busca/grafo ordenam os locks compartilhados dos catálogos antes de ler as
  dependências, preservando a serialização com revogações.
- `obter_grafo_conhecimento` preserva fonte/schema/tabela/coluna, pares ordenados,
  cardinalidade, opcionalidade e caminho N:N. Filtros só reduzem o recorte;
  caminhos incompletos são omitidos. Cursor cifrado vincula identidade, concessão,
  publicação, filtros e tamanho, sem reservar autorização.
- Operações mostram somente campos usados nas capabilities do contrato;
  declaração de campo não concede visibilidade. Grão com campo fora do recorte
  não expõe seu identificador no grafo. Cruzamentos mantêm dependências distintas,
  sem inferir relacionamentos a partir da combinação.
- Console explora busca/grafo com Bearer em memória da mesma persona. Propostas
  de tabelas/relacionamentos reutilizam editores estruturados e enviam uma única
  definição selecionada. Não alteram publicação nem concedem acesso.
- Corrigida a criação de relacionamento de negócio com `constraintStatus`;
  campos de constraint pertencem à origem banco e são removidos ao trocar para
  negócio. Declaração nunca é apresentada como prova técnica.

## Verificações

| Verificação                             | Resultado                                                     |
| --------------------------------------- | ------------------------------------------------------------- |
| Regressão geral local                   | 1.200 passaram; 91 opcionais ignorados, em seis arquivos      |
| Domínio v2 e verificadores selecionados | 332/332, 32 arquivos                                          |
| Persistência PostgreSQL v2              | 166/166, onze arquivos                                        |
| Cadeia persistente dos quatro motores   | 30/30, sem skips                                              |
| Frontend                                | 31/31, lint, tipos e build                                    |
| Chromium                                | 20/20, incluindo envio de tabela/relacionamento e busca/grafo |

Lint, tipos do servidor com compilador 7 real, build do servidor, gates de Node/
compilador, contrato fixado, documentação e formatação foram executados. Testes
gerais não substituem as suítes dedicadas: os opcionais ignorados não são
contabilizados como homologação dos motores, OAuth externo ou avaliação da IA.

PostgreSQL/Chromium criam bancos próprios; sua autoridade/inspeção sintéticas
testam aplicação e interface. A cadeia separada usa controle PostgreSQL MCP,
hub PostgreSQL/Prisma com autenticação e ClientAgentAccess reais de fixture,
processos HTTP independentes e agente companion com Drift, DPAPI e journal.
Consulta, DML e prova passam por MCP → REST hub → Socket.IO agente → ODBC,
incluindo PostgreSQL, SQL Server, SQL Anywhere e Firebird.

Fixture final da cadeia: `se7e_persona_7f81a77721fe_test`. As fixtures
`se7e_persona_8716ad749c1b_test` e `se7e_persona_8d669142d803_test` sustentaram
rodadas anteriores de regressão/cadeia nesta implementação.
Nenhuma fonte, credencial ou base operacional do usuário foi utilizada.
Versões de arquivos e hashes dos drivers são registrados no inventário; as
versões nativas dos servidores não foram recoletadas nesta rodada.

## Falhas tratadas e limites

A primeira rodada da cadeia passou pelos treze cenários iniciais, mas expirou
durante o reinício do agente; as dezessete falhas seguintes não constituem
resultados independentes. O runner passou a usar `flutter test --no-pub`, com
dependências previamente instaladas, evitando resolução em rede em cada retomada.
Uma fixture nova passou pelos trinta cenários, sem aumentar prazos ou retirar casos.
Após ordenar os locks compartilhados, persistência e jornada afetada do console
foram repetidas no candidato final, além da nova rodada da cadeia.

O teste novo de grafo de cruzamento inicialmente esperava três fontes; a
publicação treinada contém somente duas. Corrigida a expectativa e repetida a
suíte. Testes de Vitest precisaram de TEMP/TMP privados e o cenário de links
simbólicos Windows precisou da permissão apropriada; nenhum teste foi desativado.
Chromium encontrou também a declaração incompatível de constraint no editor de
relacionamentos de negócio, corrigida no produto e coberta pela troca de origem.

Novas jornadas são verificadas nas larguras 360/390/768/1280. Capturas sintéticas
dos formulários em 360/1280 foram inspecionadas. Isso não certifica leitor de tela
ou zoom real de 200%. A resposta final da IA não foi avaliada.

Permanecem propostas físicas com persistência própria, feedback, calendário
explícito do curador (DV2-010), templates/datasets, importação de DDL, evidências
de múltiplas páginas, histórico/impacto ampliados, adoção DML e matriz adversarial
integral. Enforcement SQL Anywhere permanece desconhecido; declaração não supre
prova nativa. As demais etapas do plano também permanecem sujeitas a implementação
e homologação; este bloco não encerra gates de release.

## Limpeza e liberação

A limpeza utiliza manifestos explícitos e verifica containers, volumes, DSN,
processos e caminhos pertencentes às fixtures. As quatro fixtures temporárias
desta retomada foram removidas, incluindo a rodada antiga indisponível
`se7e_persona_e4402acb9fdb_test`; caminhos finais foram conferidos como ausentes.
Recursos operacionais permaneceram fora do escopo.

Entrada v2 continua exclusiva de desenvolvimento. Nenhum resultado desta rodada
autoriza publicação, corte ou deploy.
