/** SQL is synthetic and locally validated; never evidence of native-engine execution. */
export const PERSONA_DIALECTS = ["postgres", "mssql", "sybase"] as const;
export const PERSONA_DIALECT_EXAMPLES = {
  postgres: [
    {
      purpose: "Ano civil do calendário publicado",
      sql: "SELECT EXTRACT(YEAR FROM s.sold_at) AS sale_year, SUM(s.net_amount) AS total_amount FROM fixture_sales s WHERE s.sold_at >= :start AND s.sold_at < :end GROUP BY EXTRACT(YEAR FROM s.sold_at) ORDER BY sale_year",
    },
  ],
  mssql: [
    {
      purpose: "Ano civil do calendário publicado",
      sql: "SELECT YEAR(s.sold_at) AS sale_year, SUM(s.net_amount) AS total_amount FROM fixture_sales s WHERE s.sold_at >= :start AND s.sold_at < :end GROUP BY YEAR(s.sold_at) ORDER BY sale_year",
    },
  ],
  sybase: [
    {
      purpose: "Ano civil do calendário publicado",
      sql: "SELECT YEAR(s.sold_at) AS sale_year, SUM(s.net_amount) AS total_amount FROM fixture_sales s WHERE s.sold_at >= :start AND s.sold_at < :end GROUP BY YEAR(s.sold_at) ORDER BY sale_year",
    },
  ],
} as const;
for (const examples of Object.values(PERSONA_DIALECT_EXAMPLES)) {
  for (const example of examples) Object.freeze(example);
  Object.freeze(examples);
}
Object.freeze(PERSONA_DIALECT_EXAMPLES);
