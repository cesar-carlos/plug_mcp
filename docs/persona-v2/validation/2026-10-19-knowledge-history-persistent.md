# Histórico compartilhado pela cadeia persistente — 2026-10-19

## Resultado

**6 testes aprovados em 228,45 segundos**, hub Prisma, PostgreSQL, SQL Server e
SQL Anywhere isolados. Filtro explícito:
`inspeciona metadados pela conexão|publica adoção explícita`.
Os outros 73 casos foram excluídos pelo filtro, sem representar aceite integral.

O percurso usa identidade Client, concessões e persistência reais. Inspeção,
publicação e consulta seguem MCP → hub → agente. Uma segunda versão do padrão
é publicada e adotada por outra skill, sem reaproveitar o perfil físico da
primeira versão. A nova skill executa consulta com proveniência conferida.

- Publicar a nova versão não altera o histórico do token anterior.
- Token concedido às duas skills vê ambas as versões na ordem prevista.
- Continuação por cursor retorna somente o vínculo seguinte.
- Token anterior não usa a nova skill como âncora ou cursor.
- Suspender o perfil antigo bloqueia sua âncora e cursor, preservando o vínculo
  independente da nova versão.
- Revogação do token bloqueia a leitura com HTTP 401.
- Histórico não retorna SQL ou conteúdo do treinamento.

## Verificações e candidato

Tipos, lint dirigido, build, formatação e training:check passaram. Não houve
correção de produção. Docs/rules e plano restante acompanham a evidência.

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, mais alterações locais.
Hub fixado e verificado: `0dc94d6990167f65e093b1fb68a8150630e2057c`.
Node 24 do wrapper e TypeScript 7. Provisionador PostgreSQL 17, SQL Server 2022
Developer e SQL Anywhere 16; versões exatas dos drivers não foram transcritas.
Hash SHA-256 de `tests/homologation/persona-chain.test.ts`:
`9bf51321e9817c4390c381b1e436f97324145d1cfd3f0927ac2b604768cd9052`.

Fixture `se7e_persona_e9e323c924bf_test` removida pelo teardown, somente recursos
próprios. Nenhuma fonte operacional, migration, alteração de hub/agente, commit,
push ou deploy. A duração maior não exigiu relaxar timeout ou autorização.

## Limites

Histórico desta rodada usa Bearer. OAuth do histórico, comparação delegada,
outros tipos de skill, carga e candidato final seguem pendentes. A paginação
com vinte vínculos foi validada na rodada PostgreSQL anterior; aqui a
continuação usa duas versões reais. HTTPS público e ChatGPT continuam manuais.
ready:false e gates permanecem abertos.
