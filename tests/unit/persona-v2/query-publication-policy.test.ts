import { expect, it, vi } from "vitest";
import { PersonaCatalog } from "../../../src/application/persona-v2/catalog.js";
import type { PersonaAdministration } from "../../../src/application/persona-v2/administration.js";
import type {
  PersonaServices,
  PersonaTransaction,
} from "../../../src/domain/ports/persona-v2.port.js";
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";

it("publication preview refuses absent, optional and stale evidence without creating a preview", async () => {
  let cases: TrainingCase[] = [];
  const approvedReport = vi.fn(async () => false);
  const savePreview = vi.fn();
  const draft = {
    id: "skill",
    personaId: trainingSource.personaId,
    slug: "orders",
    name: "Total",
    kind: "consulta",
    revision: 3,
    activePublicationId: null,
    training: {
      ...queryTraining(),
      sqlModel: "SELECT SUM(p.amount) AS total FROM orders p WHERE p.id > :minimum",
    },
  };
  const tx = {
    findPersona: async () => ({ active: true, ownerId: "owner", authorizationVersion: 1 }),
    setAdministrativeActor: async () => undefined,
    listSources: async () => [trainingSource],
    catalog: { find: async () => draft, cases: async () => cases, approvedReport, savePreview },
  } as unknown as PersonaTransaction;
  const services = {
    crypto: new NodeCryptoAdapter("a".repeat(64)),
    now: () => new Date("2026-10-30T12:00:00Z"),
    repository: {
      transaction: async (_locks: unknown, action: (tx: PersonaTransaction) => Promise<unknown>) =>
        action(tx),
    },
  } as unknown as PersonaServices;
  const administration = {
    validateSession: async () => ({ owner: { id: "owner" } }),
  } as unknown as PersonaAdministration;
  const catalog = new PersonaCatalog(services, administration);
  const preview = () => catalog.preview("session", trainingSource.personaId, draft.id);
  await expect(preview()).rejects.toMatchObject({ code: "INCOMPLETE_INPUT" });
  cases = [{ id: "case", required: false, content: {} }];
  await expect(preview()).rejects.toMatchObject({ code: "INCOMPLETE_INPUT" });
  expect(approvedReport).not.toHaveBeenCalled();
  cases = [{ ...cases[0]!, required: true }];
  await expect(preview()).rejects.toThrow(/relatório aprovado e atual/);
  expect(approvedReport).toHaveBeenCalledWith(
    trainingSource.personaId,
    "skill",
    3,
    expect.stringMatching(/^[a-f0-9]{64}$/),
    expect.stringMatching(/^[a-f0-9]{64}$/),
  );
  expect(savePreview).not.toHaveBeenCalled();
  expect(draft.activePublicationId).toBeNull();
});
