/** Session guidance only: does not publish skills or grant SQL authority. */
export const SQL_SUMMARY_GUIDANCE = `## Resumos SQL na fonte

Modelos publicados podem usar SELECT em uma linha e a projeção na seguinte. O transporte v2 prepara esse separador para o agente; preserve o recorte e os parâmetros do modelo.

Para totais, contagens, indicadores e resumos por produto, classe ou período de uma única fonte, prefira calcular no banco e retornar somente dimensões e medidas necessárias. Use WHERE para o recorte e GROUP BY com SUM, COUNT, MIN, MAX ou AVG quando o significado publicado permitir; HAVING filtra grupos. Não baixe linhas detalhadas para somar no chat quando um resumo autorizado resolve a pergunta. Detalhamento solicitado continua sendo uma consulta própria, com seus limites. O plug_server encaminha o SQL ao plug_agente; o banco executa a agregação, sem reescrita de dialeto ou agregação automática pelo hub.

Antes de consultar, leia obter_skill, dialeto, medida, grão, chaves, cardinalidade, filtros e finalidades. Em SQL Server, use colunas/expressões físicas qualificadas no GROUP BY e no HAVING, nunca aliases de saída do mesmo SELECT. ORDER BY pode usar aliases únicos simples projetados; inclua desempate projetado e estável ao paginar. CTE/derivada só pode usar recursos e expressões aceitos no pacote e no validador. Valores ficam em params tipados. Preserve moeda, escala decimal, nulos, calendário e fuso treinados; para timestamps, use intervalo início inclusivo/fim exclusivo quando essa for a regra publicada. Não aplique CAST, arredondamento ou substituição de NULL para mascarar divergências. AVG de médias de grupos não é média global: preserve soma e contagem compatíveis quando treinado.

Evite multiplicar medidas de cabeçalho por itens em JOIN 1:N ou N:N. Agregue cada medida no seu grão confirmado antes de combinar, somente se os relacionamentos publicados permitirem. Nunca use SUM(DISTINCT valor) como remendo: valores iguais podem pertencer a vendas distintas. Concilie itens e cabeçalhos por período, filial, status, cancelamentos, devoluções, descontos, frete, impostos, moeda, grão e regra publicados; não invente rateios nem force igualdade. Validação técnica não aprova a métrica de negócio.

Curva ABC requer o universo completo do recorte: agregar por produto, calcular total e acumulado sobre todos os produtos, classificar segundo medida, limites, empates e tratamento de valores zero/negativos treinados, e só então resumir por classe ou paginar a apresentação. Não presumir percentuais de corte. Não calcular denominador ou classes apenas sobre TOP/LIMIT, primeira página de 500 linhas ou subconsulta já truncada. Funções de janela e CTEs dependem do dialeto e do validador; não prometer suporte irrestrito nem contornar recusa. Se o plano completo não estiver autorizado/suportado, explique a lacuna para revisão do treinamento em vez de apresentar uma ABC parcial como definitiva.

Leia completeness, pagination, limits e provenance mesmo quando vierem poucas linhas agregadas. Uma linha de total não prova que sua entrada estava completa; hasNextPage:false e a última página isolada também não provam o universo inteiro. Se for necessário paginar detalhes, preserve recorte e ordem e confira a cobertura, sem presumir snapshot simultâneo entre chamadas ou ampliar tetos. Resultado parcial permanece parcial; não execute laços de retry nem altere SQL para contornar limites. Em recusa local, informe code/source/stage/supportId, revise explicitamente o plano e use validar_consulta para validação técnica; em transporte, não reescreva SQL nem reenvie automaticamente.
`;

/** Synthetic examples, never an operational schema or a pre-approved query. */
export const SQL_SUMMARY_EXAMPLES = [
  {
    dialect: "mssql" as const,
    purpose: "Fixture: resumo por produto, sem corte antes do agrupamento.",
    sql: "SELECT s.product_id AS product, SUM(s.net_amount) AS total_amount, COUNT(*) AS item_count FROM fixture_sales s WHERE s.sold_at >= :start AND s.sold_at < :end GROUP BY s.product_id ORDER BY total_amount DESC, product",
  },
  {
    dialect: "mssql" as const,
    purpose:
      "Fixture: total e contagem de produtos sobre todos os grupos do recorte; não calcula classes ABC.",
    sql: "WITH products AS (SELECT s.product_id AS product, SUM(s.net_amount) AS total_amount FROM fixture_sales s WHERE s.sold_at >= :start AND s.sold_at < :end GROUP BY s.product_id) SELECT COUNT(*) AS product_count, SUM(p.total_amount) AS grand_total FROM products p",
  },
] as const;
