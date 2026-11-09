import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), read: vi.fn(), fixture: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../../../src/infrastructure/plugins/package-read.js", () => ({
  readStablePluginFile: mocks.read,
}));
vi.mock("../../../scripts/homologation/operator-local-fixture.js", () => ({
  openOperatorFixture: mocks.fixture,
}));
const argv = process.argv;
const exitCode = process.exitCode;
afterEach(() => {
  process.argv = argv;
  process.exitCode = exitCode;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
});

it.each([
  { code: "AGREGACAO_INSEGURA", approved: false, expected: "AGREGACAO_INSEGURA" },
  { code: "INVALID_PLAN", approved: false, expected: "INVALID_PLAN" },
  { code: "BUDGET_EXCEEDED", approved: false, expected: "BUDGET_EXCEEDED" },
  { code: "RATE_LIMITED", approved: false, expected: "RATE_LIMITED" },
  { code: "UNRECOGNIZED_SECRET", approved: false, expected: "OPERATOR_RUN_UNCONFIRMED" },
  { code: "AGREGACAO_INSEGURA", approved: true, expected: "OPERATOR_RUN_UNCONFIRMED" },
])("classifies $code approved=$approved without leaking remote content", async (entry) => {
  process.argv = ["node", "runner", "--host=fixture-host", "--request=request.json"];
  mocks.read.mockResolvedValue(
    Buffer.from(
      JSON.stringify({
        mode: "inspect",
        revision: "a".repeat(40),
        personaId: "11111111-1111-4111-8111-111111111111",
        skillId: "22222222-2222-4222-8222-222222222222",
      }),
    ),
  );
  const ssh = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  const frames: unknown[] = [];
  ssh.stdin.on("data", (data: Buffer) => {
    frames.push(JSON.parse(data.toString("utf8")));
    ssh.stdout.write(
      JSON.stringify({
        kind: "failure",
        code: entry.code,
        approved: entry.approved,
        repeatAllowed: true,
        message: "synthetic-secret",
        details: { sql: "SELECT synthetic_private_data" },
      }) + "\n",
    );
  });
  mocks.spawn.mockReturnValue(ssh);
  const output: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await import("../../../scripts/run-persona-ssh-publication.js");
    await vi.waitFor(() => expect(output).toHaveLength(1));
    expect(JSON.parse(output[0]!)).toMatchObject({
      code: entry.expected,
      approved: false,
      repeatAllowed: false,
    });
    expect(output.join("")).not.toMatch(
      /synthetic-secret|synthetic_private_data|UNRECOGNIZED_SECRET/,
    );
    expect(process.exitCode).toBe(1);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ mode: "inspect" });
    expect(mocks.fixture).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(ssh.kill).toHaveBeenCalledTimes(1);
  } finally {
    ssh.stdin.destroy();
    ssh.stdout.destroy();
    ssh.stderr.destroy();
  }
});
