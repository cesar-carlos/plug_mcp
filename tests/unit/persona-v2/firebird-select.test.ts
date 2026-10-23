import { expect, it } from "vitest";
import { sourceDiscoverySchema } from "../../../src/domain/persona-v2/source-discovery.js";
import { queryTrainingSchema } from "../../../src/application/persona-v2/query-training.js";
import { operationTrainingSchema } from "../../../src/domain/persona-v2/operation-training.js";
import { personaDialectGuide } from "../../../src/application/persona-v2/dialect-guide.js";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";
import { sourceProof, queryTraining } from "../../helpers/persona-v2-training.js";
import { operationTraining } from "../../helpers/persona-v2-operation.js";

it("recusa Firebird na identidade, treinamento e guias; não adapta para outro motor", () => {
  expect(sourceDiscoverySchema.safeParse({ ...sourceProof(), dialect: "firebird" }).success).toBe(
    false,
  );
  expect(queryTrainingSchema.safeParse({ ...queryTraining(), dialect: "firebird" }).success).toBe(
    false,
  );
  expect(
    operationTrainingSchema.safeParse({ ...operationTraining(), dialect: "firebird" }).success,
  ).toBe(false);
  expect(() => personaDialectGuide("firebird")).toThrow("Firebird não é suportado");
  expect(() =>
    validateSourceSql("SELECT id FROM orders", "firebird", {
      tabelas: [],
      colunasPorTabela: {},
      relacionamentos: [],
      graoPorTabela: {},
      graoResultado: [],
      metricasSaida: [],
      pacoteVersao: 2,
    }),
  ).toThrow();
});
