import { loadConfig } from "../src/config/env.js";
import { checkChatGptReadiness } from "../src/infrastructure/oauth/readiness-check.js";

const args = process.argv.slice(2);
const value = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const json = args.includes("--json");
const stage = value("stage");
const allowed = /^(--json|--stage=(prepare|pilot)|--package=.+|--connection-id=.+)$/;
if (
  !stage ||
  !["prepare", "pilot"].includes(stage) ||
  args.some((arg) => !allowed.test(arg)) ||
  ["stage", "package", "connection-id"].some(
    (name) => args.filter((arg) => arg.startsWith(`--${name}=`)).length > 1,
  )
) {
  process.stdout.write(
    json
      ? JSON.stringify({
          exitCode: 2,
          code: "arguments.invalid",
          chatGptHomologation: "not_verified",
        }) + "\n"
      : "Use --stage=prepare ou --stage=pilot --package=... --connection-id=... [--json].\n",
  );
  process.exitCode = 2;
} else {
  try {
    const report = await checkChatGptReadiness(loadConfig(), {
      stage: stage as "prepare" | "pilot",
      package: value("package"),
      connectionId: value("connection-id"),
    });
    process.stdout.write(
      json
        ? JSON.stringify(report) + "\n"
        : `Se7e ${report.version} — ${report.checkedAt} — ${report.stage}\n${report.checks.map((c) => `${c.status}: ${c.code} — ${c.action}`).join("\n")}\nInstalação e homologação no ChatGPT: não verificadas.\n`,
    );
    process.exitCode = report.exitCode;
  } catch {
    process.stdout.write(
      json
        ? JSON.stringify({
            exitCode: 1,
            code: "config.invalid",
            chatGptHomologation: "not_verified",
          }) + "\n"
        : "Configuração inválida. Revise os campos obrigatórios sem compartilhar segredos.\n",
    );
    process.exitCode = 1;
  }
}
