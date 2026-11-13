import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { expect, it } from "vitest";

interface Step {
  run?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
}
interface Job {
  needs?: string[];
  if?: string;
  services?: unknown;
  steps: Step[];
}
const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as {
  jobs: Record<string, Job>;
};
const contract = JSON.parse(readFileSync("contracts/persona-v2-test-deploy.json", "utf8")) as {
  requiredJobs: string[];
};
const runs = (id: string): string[] => workflow.jobs[id]!.steps.flatMap((s) => s.run ?? []);

it("keeps independent Linux suites mandatory for publication with isolated services", () => {
  for (const id of ["verify", "persistence", "browser"]) {
    expect(workflow.jobs[id]!.needs).toBeUndefined();
    expect(workflow.jobs[id]!.if).toBeUndefined();
    expect(workflow.jobs[id]!.services).toHaveProperty("postgres");
    expect(workflow.jobs[id]!.services).toHaveProperty("redis");
    expect(contract.requiredJobs).toContain(id);
    expect(workflow.jobs["publish-image"]!.needs).toContain(id);
  }
  expect(runs("verify")).toEqual(
    expect.arrayContaining([
      "npm run release:check",
      "npm run db:migrate:legacy",
      "npm run runtime:check",
      "npm audit --omit=dev --audit-level=high",
    ]),
  );
  expect(runs("persistence")).toEqual(
    expect.arrayContaining([
      "npm run training:check",
      "npm run contract:check",
      "npm run test:migrations",
      "npm run test:persona-v2:postgres",
      "npm run test:persona-v2:cache",
    ]),
  );
  expect(runs("verify").indexOf("npm run db:migrate:legacy")).toBeLessThan(
    runs("verify").indexOf("npm run release:check"),
  );
});

it("runs all browser suites against one build without parallelizing the shared fixture", () => {
  const commands = runs("browser");
  const build = commands.indexOf("npm run build --prefix web");
  expect(build).toBeGreaterThan(-1);
  expect(commands.filter((s) => s.includes("npm run build"))).toHaveLength(1);
  for (const command of [
    "npx playwright test --config playwright.console.config.ts",
    "npx playwright test --config playwright.persona-ui.config.ts && npx playwright test --config playwright.persona-v2.config.ts",
    "npm run test:chatgpt:browser",
  ])
    expect(commands.indexOf(command)).toBeGreaterThan(build);
  expect(commands).toContain("npx tsx scripts/prepare-ci-browser-dns.ts");
  expect(commands).toContain("npx playwright install --with-deps chromium");
  expect(runs("windows")).toContain("npm run release:check");
  expect(runs("windows")).toContain("npx playwright test --config playwright.console.config.ts");
  expect(readFileSync("playwright.persona-v2.config.ts", "utf8")).toContain("workers: 1");
});

it("starts image builds independently but retains all final gates and exact image tests", () => {
  for (const id of ["native-musl", "persona-v2-candidate", "persona-v2-test-server"]) {
    const job = workflow.jobs[id]!;
    expect(job.needs).toBeUndefined();
    expect(workflow.jobs["publish-image"]!.needs).toContain(id);
    const build = job.steps.find((s) => s.uses?.startsWith("docker/build-push-action@"))!;
    expect(build.with).toMatchObject({
      context: ".",
      load: true,
      "build-args": "GIT_SHA=${{ github.sha }}",
    });
    expect(build.with!["cache-from"]).toContain(`scope=${id}-`);
    expect(build.with!["cache-to"]).toContain("github.event_name == 'push'");
    expect(build.with!["cache-to"]).toContain("github.ref == 'refs/heads/main'");
    expect(
      job.steps.some((s) =>
        s.run?.includes(
          id === "native-musl" ? "smoke-runtime.mjs --migrate" : "test-persona-candidate.ps1",
        ),
      ),
    ).toBe(true);
  }
  for (const name of [
    "Documentation (ubuntu-latest)",
    "Documentation (windows-latest)",
    "windows",
    "native-musl (amd64)",
    "native-musl (arm64)",
    "persona-v2-candidate",
    "persona-v2-test-server",
  ])
    expect(contract.requiredJobs).toContain(name);
  expect(workflow.jobs["publish-image"]!.needs).toContain("documentation");
});
