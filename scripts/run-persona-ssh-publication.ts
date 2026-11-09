import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { z } from "zod";
import { readStablePluginFile } from "../src/infrastructure/plugins/package-read.js";
import { OperatorChannel } from "../src/infrastructure/persistence/persona-v2/operator-channel.js";
import {
  operatorExpectationSchema,
  operatorStartSchema,
} from "../src/infrastructure/persistence/persona-v2/operator-contract.js";
import { openOperatorFixture } from "./homologation/operator-local-fixture.js";
import { fixtureEnvironment } from "./homologation/fixture-environment.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { host: { type: "string" }, request: { type: "string" }, session: { type: "string" } },
  });
  if (!values.host || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(values.host) || !values.request)
    throw Error("Explicit SSH alias and request required.");
  const raw: unknown = JSON.parse(
    (await readStablePluginFile(values.request, 32768)).toString("utf8"),
  );
  const request = z
    .discriminatedUnion("mode", [
      operatorStartSchema.options[0],
      operatorStartSchema.options[1].omit({ fixture: true }),
    ])
    .parse(raw);
  if ((request.mode === "run") !== !!values.session)
    throw Error("Run requires an active isolated session; inspect does not.");
  const local = values.session ? await openOperatorFixture(values.session) : undefined;
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
  const exited = new Promise<number | null>((resolve) => {
    ssh.once("error", () => {
      channel.close();
      resolve(-1);
    });
    ssh.once("exit", resolve);
  });
  let completed = false;
  try {
    await channel.send(
      operatorStartSchema.parse({ ...request, ...(local ? { fixture: local.descriptor } : {}) }),
    );
    for (;;) {
      const message = await channel.read();
      const failure = z
        .object({
          kind: z.literal("failure"),
          approved: z.literal(false),
          code: z.enum([
            "STALE_AUTHORIZATION",
            "AUTHORIZATION_DENIED",
            "INVALID_PLAN",
            "INCOMPLETE_INPUT",
            "CAPABILITY_UNAVAILABLE",
            "RUNNER_FAILED",
          ]),
        })
        .safeParse(message);
      if (failure.success) {
        process.stderr.write(
          JSON.stringify({
            approved: false,
            code: failure.data.code,
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
        if (!local) throw Error("Read-only inspection attempted fixture work.");
        await channel.send(await local.handler.handle(message));
        continue;
      }
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
        throw Error("Operator result identity mismatch.");
      ssh.stdin.end();
      let exitTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const status = await Promise.race([
          exited,
          new Promise<never>((_resolve, reject) => {
            exitTimer = setTimeout(() => reject(new Error("Operator exit expired.")), 15000);
          }),
        ]);
        if (status !== 0) throw Error("Operator exit unconfirmed.");
      } finally {
        clearTimeout(exitTimer);
      }
      completed = true;
      process.stdout.write(JSON.stringify(result) + "\n");
      if (request.mode === "run" && !result.report.approved) process.exitCode = 1;
      break;
    }
  } finally {
    channel.close();
    if (!completed) ssh.kill();
  }
}
main().catch(() => {
  process.stderr.write(
    JSON.stringify({
      approved: false,
      code: "OPERATOR_RUN_UNCONFIRMED",
      repeatAllowed: false,
      action:
        "Confira o SHA, o vínculo, a sessão isolada e o relatório no console. Preserve a fixture em caso de execução incerta; não repita automaticamente.",
    }) + "\n",
  );
  process.exitCode = 1;
});
