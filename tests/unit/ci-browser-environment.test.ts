import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parse } from "yaml";

it("verifica DNS antes de instalar Chromium sem remover gates ou tolerar falhas", () => {
  const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  const steps = workflow.jobs.verify.steps as { run?: string; "continue-on-error"?: boolean }[];
  const dns = steps.findIndex((step) => step.run === "npx tsx scripts/prepare-ci-browser-dns.ts");
  const install = steps.findIndex(
    (step) => step.run === "npx playwright install --with-deps chromium",
  );
  expect(dns).toBeGreaterThanOrEqual(0);
  expect(install).toBeGreaterThan(dns);
  for (const command of [
    "test:console:browser",
    "test:persona-v2:browser",
    "test:chatgpt:browser",
  ]) {
    const index = steps.findIndex((step) => step.run === `npm run ${command}`);
    expect(index).toBeGreaterThan(install);
    expect(steps[index]!["continue-on-error"]).not.toBe(true);
  }
  expect(steps[dns]!["continue-on-error"]).not.toBe(true);
  expect(steps[install]!["continue-on-error"]).not.toBe(true);
});

it.each(["test:persona-v2:browser", "test:chatgpt:browser"])(
  "fornece PostgreSQL explícito e isolado ao gate %s",
  (command) => {
    const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as {
      jobs: {
        verify: {
          env: Record<string, string>;
          steps: { run?: string; env?: Record<string, string> }[];
        };
      };
    };
    const job = workflow.jobs.verify;
    const step = job.steps.find((entry) => entry.run === `npm run ${command}`);
    expect(step).toBeDefined();
    const environment = { ...job.env, ...step!.env };
    expect(environment.NODE_ENV).toBe("test");
    expect(environment.PERSONA_V2_TEST_DATABASE_URL).toBeDefined();
    const database = new URL(environment.PERSONA_V2_TEST_DATABASE_URL!);
    expect(database.protocol).toBe("postgres:");
    expect(database.hostname).toBe("localhost");
    expect(database.pathname).toMatch(/_test$/);
    expect(database.href).not.toBe(environment.DATABASE_URL);
  },
);
