import { expect, it } from "vitest";
import {
  PERSONA_DIALECTS,
  PERSONA_DIALECT_EXAMPLES,
} from "../../../src/application/persona-v2/dialect-examples.js";
import { personaDialectGuide } from "../../../src/application/persona-v2/dialect-guide.js";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";
import { SQL_SUMMARY_EXAMPLES } from "../../../src/application/persona-v2/sql-summary-guidance.js";
const scope = escopoFromSqlModelo(
  parseSqlModelo(
    "SELECT s.branch_id, s.sale_id, s.product_id, s.quantity, s.net_amount, s.sold_at FROM fixture_sales s",
  ),
);
it.each(PERSONA_DIALECTS)(
  "validates published synthetic examples with the %s validator",
  (dialect) => {
    const guide = personaDialectGuide(dialect);
    expect(guide.examples).toEqual(PERSONA_DIALECT_EXAMPLES[dialect]);
    expect(guide.exampleScope).toContain("não comprova execução");
    for (const example of [...guide.examples, ...SQL_SUMMARY_EXAMPLES]) {
      expect(validateSourceSql(example.sql, dialect, scope).sql).toBe(example.sql);
      expect(() =>
        validateSourceSql(
          example.sql.replaceAll("s.net_amount", "s.private_amount"),
          dialect,
          scope,
        ),
      ).toThrow();
    }
  },
);
