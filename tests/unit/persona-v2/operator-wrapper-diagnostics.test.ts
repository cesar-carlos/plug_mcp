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
const argv = process.argv,
  exitCode = process.exitCode;
afterEach(() => {
  process.argv = argv;
  process.exitCode = exitCode;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
});
const request = {
  mode: "inspect",
  revision: "a".repeat(40),
  personaId: "11111111-1111-4111-8111-111111111111",
  skillId: "22222222-2222-4222-8222-222222222222",
};
const report = {
  revision: 1,
  packageHash: "a".repeat(64),
  casesHash: "b".repeat(64),
  sourceId: request.personaId,
  sourceFingerprint: "c".repeat(64),
  approved: false,
  results: [],
};
it.each([
  ["read", "read_request", "request_read_failed"],
  ["request", "validate_request", "invalid_request"],
  ["fixture", "open_fixture", "fixture_open_failed"],
  ["spawn", "spawn", "ssh_spawn_failed"],
  ["spawn_event", "await_message", "ssh_spawn_not_found"],
  ["json", "await_message", "channel_invalid_json"],
  ["eof", "await_message", "channel_input_ended"],
  ["read_timeout", "await_message", "channel_read_timeout"],
  ["identity", "validate_result", "result_identity_mismatch"],
  ["fixture_request", "validate_request_frame", "unexpected_fixture_request"],
  ["invalid_fixture_request", "validate_request_frame", "invalid_remote_frame"],
  ["exit", "await_exit", "ssh_exit_nonzero"],
  ["exit_timeout", "await_exit", "ssh_exit_timeout"],
  ["signal", "await_exit", "ssh_exit_signal"],
  ["success", "await_exit", "unused"],
])("reports %s safely without replay", async (scenario, stage, reason) => {
  vi.useFakeTimers();
  process.argv = [
    "node",
    "runner",
    "--host=fixture-host",
    "--request=secret-path.json",
    ...(scenario === "fixture" ? ["--session=secret-session"] : []),
  ];
  mocks.read.mockResolvedValue(
    Buffer.from(
      JSON.stringify(
        scenario === "fixture" ? { ...request, mode: "run", expected: report } : request,
      ),
    ),
  );
  if (scenario === "fixture") {
    const { approved: _a, results: _r, ...expected } = report;
    mocks.read.mockResolvedValue(
      Buffer.from(JSON.stringify({ ...request, mode: "run", expected })),
    );
    mocks.fixture.mockRejectedValue(new Error("SECRET sql token"));
  }
  if (scenario === "read") mocks.read.mockRejectedValue(new Error("SECRET sql token"));
  if (scenario === "request") mocks.read.mockResolvedValue(Buffer.from('{"SECRET":"sql token"}'));
  const ssh = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  ssh.kill.mockImplementation(() => ssh.emit("exit", null, "SIGTERM"));
  mocks.spawn.mockImplementation(() => {
    if (scenario === "spawn") throw new Error("SECRET spawn");
    return ssh;
  });
  const frames: unknown[] = [];
  ssh.stdin.on("data", (data: Buffer) => {
    frames.push(JSON.parse(data.toString()));
    ssh.stderr.write("SECRET stderr credentials sql");
    if (scenario === "spawn_event")
      queueMicrotask(() =>
        ssh.emit("error", Object.assign(new Error("SECRET"), { code: "ENOENT" })),
      );
    if (scenario === "json") ssh.stdout.write("SECRET invalid JSON\n");
    if (scenario === "eof") {
      ssh.emit("exit", 255, null);
      ssh.stdout.end();
    }
    if (scenario === "fixture_request")
      ssh.stdout.write(JSON.stringify({ kind: "request", id: 7, call: { op: "clear" } }) + "\n");
    if (scenario === "invalid_fixture_request")
      ssh.stdout.write(
        JSON.stringify({ kind: "request", id: 7, call: { op: "SECRET", sql: "SECRET" } }) + "\n",
      );
    if (["identity", "exit", "exit_timeout", "signal", "success"].includes(scenario))
      ssh.stdout.write(
        JSON.stringify({
          kind: "result",
          mode: "inspect",
          revision: (scenario === "identity" ? "b" : "a").repeat(40),
          report,
        }) + "\n",
      );
  });
  ssh.stdin.on("finish", () => {
    if (scenario === "success") ssh.emit("exit", 0, null);
    if (scenario === "exit") ssh.emit("exit", 42, null);
    if (scenario === "signal") ssh.emit("exit", null, "SIGTERM");
  });
  const output: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await import("../../../scripts/run-persona-ssh-publication.js");
    await vi.advanceTimersByTimeAsync(
      scenario === "read_timeout" ? 45001 : scenario === "exit_timeout" ? 15001 : 0,
    );
    if (scenario === "success") {
      expect(output).toEqual([]);
      expect(stdout).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(stdout.mock.calls[0]![0]))).toEqual({
        kind: "result",
        mode: "inspect",
        revision: request.revision,
        report,
      });
      expect(ssh.kill).not.toHaveBeenCalled();
      expect(mocks.spawn).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(1);
      return;
    }
    expect(output).toHaveLength(1);
    const diagnostic = JSON.parse(output[0]!) as Record<string, unknown>;
    expect(diagnostic).toMatchObject({
      code: "OPERATOR_RUN_UNCONFIRMED",
      stage,
      reason,
      approved: false,
      repeatAllowed: false,
    });
    expect(diagnostic.supportId).toMatch(/^[a-f0-9-]{36}$/);
    if (scenario === "fixture_request")
      expect(diagnostic.lastRequest).toEqual({ id: 7, operation: "clear" });
    if (scenario === "invalid_fixture_request")
      expect(diagnostic).not.toHaveProperty("lastRequest");
    if (scenario === "eof") expect(diagnostic.sshExitCode).toBe(255);
    if (scenario === "exit") expect(diagnostic.sshExitCode).toBe(42);
    if (scenario !== "signal") expect(diagnostic).not.toHaveProperty("sshSignaled");
    expect(output.join("")).not.toMatch(/SECRET|secret-path|secret-session|credentials|sql token/);
    expect(mocks.spawn.mock.calls.length).toBeLessThanOrEqual(1);
    expect(frames.length).toBeLessThanOrEqual(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  } finally {
    ssh.stdin.destroy();
    ssh.stdout.destroy();
    ssh.stderr.destroy();
  }
});
