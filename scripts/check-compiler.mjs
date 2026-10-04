import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const compiler = join(dirname(require.resolve("@typescript/native/package.json")), "bin", "tsc");
const version = execFileSync(process.execPath, [compiler, "--version"], {
  encoding: "utf8",
}).trim();
if (!/^Version 7\./.test(version)) {
  throw new Error(`TypeScript 7 required, got ${version}`);
}
console.log(version);
