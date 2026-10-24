import { readFileSync } from "node:fs";
import {
  captureCandidate,
  verifyEvidence,
  verifyAcceptedImage,
} from "./persona-release-evidence.mjs";

const manifest = JSON.parse(
  readFileSync(new URL("../contracts/persona-v2-release.json", import.meta.url), "utf8"),
);
// Keep the required acceptance contract in code as well as in the manifest.
// Removing or renaming a gate in JSON must never authorize a partial release.
const requiredGates = [
  "shared-knowledge-and-compatibility",
  "identity-and-authorization",
  "training-and-local-query",
  "federation",
  "agent-operation-journal",
  "hub-operation-contract",
  "operation-approval-and-reconciliation",
  "external-rest-and-mcp",
  "oauth-and-console",
  "postgres-real",
  "mssql-real",
  "sybase-real",
  "coordinated-cutover",
];
const complete =
  manifest.generation === "persona-v2" &&
  manifest.ready === true &&
  Array.isArray(manifest.requiredGates) &&
  manifest.requiredGates.length === requiredGates.length &&
  new Set(manifest.requiredGates).size === requiredGates.length &&
  requiredGates.every((gate) => manifest.requiredGates.includes(gate)) &&
  Array.isArray(manifest.completedGates) &&
  manifest.completedGates.length === requiredGates.length &&
  new Set(manifest.completedGates).size === requiredGates.length &&
  manifest.requiredGates.every((gate) => manifest.completedGates.includes(gate));

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--candidate") {
    console.log(JSON.stringify({ ...captureCandidate(), authorizesRelease: false }));
  } else {
    const imageProof = args.length === 2 && args[0] === "--image-proof" ? args[1] : undefined;
    if ((args.length && !imageProof) || !complete) throw new Error("Aceite incompleto.");
    verifyEvidence(manifest, requiredGates);
    if (imageProof) verifyAcceptedImage(manifest, imageProof);
  }
} catch {
  console.error(
    "Publicação bloqueada: aceite incompleto, evidência inválida ou candidato divergente.",
  );
  process.exitCode = 1;
}
