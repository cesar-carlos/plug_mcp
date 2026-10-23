> Histórico: Firebird foi retirado do suporte em 2026-10-14. Este documento descreve a implementação anterior; não é contrato vigente nem autorização de uso.

# SELECT adaptável Firebird na persona-v2

A entrada de desenvolvimento usa parser próprio; não interpreta Firebird como
T-SQL e não reescreve SQL enviado ao motor. Publicação, concessões de fonte/skill,
classificação, recortes, relacionamento composto e análise de fanout continuam
obrigatórios. O caminho legado mantém seu contrato anterior.
O resource público `guia://dialeto/firebird` na entrada v2 descreve essa gramática;
o guia legado continua separado. Paginação gerenciada por `options.page` ainda
depende de validação operacional do agente; os testes desta rodada usam limites
Firebird explícitos, não certificam a reescrita gerenciada do agente.

Gramática inicial:

- Um SELECT com projeção nomeada; aliases explícitos para expressões.
- Tabelas/views simples, com aliases; INNER JOIN e LEFT [OUTER] JOIN com ON.
- Parâmetros `:nome`, literais SQL padrão e expressões aritméticas.
- Comparações, AND/OR/NOT, IS [NOT] NULL, IN, LIKE, CONTAINING e STARTING WITH.
- GROUP BY, HAVING e ORDER BY com ASC/DESC e NULLS FIRST/LAST.
- FIRST/SKIP inteiros ou ROWS inteiro [TO inteiro]. Limites declarados tornam
  o resultado incompleto e impedem seu uso como entrada completa de cruzamento.
- COUNT/SUM/AVG/MIN/MAX/LIST, CAST e funções puras enumeradas no parser,
  como COALESCE, NULLIF, IIF, ABS, ROUND, UPPER/LOWER e CHAR_LENGTH.

CTEs, subconsultas, UNION, janelas, BETWEEN, `SELECT *`, funções externas,
procedures, sequências, DML/DDL, comentários, scripts e sintaxe de outros motores
são recusados nesta gramática. `COUNT(*)` é agregação, não projeção livre.
São aceitos até 30.000 bytes, 4.000 tokens e 32 níveis de expressão/parênteses.
Identificadores físicos usam ASCII: sem aspas começam por letra; com aspas devem
estar em maiúsculas canônicas. Nomes físicos entre aspas com outra caixa são
recusados porque a autorização compartilhada compara nomes sem distinguir caixa.
Aliases de saída entre aspas podem usar minúsculas. Não há schemas qualificados
nesta primeira gramática Firebird.

```sql
SELECT p.revision AS revision,
       CAST(SUM(p.amount) AS DECIMAL(18,2)) AS amount
FROM operation_fixture p
WHERE p.id > :minimum
GROUP BY p.revision
HAVING SUM(p.amount) > 0
ORDER BY p.revision
```

O exemplo usa exclusivamente a fixture sintética da homologação. Firebird 4/5
pode ampliar SUM(DECIMAL) para precisão que o driver ODBC 02.00.0156 não consegue
materializar. Quando necessário, treine CAST explícito para a precisão e escala
de negócio; overflow continua sendo erro. O MCP não introduz esse CAST por conta
própria nem declara toda conversão numérica homologada.

`validar_consulta` executa o mesmo preflight e um envelope vazio com alias
`MCP_VALIDACAO`, válido no motor. Recortes precisam dominar todos os caminhos
lógicos; limites, ORDER BY ou aprovação de um exemplo não dispensam esses gates.
Resultados binários continuam recusados na persona-v2.

Sete casos SELECT reais passaram em Firebird 5.0.4/ODBC 02.00.0156: modelo,
FIRST/SKIP, ROWS, agregação com precisão explícita, CONTAINING/CAST, LEFT JOIN e
envelope vazio. A cadeia real completa de JWT/policy/hub ainda exige aceite.
Consulte [validação](validation.md); o deploy permanece bloqueado.
