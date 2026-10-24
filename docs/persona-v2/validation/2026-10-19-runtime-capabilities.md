# Descoberta das capacidades ligadas — 2026-10-19

O transporte MCP mantinha oauth e externalActions falsos na resposta herdada do
serviço de consultas. Agora anuncia serviços ligados ao endpoint, inclui
externalQueries e identifica autenticação Bearer/OAuth. Serviços ausentes conservam
false. Implementação não concede autoridade nem certifica aceite. Contratos
públicos do hub não foram alterados.

As instruções substituem a referência histórica a quatro motores pelo suporte
vigente: PostgreSQL, SQL Server e SQL Anywhere. Verificar fonte descreve metadados,
sem prometer ausência de SQL auxiliar.

## Evidência

Suítes source-query.postgres e oauth.postgres: **80 testes aprovados em 19,42 s**.
Asserções exercitam tools/call em /mcp e /mcp/chatgpt, incluindo autenticação,
scope, originador, serviços externos e ausência de replay. Tipos, lint dos arquivos
alterados e build passaram sob Node 24 do projeto. PostgreSQL 17 de fixture,
com autoridade/transporte simulados, não certifica cadeia instalada ou ChatGPT.

Base MCP: 136b5bfc8f7104b753bbd3703c9ffda196fdd51f, com alterações locais.
SHA-256 observado após os testes e reconferido após interrupção:

| Arquivo                                            | SHA-256                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| src/infrastructure/mcp/persona-v2-http.ts          | 4aa1edbb131557460bcf843f7af00ac41aefb3e9567b990e4676208dab734213 |
| src/application/persona-v2/runtime-instructions.ts | b1db3806e7ccc4eb11054b794ce17cbee1cf14e809d49103ada321b23460f83d |
| tests/persona-v2/source-query.postgres.test.ts     | 0635951515ff6275f3a2c7e46072ddaafebc0d66a37a7b5ab1264745947e16e5 |
| tests/persona-v2/oauth.postgres.test.ts            | c0e1e396f17d431b4647a02be420ce4c8e99b057fdbec26e18a5a43f306f9e6c |

## Recuperação da documentação

A interrupção durante o patch deixou quatro documentos com bytes nulos.
Source-queries, rule MCP e changelog foram recuperados dos blobs locais
339d877b1eb2a32e8fc05a0312ed18e863485eda,
266a1d16d5cc2530387ab102a0f6dc23a0c717cd e
80a55281947acb177b60d9e086f455fed9754af3, preservando as alterações anteriores.
Somente o patch documental interrompido foi reaplicado; este relatório novo foi
reescrito. Não houve reset de checkout, index ou código.

HTTPS/ChatGPT continuam manuais. Nenhum gate encerrado; deploy bloqueado.

Após recuperação: varredura de 1.151 arquivos textuais sem bytes nulos e
docs:check sem problemas. Formatação conferida. Contêiner parado da fixture
se7e-capabilities-20261019, label se7e.fixture=capabilities-20261019, removido por
ID exato. A inspeção de bancos após interrupção não foi possível porque estava
parado; não foi reiniciado apenas para limpeza. Remoção incluiu volumes anônimos
da própria fixture, sem acesso aos bancos operacionais.
