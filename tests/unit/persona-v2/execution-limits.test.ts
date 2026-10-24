import { expect, it } from "vitest";
import {
  queryLimits,
  queryLimitsSchema,
  operationLimitsSchema,
  QUERY_LIMITS,
} from "../../../src/domain/persona-v2/execution-limits.js";
import { permissionsContainedBy } from "../../../src/domain/persona-v2/authorization.js";
import {
  consumerQueryLimits,
  consumerOperationLimits,
  consumerFederationLimits,
} from "../../../src/application/persona-v2/execution-budgets.js";
import type { AuthorizationSnapshot, Permissions } from "../../../src/domain/persona-v2/model.js";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import {
  compileOperationTraining,
  compileOperationCommand,
} from "../../../src/application/persona-v2/operation-training.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { operationTraining, operationInput } from "../../helpers/persona-v2-operation.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
const permissions: Permissions = {
  sourceIds: [trainingSource.id],
  skills: [
    {
      skillId: "skill",
      capabilities: [],
      effects: ["select"],
      requireHumanApproval: false,
      queryLimits: { maxRows: 30, pageSize: 20 },
      operationLimits: { timeoutMs: 5000 },
      federationLimits: { steps: 5 },
    },
  ],
  administrative: [],
  externalOperationIds: [],
  queryLimits: { maxRows: 40, maxBytes: 8000 },
  operationLimits: { maxAffectedRows: 10 },
  federationLimits: { sources: 3 },
};
const identity = {
  personaId: trainingSource.personaId,
  tokenId: "token",
  personaVersion: 1,
  tokenVersion: 1,
};
const now = new Date("2026-10-15T12:00:00Z");
const state: AuthorizationSnapshot = {
  persona: {
    id: identity.personaId,
    ownerId: "owner",
    name: "Fixture",
    specialty: "Test",
    instructions: "",
    active: true,
    authorizationVersion: 1,
  },
  token: {
    id: "token",
    personaId: identity.personaId,
    tokenHash: "hash",
    expiresAt: null,
    revokedAt: null,
    authorizationVersion: 1,
    permissions,
    delegation: permissions,
  },
  sources: [trainingSource],
  grant: {
    id: "grant",
    personaId: identity.personaId,
    tokenId: "token",
    tokenVersion: 1,
    expiresAt: new Date(now.getTime() + 10000),
    revokedAt: null,
    permissions: {
      ...permissions,
      queryLimits: { maxRows: 10, timeoutMs: 2000 },
      skills: [
        {
          ...permissions.skills[0]!,
          queryLimits: { pageSize: 5, maxBytes: 4000 },
          operationLimits: { timeoutMs: 3000 },
          federationLimits: { sources: 2 },
        },
      ],
    },
  },
};
it("compõe plataforma, skill, token e concessões sem somar limites", () => {
  const pkg = compileQueryTraining(
    {
      ...queryTraining(),
      limits: { maxRows: 100, pageSize: 50, maxBytes: 10000, timeoutMs: 10000 },
    },
    trainingSource,
    crypto,
  );
  const publications = [
    {
      id: "pub",
      personaId: identity.personaId,
      skillId: "skill",
      revision: 1,
      package: pkg,
      hash: "hash",
      sourceVersion: 1,
      sourceFingerprint: pkg.sourceFingerprint,
      suspendedAt: null,
    },
  ];
  expect(
    consumerQueryLimits({ ...identity, grant: { id: "grant" } }, state, publications, now),
  ).toEqual({ maxRows: 10, pageSize: 5, maxBytes: 4000, timeoutMs: 2000 });
  expect(
    consumerOperationLimits(
      { ...identity, grant: { id: "grant" } },
      state,
      "skill",
      { maxAffectedRows: 100, timeoutMs: 20000 },
      now,
    ),
  ).toEqual({ maxAffectedRows: 10, timeoutMs: 3000 });
  expect(
    consumerFederationLimits(
      { ...identity, grant: { id: "grant" } },
      state,
      "skill",
      { steps: 7 },
      now,
    ),
  ).toMatchObject({ sources: 2, steps: 5 });
});
it.each([0, -1, 1.5, NaN, Infinity, 5001])("recusa limite de linhas inválido: %s", (maxRows) => {
  expect(queryLimitsSchema.safeParse({ maxRows }).success).toBe(false);
});
it("limites ausentes preservam defaults; pedido maior nunca amplia e página cabe em maxRows", () => {
  expect(queryLimits()).toEqual(QUERY_LIMITS);
  expect(
    queryLimits({ maxRows: 2, maxBytes: 1000 }, { maxRows: 4000, pageSize: 100 }),
  ).toMatchObject({ maxRows: 2, pageSize: 2, maxBytes: 1000 });
  expect(operationLimitsSchema.safeParse({ maxAffectedRows: 100001 }).success).toBe(false);
});
it("delegação compara tetos efetivos por skill, incluindo global e OAuth", () => {
  const requested = {
    ...permissions,
    queryLimits: undefined,
    skills: [
      { ...permissions.skills[0]!, queryLimits: { maxRows: 10, pageSize: 5, maxBytes: 4000 } },
    ],
  };
  expect(permissionsContainedBy(requested, permissions)).toBe(true);
  expect(
    permissionsContainedBy(
      { ...requested, skills: [{ ...requested.skills[0]!, queryLimits: { maxRows: 50 } }] },
      permissions,
    ),
  ).toBe(false);
  expect(
    permissionsContainedBy(
      { ...requested, skills: [{ ...requested.skills[0]!, operationLimits: { timeoutMs: 6000 } }] },
      permissions,
    ),
  ).toBe(false);
  expect(
    permissionsContainedBy(
      { ...requested, skills: [{ ...requested.skills[0]!, federationLimits: { steps: 8 } }] },
      permissions,
    ),
  ).toBe(false);
  expect(permissionsContainedBy({ ...permissions, skills: [] }, permissions)).toBe(true);
});
it("mudança do limite publicado altera capacidade de contrato sem alterar snapshot anterior", () => {
  const first = compileQueryTraining(queryTraining(), trainingSource, crypto);
  const second = compileQueryTraining(
    { ...queryTraining(), limits: { maxRows: 3 } },
    trainingSource,
    crypto,
  );
  expect(first).not.toHaveProperty("limits");
  expect(second.limits).toEqual({ maxRows: 3 });
  expect(first.requiredCapabilities.at(-1)).not.toBe(second.requiredCapabilities.at(-1));
});
it("preparação fixa orçamento no fingerprint e recusa teto abaixo do mínimo afetado", () => {
  const training = operationTraining();
  training.maxAffectedRows = 10;
  const pkg = compileOperationTraining(training, trainingSource, crypto, "Sintético");
  const id = "77777777-7777-4777-8777-777777777777";
  const full = compileOperationCommand(pkg, trainingSource, id, operationInput, crypto);
  const lower = compileOperationCommand(pkg, trainingSource, id, operationInput, crypto, {
    maxAffectedRows: 2,
    timeoutMs: 5000,
  });
  expect(lower).toMatchObject({ maxAffectedRows: 2, timeoutMs: 5000 });
  expect(lower.fingerprint).not.toBe(full.fingerprint);
  const twoSteps = {
    ...training,
    steps: [...training.steps, { ...training.steps[0]!, id: "second" }],
  };
  expect(() =>
    compileOperationCommand(
      compileOperationTraining(twoSteps, trainingSource, crypto, "Sintético"),
      trainingSource,
      id,
      operationInput,
      crypto,
      { maxAffectedRows: 1 },
    ),
  ).toThrow("condições mínimas");
});
