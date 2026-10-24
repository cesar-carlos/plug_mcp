# Anexos binários pela cadeia persistente — 2026-10-16

Evidência de homologação em fixtures dos três motores, sem aceite de produção.
MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, agente base
`7d00ae8a8f822605d76e775fb5659f27e29df539` e hub fixado em
`76950497dc386130e13b7d6afc0678e50208e985`. Checkouts com alterações locais
preservadas: o [inventário SHA-256](2026-10-16-binary-chain-files.json) identifica
os arquivos desta frente e dependências, não representa um commit/release.
Contrato do hub e snapshot histórico permanecem inalterados. Não houve branch,
commit, push, publicação de imagem, instalação em produção ou alteração de conexões ChatGPT.

## Correções entregues

1. O agente identificava o discriminante interno de odbc_fast como odbc_type,
   sem namespace. Agora acrescenta type_system=odbc_fast, preservando nomes e
   códigos anteriores. O MCP aceita 7 como binário somente nesse namespace;
   ODBC nativo 7 é SQL_REAL. Códigos negativos nativos continuam separados.
   Namespace desconhecido, código inválido ou tipo contraditório não autorizam
   arquivo. Schema aditivo, testes e contrato do agente foram sincronizados.
2. O binário solicita teto de duas linhas sem paginação gerenciada e exige
   uma linha com truncated:false explícito no caminho expectedSource.
   Isso preserva ORDER BY da chave física sem projetá-la junto do arquivo ou
   tentar ordenar LONG BINARY. Resposta sem o sinal não habilita entrega.
3. Cache muda para namespace se7e:persona-v2:query:v2, impedindo reuso de respostas
   aceitas antes da distinção de tipos. Não converte, compartilha ou apaga caches
   amplamente; entradas antigas expiram. Anexos continuam fora do cache.

O [contrato de anexos](../attachments.md) mantém publicação, capability nova,
projeção/exportação explícitas, finalidade pessoal/sensível, cifra, quotas e
vínculo por consumidor. Sem nova migration ou alteração de snapshots publicados.
Base técnica v2 passou a persona-v2-binary-attachments-2; instruções do runtime,
skill privada, rules e documentação foram sincronizadas. Instalações não foram alteradas.

## Cadeia e fixture

Rodada final: `se7e_persona_d15c802ffcd7_test`, sessão
`chain-b842c8b804ff4170bca4b73004d0e802`. Bases de negócio novas, loopback e
credenciais sintéticas. Hub PostgreSQL/Prisma separado do controle MCP,
autenticação Client e aprovação ClientAgentAccess reais, REST, Socket.IO/RPC,
policy técnica, identidade na conexão, ODBC, cofre Windows DPAPI e journals duráveis.
Nenhuma fonte cadastrada pelo usuário ou configuração operacional foi utilizada.

Companion cria binary_fixture somente após conferir o banco descartável. Policy
permite leitura e recusa escrita nessa tabela. Nove linhas fechadas: seis amostras
positivas, uma NULL, uma vazia e uma repetição do PDF. Preparação usa somente
literais dos bytes sintéticos fixos; não recebe SQL, identificadores ou bytes de
consumidor. Reinício não recria tabelas/sementes ou recupera arquivos do MCP.

| Motor observado via RPC | Coluna testada | Driver observado                   |
| ----------------------- | -------------- | ---------------------------------- |
| PostgreSQL 17.0.11      | BYTEA          | psqlODBC 18.00.0000                |
| SQL Server 16.00.4236   | VARBINARY(MAX) | ODBC 18, arquivo 2018.0186.0001.01 |
| SQL Anywhere 16.00.0000 | LONG BINARY    | dbodbc16 16.0.0.2043 x64           |

Hashes SHA-256 dos drivers:

- podbc35w.dll: `452afccffb9b7ffbdb736b8ba1cba9d7b1e11b09ffaee9cf85d6d3788cace991`.
- msodbcsql18.dll: `b510668814e68df5018f6f3de0d203fd9b8628b1901d46ed3762ee263b87bbbb`.
- dbodbc16.dll: `571e105fb3e14e754b16863739d402022d0e1f64a10d0b224c4e6dd429d5e8be`.

Os seis conteúdos positivos por motor cobrem PDF/PNG/JPEG/WebP, octet-stream
com todos os bytes 0–255 e PDF de 81.947 bytes, acima de 64 KiB. São fixtures
de assinatura, sem afirmar validade de documento renderizado ou segurança do arquivo.

## Resultados

Comandos usam scripts/with-project-node.ps1. Cadeia executada pelo wrapper
scripts/run-persona-chain-homologation.ps1, com manifesto exclusivo, Flutter e
diretórios dos drivers explícitos; modo prisma. Sem .env ou overrides de gateway
MCP. Nenhum runner Flutter nativo foi executado simultaneamente ao companion.

| Verificação                                    | Resultado                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Cadeia persistente completa                    | **77/77**, sem skips/retries; **537,32 s**                                                                        |
| Regressão geral MCP                            | **1.466 aprovados, 91 não executados**, 160 arquivos aprovados/seis não executados; **70,87 s**                   |
| Integração PostgreSQL dirigida                 | **66/66**, consulta/anexos e baseline; **17,94 s**                                                                |
| Singleflight dirigido final                    | **1/1**, 46 excluídos pelo filtro; **5,77 s**, após ajuste equivalente da barreira ao alvo TypeScript             |
| Unitários dirigidos MCP                        | **93/93**, tipos, anexos, consultas e pacote; **5,25 s**                                                          |
| Agente: mappers, células, completude e schemas | **123/123**, sete arquivos                                                                                        |
| Análise Dart                                   | Seis arquivos finais, sem problemas                                                                               |
| Frontend                                       | **36/36**, treze arquivos; lint/tipos/build aprovados                                                             |
| Chromium binário móvel                         | **1/1**, **7,2 s**, 390 px, hub sintético e bytea real                                                            |
| Gates locais                                   | Node **24.21.0**, TypeScript **7.0.2** reais, lint/tipos/build, docs:check, formatação e training:check aprovados |
| Release guard                                  | Exit 1 esperado; ready:false, treze gates exigidos, nenhum encerrado                                              |

Totais sobrepostos não são somados. Os 77 cenários incluem três novos cenários
binários, os anteriores de criação de persona/três fontes/treinamento/publicação,
Chromium na cadeia real, conhecimento, cruzamentos, DML, rollback e recuperação.
Os 91 casos não executados da configuração geral não certificam ambientes obrigatórios.

Cada cenário binário publica treinamento por schema/fonte, emite concessão própria,
compara exatamente bytes HTTP e resources MCP e exercita obter_anexo. Confere
MIME, nome independente do handle, proveniência e completude. As leituras
provocam RPCs reais de policy/identidade e não reenviam SELECT de negócio.
NULL/vazio/múltiplas linhas, orçamento inferior a duas linhas, paginação do
consumidor, consulta comum, contrato ausente e outro token/persona são recusados.
Após revogar o token, o mesmo download retorna 401 sem nova consulta.
Após reiniciar MCP/hub/agente, o handle anterior retorna 404 sem SELECT;
nova criação explícita executa uma consulta usando as credenciais recuperadas.

## Falhas encontradas e limpeza

A primeira preparação tentou binding de bytes e falhou no driver antes de
executar os testes de produto. Foi substituída por literais binários fechados
somente na fixture. A rodada seguinte recusou corretamente a metadata sem
namespace, revelando a distinção de códigos corrigida acima. Outra tentativa
teve conflito de porta do SQL Anywhere; provisionamento passou a escolher porta
exclusiva fora da faixa dinâmica e verificar saída precoce. Não houve fallback
de motor nem skip. Uma chamada antes de terminar o provisionamento apontou para
manifesto já descartado e não executou casos; dependência foi aguardada antes
da rodada efetiva. Outra rodada passou bytes mas encontrou expectativa incorreta
de HTTP 200 para revogação; contrato real retorna 204 e a asserção foi corrigida.

O teste PostgreSQL de singleflight também revelou sobreposição dependente do
escalonamento: todos podiam chegar após o cache. Agora uma barreira aguarda cinco
entradas reais antes de liberar o SELECT. Conserva SQL real, uma execução,
seguidores, hit e revogação. Promise.withResolvers foi substituída pela construção
equivalente compatível com o alvo de tipos; teste final passou. Execuções Vitest
no sandbox perderam módulos SSR temporários; rodadas nativas mantiveram os
mesmos critérios e passaram. Tentativas reprovadas não contam como aprovação.

Todas as fixtures desta frente foram removidas. Na falha TCP, PID, executável,
linha de comando/raiz e erro privado do servidor foram conferidos antes de
encerrar somente o processo daquele teste. Removedor validou raízes, labels,
volumes exclusivos, DSNs e processos; ausência do diretório/contêiner final foi
conferida. Recursos operacionais/compartilhados permaneceram preservados.
Logs privados não integram o pacote; observador registra somente metadata, sem
SQL, parâmetros, células, handles ou credenciais.

## Limites de aceite

Esta evidência encerra a rodada funcional binária descrita nas fixtures dos três
motores. Não encerra os gates da plataforma, a matriz adversarial ampliada,
revogação durante a entrega, todos os tipos/limites nativos de BLOB, frota desktop,
anexos entre processos, recuperação de arquivos ou implantação distribuída.
HTTPS público e instalação/conversa real ChatGPT permanecem para validação manual.
Avaliação da IA continua separada. [Plano restante](../remaining-plan.md) e
[matriz de aceite](../acceptance.md) preservam as demais pendências.
MCP, hub e agente mantêm deploy/publicação bloqueados; nenhum manifesto foi liberado.
