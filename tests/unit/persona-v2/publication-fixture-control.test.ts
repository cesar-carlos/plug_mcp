import { expect, it } from "vitest";
import { publicationRunManifestSchema } from "../../../src/infrastructure/persistence/persona-v2/publication-fixture-control.js";

const manifest = {
  version: 1,
  runId: "se7e_persona_123456789abc_test",
  sessionRoot: "fixture-session",
  hubUrl: "http://127.0.0.1:12345/",
  personaId: "11111111-1111-4111-8111-111111111111",
  skillId: "22222222-2222-4222-8222-222222222222",
  bindings: [
    {
      sourceId: "33333333-3333-4333-8333-333333333333",
      fixtureSourceId: "44444444-4444-4444-8444-444444444444",
      tables: [{ table: "orders", columns: [{ name: "id", type: "integer" }], primaryKey: ["id"] }],
    },
  ],
};

it("aceita manifesto local explícito sem credenciais", () => {
  expect(publicationRunManifestSchema.safeParse(manifest).success).toBe(true);
});
it.each([
  "https://production.example/",
  "http://localhost:12345/",
  "http://127.0.0.1/",
  "http://user:secret@127.0.0.1:12345/",
  "http://127.0.0.1:12345/?token=secret",
  "http://127.0.0.1:12345/api",
])("recusa destino não isolado ou com conteúdo adicional: %s", (hubUrl) => {
  expect(publicationRunManifestSchema.safeParse({ ...manifest, hubUrl }).success).toBe(false);
});
it("recusa credenciais e reutilização de vínculo físico", () => {
  expect(publicationRunManifestSchema.safeParse({ ...manifest, password: "secret" }).success).toBe(
    false,
  );
  expect(
    publicationRunManifestSchema.safeParse({
      ...manifest,
      bindings: [...manifest.bindings, ...manifest.bindings],
    }).success,
  ).toBe(false);
});
