import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { testConfig } from "../../../src/config/env.js";
import { assertPersonaDeployment } from "../../../src/config/persona-deployment.js";

const revision = "a".repeat(40);
const imageId = `sha256:${"b".repeat(64)}`;
const configuration = {
  NODE_ENV: "production" as const,
  PERSONA_V2_DEPLOYMENT: "test-server" as const,
  DATABASE_URL: "postgres://fixture:fixture@database/persona_v2_test",
  PUBLIC_BASE_URL: "https://persona.example.test",
  PLUG_SERVER_BASE_URL: "https://hub.example.test",
  MCP_ENCRYPTION_KEY: "f123456789abcde0".repeat(4),
};
const contract: unknown = JSON.parse(readFileSync("contracts/persona-v2-test-deploy.json", "utf8"));
function originFixture() {
  return {
    contract,
    revision,
    repository: "fixture/project",
    run: {
      id: 123,
      repository: { full_name: "fixture/project" },
      head_repository: { full_name: "fixture/project" },
      event: "push",
      head_branch: "main",
      head_sha: revision,
      path: ".github/workflows/ci.yml",
      status: "completed",
      conclusion: "success",
    },
    artifacts: [
      {
        id: 456,
        name: "persona-v2-test-server-amd64",
        expired: false,
        workflow_run: { id: 123, head_sha: revision },
        digest: `sha256:${"c".repeat(64)}`,
      },
    ],
    jobs: (contract as { requiredJobs: string[] }).requiredJobs.map((name) => ({
      name,
      status: "completed",
      conclusion: "success",
    })),
  };
}
function script(name: string, code: string, input: unknown): string {
  return execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import * as module from ${JSON.stringify(pathToFileURL(resolve(`scripts/${name}.mjs`)).href)}; import {readFileSync} from 'node:fs'; const f=JSON.parse(readFileSync(0,'utf8')); ${code}`,
    ],
    { input: JSON.stringify(input), encoding: "utf8", stdio: "pipe" },
  );
}
function verify(f: ReturnType<typeof originFixture>): string {
  return script(
    "check-persona-test-deploy",
    "module.validateTestDeployment(f.contract,f.revision,f.run,f.artifacts,f.jobs,f.repository); console.log('verified')",
    f,
  );
}

describe("test-server deployment authority", () => {
  it.each(["legacy", "persona-v2-candidate", "persona-v2-test-server"])(
    "accepts only a test-server proof, not %s by implication",
    (runtime) => {
      const proof = {
        schemaVersion: 1,
        revision,
        imageId,
        runtime,
        platform: "linux/amd64",
        archiveSha256: "d".repeat(64),
        archiveBytes: 100,
      };
      const check = (): string =>
        script("check-persona-test-deploy", "module.validateTestImage(f.proof,f.revision)", {
          proof,
          revision,
        });
      if (runtime === "persona-v2-test-server") expect(check).not.toThrow();
      else expect(check).toThrow();
    },
  );
  it("allows production protections only with explicit test-server and dedicated configuration", () => {
    expect(() => assertPersonaDeployment(testConfig(configuration))).not.toThrow();
    expect(() => assertPersonaDeployment(testConfig({ NODE_ENV: "production" }))).toThrow();
    expect(() => assertPersonaDeployment(testConfig())).not.toThrow();
  });
  it.each([
    { NODE_ENV: "development" as const },
    { DATABASE_URL: "postgres://fixture:fixture@database/se7e_mcp" },
    { DATABASE_URL: `${configuration.DATABASE_URL}?host=other` },
    { DATABASE_URL: `${configuration.DATABASE_URL}?%75ser=other` },
    { PUBLIC_BASE_URL: "http://persona.example.test" },
    { PLUG_SERVER_BASE_URL: "https://hub.example.test/path" },
    { MCP_ENCRYPTION_KEY: "0123456789abcdef".repeat(4) },
    { MCP_ENCRYPTION_LEGACY_KEY: "f".repeat(64) },
  ])("rejects unsafe runtime configuration %j", (overrides) => {
    expect(() => assertPersonaDeployment(testConfig({ ...configuration, ...overrides }))).toThrow();
  });
  it("accepts only exact successful CI origin and every required job", () => {
    expect(verify(originFixture())).toContain("verified");
  });
  it.each(["failure", "skipped", "cancelled"])(
    "rejects %s required checks even with successful run",
    (conclusion) => {
      const f = originFixture();
      f.jobs[0]!.conclusion = conclusion;
      expect(() => verify(f)).toThrow();
    },
  );
  it.each(["missing", "duplicate", "foreign", "expired", "revision", "artifact"])(
    "rejects %s provenance",
    (kind) => {
      const f = originFixture();
      if (kind === "missing") f.jobs.pop();
      if (kind === "duplicate") f.jobs.push(f.jobs[0]!);
      if (kind === "foreign") f.run.head_repository.full_name = "other/project";
      if (kind === "expired") f.artifacts[0]!.expired = true;
      if (kind === "revision") f.run.head_sha = "d".repeat(40);
      if (kind === "artifact") f.artifacts[0]!.name = "persona-v2-tested-image-amd64";
      expect(() => verify(f)).toThrow();
    },
  );
});

function deploy(
  failAt = -1,
  state = "exited",
  exitCode = 0,
  runtime = "persona-v2-test-server",
): { calls: string[][]; failed: boolean } {
  return JSON.parse(
    script(
      "deploy-persona-test",
      `
    const calls=[]; let failed=false;
    const run=(args)=>{
      calls.push(args); if(calls.length-1===f.failAt) throw Error('fixture');
      if(args[0]==='image') return JSON.stringify([{Id:f.imageId,Os:'linux',Architecture:'amd64',Config:{Entrypoint:['./docker-entrypoint-persona-v2.sh'],Labels:{'io.se7e.runtime':f.runtime},Env:['GIT_SHA='+f.revision]}}]);
      if(args.includes('ps')) return 'c'.repeat(64);
      if(args[0]==='inspect') return JSON.stringify([{State:{Status:f.state,ExitCode:f.exitCode,OOMKilled:false}}]);
      return '';
    };
    try {module.runTestDeployment({...f,envFile:'/fixture/private.env',run});}catch{failed=true;}
    console.log(JSON.stringify({calls,failed}));`,
      { revision, imageId, failAt, state, exitCode, runtime },
    ),
  ) as { calls: string[][]; failed: boolean };
}
describe("test deployment sequencing", () => {
  it("checks image/configuration, stops, migrates once and starts both services without rollback", () => {
    const f = deploy();
    expect(f.failed).toBe(false);
    const commands = f.calls.map((args) => args.join(" "));
    expect(commands.findIndex((c) => c.endsWith(" check"))).toBeLessThan(
      commands.findIndex((c) => c.includes(" stop ")),
    );
    expect(commands.at(-2)).toMatch(/run .*--pull never migrate$/);
    expect(commands.at(-1)).toMatch(/up .*--no-build .*--wait .*server worker$/);
    expect(commands.join("\n")).not.toMatch(/\b(down|rollback|build|pull)\b(?=\s*$)/m);
  });
  it("stops at every failure without retrying a mutation", () => {
    const total = deploy().calls.length;
    for (let i = 0; i < total; i++) {
      const f = deploy(i);
      expect(f.failed).toBe(true);
      expect(f.calls).toHaveLength(i + 1);
    }
  });
  it.each([
    ["running", 0],
    ["exited", 137],
    ["restarting", 1],
  ] as const)("refuses migration after %s/%s stop", (state, exitCode) => {
    const f = deploy(-1, state, exitCode);
    expect(f.failed).toBe(true);
    expect(f.calls.some((args) => args.at(-1) === "migrate")).toBe(false);
  });
  it("rejects candidate/legacy before stopping services", () => {
    const f = deploy(-1, "exited", 0, "persona-v2-candidate");
    expect(f.failed).toBe(true);
    expect(f.calls).toHaveLength(1);
  });
});
