# Desempenho v2 — 8 de novembro de 2026

Rodada local sobre alterações ainda não publicadas no momento da medição,
posteriormente incorporadas ao commit `711aa21`. Node 24.21.0, Windows,
PostgreSQL 17 em container descartável, exposto somente em loopback. Nenhuma
consulta operacional ou teste em produção. Não certifica outros motores, aceite
integral para clientes ou release.

## Alterações e medições

Aplicadas em ordem: leitura em lote do catálogo, redução do trabalho sob locks,
serialização única do envelope, cache limitado do grafo derivado com intercalação
ordenada de páginas e eliminação de cópias redundantes de anexos.

| Trecho medido                       |      Antes |    Depois |            Redução |
| ----------------------------------- | ---------: | --------: | -----------------: |
| SELECTs para oito publicações       |          8 |         1 |              87,5% |
| Espera mediana no lock da persona   | 19,5662 ms | 6,6986 ms |              65,8% |
| Cálculo de bytes da resposta        |  1,1766 ms | 0,5901 ms |              49,8% |
| Reconstrução repetida do grafo      |  0,2792 ms | 0,1318 ms |              52,8% |
| Identificação da assinatura binária |  1,2917 ms | 0,0022 ms | sem cópia de 8 MiB |

Catálogo: oito publicações reais da fixture; 12 rodadas alternando caminhos,
duas conexões e lock de persona preservado. O baseline chama a leitura individual
oito vezes; o lote precisa devolver os mesmos objetos, deduplicar IDs e isolar
personas. A espera inclui leituras e commit, não a jornada MCP completa.

CPU: 10 aquecimentos, 31 rodadas alternadas, mediana; resposta sintética de 5.000
linhas, grafo de 202 colunas e binário de 8 MiB. Baselines: duas serializações,
reconstrução do grafo a cada acesso e cópia integral antes de identificar MIME.
O cache evita reconstrução, mas continua copiando metadados por JSON.parse.
Estas medições não comprovam ganhos equivalentes na latência total, heap ou
tráfego de produção. Evicção e primeira construção não têm o ganho de cache hit.

## Segurança e regressões

Concessões são filtradas antes do carregamento em lote; vínculos, hashes,
suspensão e locks permanecem. O grafo revalida autoridade/snapshot antes de cada
acesso e usa chave persona/publicação/hash, limite de 64 entradas e 8 MiB
serializados; não guarda decisões de acesso ou resultados SQL. Retornos são
independentes. Cursor, filtros, ordenação e revogação continuam ativos.

O envelope conserva teto UTF-8 e revalidação na entrega. Anexos preservam cifra,
base64 canônico, offset/comprimento, quotas, validade e isolamento. Não há migration,
retry SQL ou afrouxamento de autorização.

As três suítes persistentes (knowledge-context, source-query e attachments)
passaram: 71 testes. Cobrem autorização, revogação, paginação, dependências e
recuperação persistente. Regressões unitárias verificam serialização única,
limites/isolamento do cache, equivalência da ordenação e visão binária sem cópia.
Na suíte geral, duas expectativas antigas de log foram corrigidas para exigir
também o status HTTP seguro, sem remover verificações de supportId ou segredos.

Resultado final: 1.924 testes unitários/contratos em 204 arquivos passaram.
Após o último ajuste, os 12 testes persistentes de anexos passaram novamente
(subconjunto dos 71, não somar). Typecheck, build, lint e validação documental
passaram; docs:check encontrou zero problemas. Fixture descartada ao concluir.

## Reprodução

Executar com o Node fixado no projeto:

```sh
node --import tsx scripts/benchmark-persona-performance.ts
node node_modules/vitest/vitest.mjs run tests/unit tests/contract
node node_modules/vitest/vitest.mjs run --config vitest.persona-v2.config.ts tests/persona-v2/knowledge-context.postgres.test.ts tests/persona-v2/source-query.postgres.test.ts tests/persona-v2/attachments.postgres.test.ts
```

O último comando exige `PERSONA_V2_TEST_DATABASE_URL` apontando exclusivamente
para PostgreSQL isolado. Suítes criam/removem bancos próprios. Relatórios brutos
locais ficam em `test-results/performance-cpu.json` e
`test-results/performance-catalog.json`, sem credenciais ou dados operacionais.
