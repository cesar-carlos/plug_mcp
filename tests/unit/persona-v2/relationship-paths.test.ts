import { expect, it } from "vitest";
import { relationshipFixture } from "../../helpers/persona-v2-relationships.js";
import { trainingSource } from "../../helpers/persona-v2-training.js";
import { compareStructureEvidence } from "../../../src/application/persona-v2/structure-compatibility.js";
import { constraintExpectation } from "../../../src/application/persona-v2/constraint-expectation.js";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";
import { matchesSharedRelationship } from "../../../src/application/persona-v2/shared-relationship.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
const crypto = new NodeCryptoAdapter("ab".repeat(32));

it("1:1 reversa exige unicidade coberta e recusa ambiguidade entre FKs opostas", () => {
  const f = relationshipFixture();
  const relation = f.content.relationships[0]!;
  relation.cardinality = "1:1";
  f.evidence.resources[1]!.uniqueKeys = [
    { name: "uq_left", columns: ["tenant_id", "left_id"], status: "enabled" },
  ];
  expect(compareStructureEvidence(f.content, f.evidence).status).toBe("compatible");
  expect(
    constraintExpectation(f.content, f.evidence, "rel_link").uniqueKeys.map((k) => k.name),
  ).toEqual(["uq_left"]);
  f.evidence.resources[1]!.coverage.uniqueKeys = false;
  expect(compareStructureEvidence(f.content, f.evidence).status).toBe("inconclusive");
  f.evidence.resources[1]!.coverage.uniqueKeys = true;
  delete relation.constraintName;
  f.evidence.resources[0]!.foreignKeys = [
    {
      name: "fk_opposite",
      columns: ["tenant_id", "left_id"],
      target: { schema: "public", name: "rel_link", type: "table" },
      targetColumns: ["tenant_id", "left_id"],
      status: "enabled",
    },
  ];
  expect(compareStructureEvidence(f.content, f.evidence).status).toBe("inconclusive");
  relation.constraintName = "fk_rel_left";
  expect(compareStructureEvidence(f.content, f.evidence).status).toBe("compatible");
});

it("prova 1:N reversa na tabela filha e conserva pares ordenados", () => {
  const f = relationshipFixture();
  expect(compareStructureEvidence(f.content, f.evidence).status).toBe("compatible");
  expect(constraintExpectation(f.content, f.evidence, "rel_left").foreignKeys).toEqual([]);
  expect(
    constraintExpectation(f.content, f.evidence, "rel_link").foreignKeys.map((k) => k.name),
  ).toEqual(["fk_rel_left", "fk_rel_right"]);
  f.evidence.resources[1]!.foreignKeys[0]!.columns.reverse();
  expect(compareStructureEvidence(f.content, f.evidence)).toMatchObject({
    status: "incompatible",
    issues: [{ resource: "left_links", code: "RELATIONSHIP_DIFFERS" }],
  });
});
it("não habilita caminho com elo desconhecido, desabilitado ou fora do schema", () => {
  const f = relationshipFixture();
  f.evidence.resources[1]!.foreignKeys[1]!.status = "unknown";
  expect(compareStructureEvidence(f.content, f.evidence).status).toBe("inconclusive");
  f.evidence.resources[1]!.foreignKeys[1]!.status = "disabled";
  expect(compareStructureEvidence(f.content, f.evidence).status).toBe("incompatible");
  f.evidence.resources[1]!.foreignKeys[1]!.status = "enabled";
  f.evidence.resources[1]!.foreignKeys[1]!.target.schema = "hidden";
  expect(compareStructureEvidence(f.content, f.evidence).status).toBe("incompatible");
});
it("caminho físico não herda enforcement de um elo apenas comercial", () => {
  const f = relationshipFixture();
  f.content.relationships[0]!.origin = "business";
  delete f.content.relationships[0]!.constraintName;
  delete f.content.relationships[0]!.constraintStatus;
  expect(compareStructureEvidence(f.content, f.evidence)).toMatchObject({
    status: "inconclusive",
    issues: [{ code: "RELATIONSHIP_PATH_NOT_PROVEN" }],
  });
});
it("publica só os elos físicos na allowlist SQL e recusa atalho entre extremidades", () => {
  const f = relationshipFixture();
  const pkg = compileQueryTraining(f.training, trainingSource, crypto);
  expect(pkg.scope.relacionamentos).toHaveLength(2);
  expect(() =>
    validateSourceSql(
      'SELECT a.left_id AS "left_id",b.right_id AS "right_id" FROM public.rel_left a INNER JOIN public.rel_right b ON a.tenant_id=b.tenant_id AND a.left_id=b.right_id',
      "postgres",
      pkg.scope,
    ),
  ).toThrow();
  expect(() =>
    compileQueryTraining(
      { ...f.training, relationships: f.training.relationships.slice(1) },
      trainingSource,
      crypto,
    ),
  ).toThrow("Elos");
});
it("exige os metadados explícitos do caminho adotado, sem promover snapshot antigo", () => {
  const f = relationshipFixture(),
    r = f.training.relationships[2]!,
    common = f.content.relationships[2]!;
  expect(matchesSharedRelationship(f.content, "postgres", r, common)).toBe(true);
  const { id: _id, via: _via, path: _path, ...old } = r;
  expect(matchesSharedRelationship(f.content, "postgres", old, common)).toBe(false);
  expect(
    matchesSharedRelationship(
      f.content,
      "postgres",
      { ...r, path: ["link_right", "left_links"] },
      common,
    ),
  ).toBe(false);
});
