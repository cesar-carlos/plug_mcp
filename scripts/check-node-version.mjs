import { readFile } from "node:fs/promises";
export const nodeVersionSupported = (version, engines) => {
  const bounds = /^>=(\d+)\.(\d+)\.(\d+) <(\d+)$/.exec(engines);
  const parts = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!bounds || !parts) return false;
  const current = parts.slice(1).map(Number),
    minimum = bounds.slice(1, 4).map(Number);
  const difference = current.map((part, i) => part - minimum[i]).find((delta) => delta !== 0) ?? 0;
  return difference >= 0 && current[0] < Number(bounds[4]);
};
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (!nodeVersionSupported(process.versions.node, manifest.engines.node)) {
  process.stderr.write(`Node incompatível: requerido ${manifest.engines.node}.\n`);
  process.exitCode = 1;
} else process.stdout.write(`Node ${process.versions.node}: compatível.\n`);
