import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";
import { ERROR_CODES } from "../src/domain/errors/error-codes.js";
import { readStablePluginFile } from "../src/infrastructure/plugins/package-read.js";
import { OperatorChannel } from "../src/infrastructure/persistence/persona-v2/operator-channel.js";
import {
  operatorExpectationSchema,
  operatorStartSchema,
  operatorRequestSchema,
} from "../src/infrastructure/persistence/persona-v2/operator-contract.js";
import { openOperatorFixture } from "./homologation/operator-local-fixture.js";
import { fixtureEnvironment } from "./homologation/fixture-environment.js";

import { createOperatorCasePacer } from "../src/infrastructure/persistence/persona-v2/operator-fixture-bridge.js";
import {
  operatorFailure,
  operatorFailureReason,
  operatorStageReasons,
  type OperatorStage,
} from "../src/infrastructure/persistence/persona-v2/operator-diagnostics.js";

const diagnostic: {
  supportId: string;
  stage: OperatorStage;
  lastRequest?: { id: number; operation: string };
  sshExitCode?: number;
  sshSignaled?: boolean;
  spawnFailure?: Error;
} = { supportId: randomUUID(), stage: "arguments" };

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { host: { type: "string" }, request: { type: "string" }, session: { type: "string" } },
  });
  if (!values.host || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(values.host) || !values.request)
    throw Error("Explicit SSH alias and request required.");
  diagnostic.stage = "read_request";
  const file = await readStablePluginFile(values.request, 32768);
  diagnostic.stage = "validate_request";
  const raw: unknown = JSON.parse(file.toString("utf8"));
  const request = z
    .discriminatedUnion("mode", [
      operatorStartSchema.options[0],
      operatorStartSchema.options[1].omit({ fixture: true }),
    ])
    .parse(raw);
  if ((request.mode === "run") !== !!values.session)
    throw Error("Run requires an active isolated session; inspect does not.");
  diagnostic.stage = "open_fixture";
  const local = values.session ? await openOperatorFixture(values.session) : undefined;
  diagnostic.stage = "spawn";
  const ssh = spawn(
    "ssh",
    [
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ConnectTimeout=10",
      values.host,
      "docker exec -i se7e-persona-v2-test-server-1 node dist/infrastructure/persistence/persona-v2/run-ssh-publication.js",
    ],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: fixtureEnvironment(process.env) },
  );
  ssh.stderr.resume(); // SSH/internal diagnostics may contain paths; only fixed local errors are printed.
  const channel = new OperatorChannel(ssh.stdout, ssh.stdin);
  let cleanupStarted = false;
  const exited = new Promise<number | null>((resolve) => {
    ssh.once("error", (error: NodeJS.ErrnoException) => {
      if (!cleanupStarted)
        diagnostic.spawnFailure = operatorFailure(
          error.code === "ENOENT"
            ? "ssh_spawn_not_found"
            : error.code === "EACCES"
              ? "ssh_spawn_denied"
              : "ssh_spawn_failed",
        );
      channel.close();
      resolve(-1);
    });
    ssh.once("exit", (code, signal) => {
      if (!cleanupStarted && Number.isInteger(code) && code !== null && code >= 0 && code <= 255)
        diagnostic.sshExitCode = code;
      if (!cleanupStarted && signal) diagnostic.sshSignaled = true;
      resolve(code);
    });
  });
  let completed = false;
  const paceCase = createOperatorCasePacer();
  try {
    diagnostic.stage = "send_start";
    await channel.send(
      operatorStartSchema.parse({ ...request, ...(local ? { fixture: local.descriptor } : {}) }),
    );
    for (;;) {
      diagnostic.stage = "await_message";
      const message = await channel.read();
      const failure = z
        .object({
          kind: z.literal("failure"),
          approved: z.literal(false),
          code: z.enum([
            ...Object.values(ERROR_CODES),
            "STALE_AUTHORIZATION",
            "AUTHORIZATION_DENIED",
            "INVALID_PLAN",
            "AGREGACAO_INSEGURA",
            "INCOMPLETE_INPUT",
            "CAPABILITY_UNAVAILABLE",
            "RUNNER_FAILED",
            "BUDGET_EXCEEDED",
            "RATE_LIMITED",
          ]),
        })
        .safeParse(message);
      if (failure.success) {
        process.stderr.write(
          JSON.stringify({
            approved: false,
            code: failure.data.code,
            supportId: diagnostic.supportId,
            stage: "remote_failure",
            ...(diagnostic.lastRequest ? { lastRequest: diagnostic.lastRequest } : {}),
            repeatAllowed: false,
            action:
              "Rodada recusada pelo operador remoto. Confira revisão, casos e vínculo; nenhuma publicação foi realizada.",
          }) + "\n",
        );
        process.exitCode = 1;
        break;
      }
      if (
        message &&
        typeof message === "object" &&
        "kind" in message &&
        message.kind === "request"
      ) {
        diagnostic.stage = "validate_request_frame";
        const frame = operatorRequestSchema.parse(message);
        diagnostic.lastRequest = { id: frame.id, operation: frame.call.op };
        if (!local) throw operatorFailure("unexpected_fixture_request");
        diagnostic.stage = "pace_fixture";
        await paceCase(message, (frame) => channel.send(frame));
        diagnostic.stage = "handle_fixture";
        const response = await local.handler.handle(message);
        const fixtureDiagnostic = local.handler.failure;
        if (fixtureDiagnostic)
          process.stderr.write(
            JSON.stringify({
              kind: "fixture-diagnostic",
              ...fixtureDiagnostic,
              repeatAllowed: false,
            }) + "\n",
          );
        diagnostic.stage = "send_response";
        await channel.send(response);
        continue;
      }
      diagnostic.stage = "validate_result";
      const result = z
        .strictObject({
          kind: z.literal("result"),
          mode: z.enum(["inspect", "run"]),
          revision: z.string().regex(/^[a-f0-9]{40}$/),
          report: operatorExpectationSchema.extend({
            approved: z.boolean(),
            results: z.array(z.strictObject({ id: z.uuid(), passed: z.boolean() })).max(100),
          }),
        })
        .parse(message);
      if (result.revision !== request.revision || result.mode !== request.mode)
        throw operatorFailure("result_identity_mismatch");
      diagnostic.stage = "await_exit";
      ssh.stdin.end();
      let exitTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const status = await Promise.race([
          exited,
          new Promise<never>((_resolve, reject) => {
            exitTimer = setTimeout(() => reject(operatorFailure("ssh_exit_timeout")), 15000);
          }),
        ]);
        if (status !== 0)
          throw operatorFailure(status === null ? "ssh_exit_signal" : "ssh_exit_nonzero");
      } finally {
        clearTimeout(exitTimer);
      }
      completed = true;
      process.stdout.write(JSON.stringify(result) + "\n");
      if (request.mode === "run" && !result.report.approved) process.exitCode = 1;
      break;
    }
  } finally {
    cleanupStarted = true;
    channel.close();
    if (!completed) ssh.kill();
  }
}
main().catch((error: unknown) => {
  process.stderr.write(
    JSON.stringify({
      approved: false,
      code: "OPERATOR_RUN_UNCONFIRMED",
      supportId: diagnostic.supportId,
      stage: diagnostic.stage,
      reason:
        operatorFailureReason(diagnostic.spawnFailure ?? error) ??
        operatorStageReasons[diagnostic.stage],
      ...(diagnostic.lastRequest ? { lastRequest: diagnostic.lastRequest } : {}),
      ...(diagnostic.sshExitCode !== undefined ? { sshExitCode: diagnostic.sshExitCode } : {}),
      ...(diagnostic.sshSignaled ? { sshSignaled: true } : {}),
      repeatAllowed: false,
      action:
        "Confira o SHA, o vínculo, a sessão isolada e o relatório no console. Preserve a fixture em caso de execução incerta; não repita automaticamente.",
    }) + "\n",
  );
  process.exitCode = 1;
});
