import { expect } from "vitest";
import type { PersonaRepositoryPort } from "../../src/domain/ports/persona-v2.port.js";
import { queryTrainingSchema } from "../../src/application/persona-v2/query-training.js";

/** Only editorial mutations use MCP; repository reads independently verify persisted state. */
export async function exerciseExampleInactivation(
  repository: PersonaRepositoryPort,
  personaId: string,
  skillId: string,
  call: (name: string, args: object) => Promise<{ denied: boolean; value: unknown }>,
  options: {
    prefix?: string;
    deniedCalls?: ((name: string, args: object) => Promise<{ denied: boolean; value: unknown }>)[];
  } = {},
): Promise<() => Promise<void>> {
  const read = () =>
    repository.transaction({ personaIds: [personaId], tokenIds: [] }, async (tx) => {
      const draft = await tx.catalog.find(personaId, skillId);
      expect(draft).not.toBeNull();
      const publication = await tx.catalog.publication(personaId, draft!.activePublicationId!);
      expect(publication).not.toBeNull();
      return { draft: draft!, publication };
    });
  const initial = await read();
  const training = queryTrainingSchema.parse(initial.draft.training);
  const prefix = options.prefix ?? "persistent";
  const ids = [`${prefix}_inactivation`, `${prefix}_revocation`];
  for (const [index, id] of ids.entries()) {
    const registered = await call("registrar_exemplo_sql", {
      skillId,
      expectedRevision: initial.draft.revision + index,
      example: {
        id,
        purpose: "Exemplo sintético isolado",
        sql: training.sqlModel,
        explanation: "Submissão explícita sem executar SQL",
        state: "candidate",
      },
    });
    expect(registered.denied).toBe(false);
  }
  const before = await read();
  const args = { skillId, exampleId: ids[0], expectedRevision: before.draft.revision };
  for (const deniedCall of options.deniedCalls ?? []) {
    expect((await deniedCall("inativar_exemplo_sql", args)).denied).toBe(true);
    expect(await read()).toEqual(before);
  }
  expect((await call("inativar_exemplo_sql", { ...args, exampleId: "absent" })).denied).toBe(true);
  const results = await Promise.all([1, 2].map(() => call("inativar_exemplo_sql", args)));
  expect(results.filter((r) => !r.denied)).toHaveLength(1);
  const after = await read();
  expect(after.draft.revision).toBe(before.draft.revision + 1);
  const previous = queryTrainingSchema.parse(before.draft.training);
  expect(queryTrainingSchema.parse(after.draft.training)).toEqual({
    ...previous,
    examples: previous.examples!.map((e) => (e.id === ids[0] ? { ...e, state: "inactive" } : e)),
  });
  expect(after.publication).toEqual(initial.publication);
  expect((await call("inativar_exemplo_sql", args)).denied).toBe(true);
  expect(
    (await call("inativar_exemplo_sql", { ...args, expectedRevision: after.draft.revision }))
      .denied,
  ).toBe(true);
  expect(await read()).toEqual(after);
  // The caller revokes the delegation in the real hub, leaving MCP's local record active.
  return async () => {
    expect(
      (
        await call("inativar_exemplo_sql", {
          skillId,
          exampleId: ids[1],
          expectedRevision: after.draft.revision,
        })
      ).denied,
    ).toBe(true);
    expect(await read()).toEqual(after);
  };
}
