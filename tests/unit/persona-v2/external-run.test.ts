import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { externalRunManifestSchema } from "../../../src/domain/persona-v2/external-run.js";
import { evaluateExternalCases } from "../../../src/application/persona-v2/external-publication-cases.js";
import type { ExternalPackage } from "../../../src/domain/persona-v2/external-contract.js";
it("timeout durante revalidação impede o envio tardio do caso", async () => {
  const pkg: ExternalPackage = {
    format: "persona-external-v2",
    name: "Fixture",
    destination: "https://intended.example.com",
    credentialVersion: 1,
    requiredCapabilities: [],
    training: {
      operationId: randomUUID(),
      integrationId: randomUUID(),
      effect: "acao",
      purpose: "Teste",
      effectDescription: "Fixture",
      reconciliation: "Não repetir",
      transport: { kind: "rest", method: "POST", path: "/write" },
      input: {},
      output: {},
      timeoutMs: 1,
      maxResponseBytes: 4096,
    },
  };
  let effects = 0;
  const transport = {
    invoke: vi.fn(),
    executeAction: vi.fn(async (...args: unknown[]) => {
      await (args[5] as () => Promise<void>)();
      effects++;
      return {};
    }),
  };
  const report = await evaluateExternalCases(
    pkg,
    [{ id: randomUUID(), required: true, content: { name: "Timeout", input: {}, expected: {} } }],
    {
      destination: "https://fixture.example.com",
      credential: { credentialType: "bearer", token: "fixture" },
    },
    transport,
    () => new Promise((resolve) => setTimeout(resolve, 10)),
  );
  expect(effects).toBe(0);
  expect(report.results[0]!.passed).toBe(false);
});
it("manifesto é fechado, exige confirmação, versões e hashes e não aceita credenciais", () => {
  const manifest = {
    version: 1,
    runId: randomUUID(),
    personaId: randomUUID(),
    skillId: randomUUID(),
    ownerId: randomUUID(),
    revision: 1,
    packageHash: "a".repeat(64),
    casesHash: "b".repeat(64),
    fixtureIntegrationId: randomUUID(),
    fixtureCredentialVersion: 1,
    fixtureDestinationHash: "c".repeat(64),
    confirmation: "isolated-external-effects",
  };
  expect(externalRunManifestSchema.safeParse(manifest).success).toBe(true);
  for (const extra of [
    { token: "secret" },
    { confirmation: "yes" },
    { revision: 0 },
    { packageHash: "invalid" },
  ])
    expect(externalRunManifestSchema.safeParse({ ...manifest, ...extra }).success).toBe(false);
});
it("CLI sem manifesto falha com erro seguro sem conectar ou aceitar argumentos livres", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/infrastructure/persistence/persona-v2/run-external-cases.ts"],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Rodada externa não aprovada");
  expect(result.stderr).not.toContain("postgresql:");
});
it("perda de confirmação para os próximos casos, sem retry do efeito", async () => {
  const pkg: ExternalPackage = {
    format: "persona-external-v2",
    name: "Fixture",
    destination: "https://intended.example.com",
    credentialVersion: 1,
    requiredCapabilities: [],
    training: {
      operationId: randomUUID(),
      integrationId: randomUUID(),
      effect: "acao",
      purpose: "Teste",
      effectDescription: "Fixture",
      reconciliation: "Não repetir",
      transport: { kind: "rest", method: "POST", path: "/write" },
      input: {},
      output: {},
      timeoutMs: 1000,
      maxResponseBytes: 4096,
    },
  };
  const transport = {
    invoke: vi.fn(),
    executeAction: vi.fn(async (...args: unknown[]) => {
      await (args[5] as () => Promise<void>)();
      throw new Error("Provider secret must not escape");
    }),
  };
  const cases = [1, 2].map((i) => ({
    id: String(i),
    required: true,
    content: { name: "Fixture", input: {}, expected: {} },
  }));
  const report = await evaluateExternalCases(
    pkg,
    cases,
    {
      destination: "https://fixture.example.com",
      credential: { credentialType: "bearer", token: "fixture" },
    },
    transport,
    () => Promise.resolve(),
  );
  expect(report).toEqual({
    uncertain: true,
    results: [
      { id: "1", passed: false },
      { id: "2", passed: false },
    ],
  });
  expect(transport.executeAction).toHaveBeenCalledTimes(1);
});
