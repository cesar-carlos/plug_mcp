import { expect, it, vi } from "vitest";
import { PersonaMaintenance } from "../../../src/application/persona-v2/maintenance.js";
import type { PersonaAdministration } from "../../../src/application/persona-v2/administration.js";
import type {
  PersonaServices,
  PersonaTransaction,
} from "../../../src/domain/ports/persona-v2.port.js";
import type { SourceConnectionLifecyclePort } from "../../../src/domain/ports/source-credential.port.js";

it.each([false, true])("progresso não sobrepõe leituras na transação (falha=%s)", async (fail) => {
  let running = false;
  const calls: string[] = [];
  const publication = vi.fn(async (_persona: string, id: string) => {
    expect(running).toBe(false);
    running = true;
    calls.push(id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running = false;
    if (fail) throw new Error("fixture database failure");
    return null;
  });
  const tx = {
    findPersona: async () => ({ active: true, ownerId: "owner" }),
    setAdministrativeActor: async () => undefined,
    listSources: async () => [],
    listTokens: async () => [],
    lastCompletedQuery: async () => null,
    lastConsumerConnection: async () => null,
    catalog: {
      list: async () => [{ activePublicationId: "one" }, {}, { activePublicationId: "two" }],
      publication,
    },
  } as unknown as PersonaTransaction;
  const services = {
    now: () => new Date(),
    repository: {
      transaction: async (_locks: unknown, work: (value: PersonaTransaction) => Promise<unknown>) =>
        work(tx),
    },
  } as unknown as PersonaServices;
  const administration = {
    validateSession: async () => ({ owner: { id: "owner" }, expiresAt: new Date("2099-01-01") }),
  } as unknown as PersonaAdministration;
  const maintenance = new PersonaMaintenance(
    services,
    administration,
    {} as SourceConnectionLifecyclePort,
  );
  const result = maintenance.progress("session", "22222222-2222-4222-8222-222222222222");
  if (fail) {
    await expect(result).rejects.toThrow("fixture database failure");
    expect(calls).toEqual(["one"]);
  } else {
    const progress = await result;
    expect(calls).toEqual(["one", "two"]);
    expect(progress.steps.find((step) => step.id === "publication")?.state).toBe("disponivel");
    expect(progress.currentAvailabilityVerified).toBe(false);
  }
  expect(running).toBe(false);
});
