import { checkPersonaHttps, parsePersonaHttpsArgs } from "./homologation/persona-https.js";

try {
  const input = parsePersonaHttpsArgs(process.argv.slice(2));
  const report = await checkPersonaHttps(input);
  process.stdout.write(JSON.stringify(report) + "\n");
  process.exitCode = report.exitCode;
} catch {
  process.stdout.write(
    JSON.stringify({
      generation: "persona-v2",
      code: "arguments.invalid",
      exitCode: 2,
      chatGptConnection: "not_verified",
      productionReleased: false,
    }) + "\n",
  );
  process.exitCode = 2;
}
