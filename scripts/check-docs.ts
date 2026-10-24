import { fileURLToPath } from "node:url";
import { checkDocumentation } from "./docs/check.js";

const report = checkDocumentation(fileURLToPath(new URL("../", import.meta.url)));
for (const issue of report.problems) {
  console.error(`${issue.file}:${issue.line} [${issue.code}] ${issue.message}`);
}
process.stdout.write(`${JSON.stringify({ ...report, problems: report.problems.length })}\n`);
if (report.problems.length) {
  process.exitCode = 1;
}
