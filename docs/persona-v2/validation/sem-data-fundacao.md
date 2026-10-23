# Fundação e alcance inicial dos lançamentos

> Relatório histórico extraído do registro consolidado em 2026-10-11.
> Data registrada: Não individualizada. Datas, contagens e limitações não foram reavaliadas
> nesta reorganização. [Índice](../validation.md) · [Estado atual](../README.md).

## Evidências acumuladas da fundação anterior

| Verificação                                                | Resultado                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Testes backend MCP                                         | 1.000 passaram; 91 casos existentes dependentes de ambiente ficaram omitidos                                                   |
| Preparação/aprovação MCP                                   | 21 testes de ciclo de vida com autoridade/gateway simulados; mais 7 testes de store real                                       |
| PostgreSQL 16 real                                         | 53 testes passaram, em bancos aleatórios próprios de um container descartável                                                  |
| Hub                                                        | 2.142 testes passaram; 17 casos existentes dependentes de ambiente ficaram omitidos; Prisma em banco efêmero                   |
| Journal do agente                                          | 6 testes SQLite reais; regressão dos stores: 49 testes passaram; análise e formatação sem problemas                            |
| Ferramentas de release do agente                           | 52 testes passaram, incluindo 3 do novo bloqueio; publicações nos testes são simuladas                                         |
| Console atual                                              | Sem alteração nesta rodada; 19 testes, lint, tipos e build passaram na rodada anterior                                         |
| Backend MCP                                                | Lint, tipos, build e formatação passaram                                                                                       |
| Hub: tipos/build/contratos                                 | TypeScript 7.0.2 do workspace MCP; contrato aditivo 1.2.0 e lint passaram; dependência local do compilador do hub está ausente |
| Hub: formatação                                            | Arquivos alterados passaram; verificação global aponta 6 arquivos preexistentes fora desta alteração                           |
| Referência da base comum                                   | Pendente: contrato do hub mudou no checkout; gate recusa a referência/hash antigos                                             |
| Diff                                                       | Verificado nos três projetos                                                                                                   |
| Node/compilador                                            | Node local 24.18.0; compilador TypeScript 7.0.2 verificado                                                                     |
| Gate de Node                                               | Recusa correta: projeto exige Node >=24.21.0 e <25                                                                             |
| Release completo                                           | Não certificado; Node, referência coordenada do contrato e manifesto incompleto impedem aceite                                 |
| PostgreSQL/MSSQL/SQL Anywhere/Firebird com operações novas | Não homologados                                                                                                                |
| Chromium no novo console                                   | Pendente; não há console persona-v2 entregue nesta etapa                                                                       |

O PostgreSQL de teste não contém dados operacionais. O runner foi reaplicado no
baseline novo e recusou banco legado sem criar ledger nem alterar seu registro.
O runner legado também recusou o banco novo antes de DDL. Startup/readiness agora
verificam todas as migrations empacotadas e seus checksums sem executar DDL;
uma geração parcialmente migrada ou adulterada é recusada.

Os testes administrativos usam perfil Client e verificação de fonte simulados;
PostgreSQL, transações, constraints, ciphertext persistido e HTTP são reais.
Foram verificados: persona sem fonte, recuperação por client.id após mudança de
email, credencial Client B sob responsável A, múltiplos tokens, isolamento de
concessões, CSRF, autoridade indisponível, revogação transacional, imutabilidade,
referências cruzadas recusadas e OAuth sem vínculo recusado.

O catálogo foi exercitado através de HTTP e do SDK MCP real: rascunho CAS,
publicação imutável, preservação da autoridade anterior durante edição,
preview/hash/prazo/consumo único, concorrência, versão da persona, fonte de outra
persona recusada, expansão sem ampliação do token, suspensão/revogação e mudança
de credencial. Tools e resources aplicam o mesmo portão nos protocolos legado
stateless e 2026-07-28. Auditoria de catálogo foi verificada sem SQL, parâmetros,
resultados ou credenciais. Dependências publicadas também recusam mutação.

O compilador estrutural recusa escrita, campos e tabelas fora do pacote, wildcard,
parâmetros sem contrato, classificações não livres e segredos reconhecíveis.
O pacote fixa versão/hash da base comum e referência do contrato do hub.
Consultas por fonte foram verificadas pelo SDK MCP e por SELECT real em duas
bases sintéticas com tabelas homônimas. O hub foi simulado; o adapter de fonte,
credenciais cifradas, sessões Client independentes, permissões e publicações usam
os componentes reais. Os testes incluem escolha/ambiguidade de fonte, agregação
com decimal exato, envelope de validação sem linhas, paginação, parâmetros,
projeção, recortes obrigatórios persistidos e tentativa de sobrescrever bindings.
Revogação de policy, token e publicação durante leitura impede a entrega, sem
retry. Erro HTTP conserva código/origem sem reproduzir payload inseguro. Auditoria
guarda apenas IDs, eventos e contagens. A detecção do LIMIT vazio do parser
PostgreSQL foi corrigida e a regressão dos validadores compartilhados passou.
Casos obrigatórios sem relatório atual bloqueiam publicação; tipos ainda sem
executor ficam em rascunho. As verificações estruturais não executam o SQL de treinamento nem aprovam sua semântica.

O teste geral precisou usar o Bash do Git no Windows; o executável WSL do PATH
original recusava execução. O problema foi resolvido no ambiente do teste sem
alterar seus critérios.
Nesta rodada, o isolamento local também bloqueou conexões e arquivos temporários
do Vitest e a leitura da referência Git do hub. As verificações foram repetidas
fora dessa restrição e passaram, sem afrouxar testes ou contratos.

Os testes unitários de cruzamento verificam comportamento interno com gateways simulados:
chaves compostas, NULL, cardinalidade, tipos incompatíveis, soma/ordenação/extremos
decimais exatos, paginação final, truncamento, limites acumulados, descarte de
entradas, timeout incluindo autorização e revogação antes da entrega. A integração
agora também passa pelo MCP, catálogo publicado, repositório e gateway de consultas
reais em PostgreSQL. Duas fontes sintéticas são isoladas por schema no banco
descartável; o hub roteia por um adapter simulado. Isso não comprova conectividade
com agentes/bases operacionais nem homologação de outros motores.

Foram verificados: dependências imutáveis de múltiplas fontes, casos obrigatórios,
runner separado de combinação/preflight, relatório obsoleto após mudança de
revisão/pacote, publicação com CAS/hash, descoberta/resources/chamada direta
filtrados por concessões, projeção preservada, adaptação de filtro no pacote,
envelopes vazios, paginação final e proveniência. Limites do token não podem ser
ampliados pela requisição nem removidos por delegação. SQL limitado e entrada
truncada são recusados. Suspensão do cruzamento durante a leitura, revogação da
policy da primeira fonte enquanto a segunda é lida e republicação de dependência
impedem a entrega. Contrato republicado exige liberação explícita no token.
Auditoria de cruzamento contém somente IDs, duração, contagens e etapas.

O runner de fixtures reaproveita o preflight sem despachar SQL: DML, campo fora
do pacote, projeção/parâmetro inválido e fixtures inconsistentes reprovam casos.
Esse relatório não é aprovação humana de semântica, execução real do SQL ou
avaliação de IA. Não há endpoint para a IA aprovar seus próprios relatórios.

## Lançamentos: alcance da fundação anterior

O MCP usa conteúdo operacional cifrado, aprovação Client vinculada a ID/hash/prazo,
revalidação e claim transacional antes do envio. Testes cobrem concorrência,
revogação durante execução, comprovantes incompatíveis, perda de confirmação,
cancelamento e isolamento token/OAuth. Constraints reais recusam mutação de
preparação/aprovação, transições indevidas e mudança de fonte; revisão física
compartilhada invalida cache sem compartilhar resultados.

O hub tem schemas/OpenAPI/contrato 1.2.0 aditivos. `sql.operation.*` é recusado
com `CAPABILITY_UNAVAILABLE` antes do encaminhamento; não faz parte dos métodos
efetivamente anunciados pelo agente. Os testes mantêm a prova de compatibilidade
do OpenRPC atual e verificam a recusa de chamadas unitárias e batch.

O journal Drift do agente persiste intenção antes de qualquer futuro SQL,
recusa reutilização de identidade com outro scope/hash e conserva o resultado
desconhecido após reinício. O teste fecha/reabre SQLite em arquivo e verifica
`synchronous=FULL`. Isso não é executor transacional ODBC. Não há aplicativo/DTD
ativo para hot reload; nenhum agente operacional foi iniciado para esse fim.

Continuam pendentes compilador/publicação e runner de operações, composição
padrão, bootstrap/RPC/capabilities, executor ODBC, adapter MCP, conciliação,
limpeza e homologação dos quatro motores. O contrato novo do hub ainda não tem
referência Git imutável coordenada com o MCP; não foi substituído o pin antigo
por um hash de checkout não publicado. `training:check` acusa essa divergência.
Os scripts npm de tipos/build do hub também requerem reinstalar sua dependência
de compilador; a validação desta rodada usou diretamente o TypeScript 7.0.2 do MCP.

Manifestos dos três projetos seguem `ready:false`, sem gates integrais marcados.
MCP bloqueia publicação de imagem/deploy; o hub bloqueia a construção da imagem
de produção e `release:check`; agente bloqueia instalador publicado e feed.
Os testes verificam gates ausentes, renomeados, incompletos e aceite completo
sintético, sem alterar os manifestos reais.

Nenhum deploy, commit, reset operacional, publicação operacional de skill,
alteração de credenciais de usuários ou DML em base de negócio foi realizado.
Detalhes e sequência: [lançamentos SQL](../sql-operations.md).

Pendências e sequência de continuação: [estado da implementação](../README.md).
