# Comparação delegada de conhecimento — 2026-10-20

## Implementação e evidência

`comparar_conhecimento({fromSkillId,toSkillId})` compara seções dos recortes
adotados por duas consultas concedidas do mesmo padrão. Usa os serviços de
autorização existentes na mesma transação, com locks dos catálogos ordenados.
Retorna referências exatas, direção e conteúdo anterior/posterior por seção.
Não percorre publicações integrais ou rascunhos do catálogo.

Rodada PostgreSQL de controle: **14 testes aprovados em 10,17 segundos**, nas
suítes `structure-composition.postgres.test.ts` e `knowledge-context.postgres.test.ts`.
Inclui diferenças de versão, direção reversa, comparação idêntica, tool MCP real,
ausência de concessão, skill desconhecida e suspensão de versão. Publicação
não adotada não aparece. Autoridade remota e inspeção dessas suítes são fixtures;
essa rodada não comprova consulta na cadeia persistente.

Contêiner dedicado `se7e_compare_fe3a86f2a97f_test`, PostgreSQL 17, removido no
finally. Nenhuma base operacional ou migration aplicada foi alterada.
Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` mais alterações locais.
Node 24 e TypeScript 7 do projeto. Tipos passaram; lint inicialmente indicou
tipo de retorno ausente e simplificação de expressão, corrigidos sem ampliar
autoridade. Mudanças de contrato, runtime, rules e plano acompanham a entrega.

Lint dirigido, build, formatação e docs:check passaram após as correções.
SHA-256 dos arquivos finais:

- `consumer-catalog.ts`: `db823e5f1e04543aa5d15c8a64f52b0c96843249af1914f74104a728a8509dfe`.
- `persona-v2-http.ts`: `d84512790ebc7b134df66fe862cb437e7ccaf602bb6d0171555bcd4d96ee72dc`.
- `structure-composition.postgres.test.ts`: `35efb968c8f7bc579464f379f7c567b1646b65b5e81d0fd6fccff6c0a5eb37bd`.

## Limites

Comparação por seção não representa diff global do catálogo. Recortes e perfis
distintos podem gerar diferenças sem mudança da versão comum. Não comprova
equivalência física ou semântica e não adota versões nem concede execução.

Cadeia persistente, OAuth da nova tool, matriz concorrente ampliada e outros
tipos de skill continuam pendentes. A evidência OAuth do histórico não certifica
automaticamente esta comparação. HTTPS/ChatGPT permanecem manuais. Deploy
bloqueado com ready:false, sem gates concluídos.
