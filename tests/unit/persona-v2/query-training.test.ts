import { describe, expect, it } from "vitest";
import {
  compileQueryTraining,
  sourceFingerprint,
} from "../../../src/application/persona-v2/query-training.js";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
describe("pacote de consulta persona-v2", () => {
  it("não publica a tabela técnica de identidade como conhecimento consultável", () => {
    for (const name of ["se7e_source_identity", "dba.se7e_source_identity"]) {
      const training = queryTraining();
      training.tables[0]!.name = name;
      expect(() => compileQueryTraining(training, trainingSource, crypto)).toThrow(/reservada/);
    }
  });
  it("deriva concessões físicas e de contrato sem depender da ordem das chaves JSON", () => {
    const pkg = compileQueryTraining(queryTraining(), trainingSource, crypto);
    expect(pkg.requiredCapabilities).toContain(`column:${trainingSource.id}:orders.amount`);
    expect(pkg.requiredCapabilities).toHaveLength(3);
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(
      compileQueryTraining({ ...queryTraining(), purpose: "Outro texto" }, trainingSource, crypto)
        .requiredCapabilities,
    ).toEqual(pkg.requiredCapabilities);
    expect(
      compileQueryTraining({ ...queryTraining(), rules: ["Apenas BRL"] }, trainingSource, crypto)
        .requiredCapabilities,
    ).not.toEqual(pkg.requiredCapabilities);
  });
  it.each([
    "DELETE FROM orders WHERE id > :minimum",
    "SELECT p.* FROM orders p WHERE p.id > :minimum",
    "SELECT p.password FROM orders p WHERE p.id > :minimum",
    "SELECT p.id FROM alien p WHERE p.id > :minimum",
    "SELECT p.id FROM orders p WHERE p.id > :minimum; DROP TABLE orders",
    "SELECT p.id INTO stolen FROM orders p WHERE p.id > :minimum",
  ])("recusa SQL fora do contrato inteiro: %s", (sqlModel) => {
    expect(() =>
      compileQueryTraining({ ...queryTraining(), sqlModel }, trainingSource, crypto),
    ).toThrow();
  });
  it("não promove classificação sensível/inferida a leitura por aparecer no SQL", () => {
    for (const classification of ["sensivel", "pessoal", "segredo", "inferido"] as const) {
      const training = queryTraining();
      expect(() =>
        compileQueryTraining(
          {
            ...training,
            columns: training.columns.map((c) =>
              c.name === "amount" ? { ...c, classification } : c,
            ),
          },
          trainingSource,
          crypto,
        ),
      ).toThrow();
    }
  });
  it("recusa referência, dialeto, parâmetro e segredo inválidos", () => {
    const training = queryTraining();
    for (const changed of [
      { ...training, dialect: "firebird" },
      { ...training, parameters: [] },
      { ...training, tables: [...training.tables, ...training.tables] },
      { ...training, tables: [{ ...training.tables[0], grain: ["missing"] }] },
      { ...training, purpose: "senha=synthetic_password" },
    ])
      expect(() => compileQueryTraining(changed, trainingSource, crypto)).toThrow();
    expect(() =>
      compileQueryTraining({ ...training, dialect: "firebird" }, trainingSource, crypto),
    ).toThrow();
  });
  it("credencial, recortes e fonte física participam da vinculação da publicação", () => {
    expect(
      compileQueryTraining(
        {
          ...queryTraining(),
          sqlModel: "SELECT p.id, p.amount FROM orders p WHERE p.id = :__scope_id",
        },
        {
          ...trainingSource,
          rowRestrictions: [{ table: "orders", column: "id", parameter: "__scope_id", value: 2 }],
        },
        crypto,
      ).requiredCapabilities,
    ).not.toEqual(
      compileQueryTraining(queryTraining(), trainingSource, crypto).requiredCapabilities,
    );
    const initial = sourceFingerprint(trainingSource, crypto);
    for (const source of [
      { ...trainingSource, credentialVersion: 2 },
      { ...trainingSource, rowRestrictions: [{ table: "orders", column: "company", value: 2 }] },
      { ...trainingSource, physicalSourceId: "other" },
      { ...trainingSource, authorizationVersion: 2 },
    ])
      expect(sourceFingerprint(source, crypto)).not.toBe(initial);
  });
});
