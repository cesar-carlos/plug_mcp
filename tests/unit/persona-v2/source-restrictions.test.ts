import { expect, it } from "vitest";
import {
  enforceSourceRestrictions,
  parseSourceRestrictions,
} from "../../../src/application/persona-v2/source-restrictions.js";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";

const restrictions = [{ table: "orders", column: "id", parameter: "__scope_owner", value: 1 }];
const crypto = new NodeCryptoAdapter("a".repeat(64));
const scope = compileQueryTraining(queryTraining(), trainingSource, crypto).scope;
it.each([
  "SELECT p.id FROM orders p WHERE p.id = :__scope_owner",
  "SELECT p.id FROM orders p WHERE (p.id = :__scope_owner AND p.amount > 0) OR (p.id = :__scope_owner AND p.amount < 0)",
  "SELECT p.id FROM orders p WHERE :__scope_owner = p.id UNION SELECT q.id FROM orders q WHERE q.id = :__scope_owner",
  "WITH x AS (SELECT p.id FROM orders p WHERE p.id = :__scope_owner) SELECT x.id FROM x WHERE x.id > 0",
  "SELECT p.id FROM orders p JOIN orders q ON p.id=q.id WHERE p.id = :__scope_owner AND q.id = :__scope_owner",
  "SELECT p.id FROM orders p WHERE p.id = :__scope_owner AND EXISTS (SELECT q.id FROM orders q WHERE q.id = :__scope_owner)",
])("comprova recorte dominante em todas as ocorrências: %s", (sql) => {
  expect(() =>
    enforceSourceRestrictions(parseSelect(sql, "postgres"), scope, restrictions),
  ).not.toThrow();
});
it.each([
  "SELECT p.id FROM orders p WHERE p.id = :__scope_owner OR p.amount > 0",
  "SELECT p.id FROM orders p WHERE p.id = 1",
  "SELECT p.id FROM orders p WHERE NOT (p.id = :__scope_owner)",
  "SELECT p.id FROM orders p WHERE p.id = :__scope_owner UNION SELECT q.id FROM orders q WHERE q.id > 0",
  "WITH x AS (SELECT id FROM orders WHERE amount > 0) SELECT id FROM x WHERE id = :__scope_owner",
  "SELECT p.id FROM orders p JOIN orders q ON p.id=q.id WHERE p.id = :__scope_owner",
  "SELECT p.id FROM orders p WHERE p.id = :__scope_owner AND EXISTS (SELECT q.id FROM orders q WHERE q.amount > 0)",
])("recusa recorte que não domina cada caminho: %s", (sql) => {
  expect(() =>
    enforceSourceRestrictions(parseSelect(sql, "postgres"), scope, restrictions),
  ).toThrow();
});
it("recusa formato arbitrário, duplicação e parâmetro reservado conflitante", () => {
  for (const raw of [
    [{ company: 1 }],
    [...restrictions, ...restrictions],
    [restrictions[0], { table: "other", column: "id", parameter: "__scope_owner", value: 2 }],
  ])
    expect(() => parseSourceRestrictions(raw)).toThrow();
});
it("publicação exige recorte no modelo e não aceita contrato consumidor para binding reservado", () => {
  const source = { ...trainingSource, rowRestrictions: restrictions };
  expect(() => compileQueryTraining(queryTraining(), source, crypto)).toThrow();
  const training = {
    ...queryTraining(),
    sqlModel: "SELECT id,amount FROM orders WHERE id = :__scope_owner",
  };
  expect(() => compileQueryTraining(training, source, crypto)).not.toThrow();
  expect(() =>
    compileQueryTraining(
      {
        ...training,
        parameters: [
          { name: "__scope_owner", type: "number", required: true, meaning: "Não pode" },
        ],
      },
      source,
      crypto,
    ),
  ).toThrow();
});
