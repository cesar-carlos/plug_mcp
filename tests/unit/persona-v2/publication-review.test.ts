import { expect, it } from "vitest";
import { publicationReview } from "../../../src/application/persona-v2/publication-review.js";
import {
  compileQueryTraining,
  queryTrainingSchema,
} from "../../../src/application/persona-v2/query-training.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { operationTraining } from "../../helpers/persona-v2-operation.js";
import { compileOperationTraining } from "../../../src/application/persona-v2/operation-training.js";
const crypto = new NodeCryptoAdapter("a".repeat(64));
const pkg = () => ({
  ...compileQueryTraining(queryTraining(), trainingSource, crypto),
  name: "Pedidos",
});
it("mostra reordenação semântica das etapas SQL mesmo com IDs e conteúdo preservados", () => {
  const training = operationTraining(trainingSource.id);
  training.maxAffectedRows = 2;
  training.steps = ["primeira", "segunda"].map((id) => ({ ...training.steps[0]!, id }));
  const previous = compileOperationTraining(training, trainingSource, crypto, "Operação");
  const next = compileOperationTraining(
    { ...training, steps: [...training.steps].reverse() },
    trainingSource,
    crypto,
    "Operação",
  );
  expect(publicationReview(previous, next).flatMap((s) => s.changes)).toContainEqual({
    kind: "changed",
    path: "training/steps/order",
    label: "Treinamento › Etapas › Ordem de execução",
    before: ["primeira", "segunda"],
    after: ["segunda", "primeira"],
  });
});
it("agrupa estrutura, exemplos, regras e capacidades na primeira publicação sem aprovar significado", () => {
  const review = publicationReview(null, pkg());
  expect(review.map((s) => s.id)).toEqual(
    expect.arrayContaining(["structure", "examples", "rules", "dependencies", "capabilities"]),
  );
  expect(review.flatMap((s) => s.changes).every((c) => c.kind === "added")).toBe(true);
});
it("ignora reordenação de definições estáveis e mantém comparação de alterações de significado", () => {
  const previous = pkg(),
    training = queryTrainingSchema.parse(previous.training);
  const next = { ...previous, training: { ...training, columns: [...training.columns].reverse() } };
  expect(publicationReview(previous, next)).toEqual([]);
  next.training.columns[0]!.meaning = "Significado revisado";
  expect(publicationReview(previous, next).find((s) => s.id === "structure")?.changes).toEqual([
    expect.objectContaining({
      kind: "changed",
      path: expect.stringContaining("/meaning"),
      label: expect.stringContaining("Significado"),
      before: expect.any(String),
      after: "Significado revisado",
    }),
  ]);
});
it("mantém diferenças de SQL e não interpreta execução como aprovação", () => {
  const previous = pkg(),
    next = { ...previous, sqlModel: previous.sqlModel.replace(" > :minimum", " >= :minimum") };
  expect(
    publicationReview(previous, next).find((s) => s.id === "examples")?.changes,
  ).toContainEqual(
    expect.objectContaining({
      kind: "changed",
      path: "sqlModel",
      label: "SQL principal",
      before: previous.sqlModel,
      after: next.sqlModel,
    }),
  );
  expect(JSON.stringify(publicationReview(previous, next))).not.toContain("approved");
});
it("distingue ausência, nulo e objeto vazio no conteúdo comparado", () => {
  const previous = { ...pkg(), training: {} };
  const next = { ...previous, training: { note: null, mapping: {} } };
  const changes = publicationReview(previous, next).flatMap((section) => section.changes);
  expect(changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "added", path: "training/note", after: null }),
      expect.objectContaining({ kind: "added", path: "training/mapping", after: {} }),
    ]),
  );
  expect(publicationReview(next, previous).flatMap((section) => section.changes)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "removed", path: "training/note", before: null }),
      expect.objectContaining({ kind: "removed", path: "training/mapping", before: {} }),
    ]),
  );
});
