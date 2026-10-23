import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureCheckout, mcpSnapshotExclusions } from "./checkout-snapshot.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projects = ["mcp", "hub", "agent"];
const fail = () => {
  throw new Error("Registro da revisão da cadeia inválido ou incompleto.");
};

try {
  const [phase, ...args] = process.argv.slice(2);
  if (!["before", "after"].includes(phase) || args.length % 2) fail();
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--hub", "--agent", "--record", "--test-exit"].includes(args[i]) ||
      options.has(args[i]) ||
      !args[i + 1]
    )
      fail();
    options.set(args[i], args[i + 1]);
  }
  if (
    !options.has("--hub") ||
    !options.has("--agent") ||
    !options.has("--record") ||
    (phase === "after") !== options.has("--test-exit")
  )
    fail();
  const checkoutRoots = [root, options.get("--hub"), options.get("--agent")].map((path) =>
    realpathSync(path),
  );
  if (new Set(checkoutRoots).size !== projects.length) fail();
  const cache = join(root, "node_modules", ".cache");
  // Only an explicit new record in the ignored local cache; never write to an upstream checkout.
  for (const path of [join(root, "node_modules"), cache]) {
    mkdirSync(path, { recursive: true });
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) fail();
  }
  const recordPath = resolve(options.get("--record"));
  if (
    dirname(recordPath) !== cache ||
    !/^persona-chain-sources-[a-f0-9]{32}\.json$/.test(recordPath.slice(cache.length + 1))
  )
    fail();
  let record;
  if (phase === "after") {
    const stat = lstatSync(recordPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) fail();
    record = JSON.parse(readFileSync(recordPath, "utf8"));
    if (
      record.schemaVersion !== 1 ||
      record.authorizesRelease !== false ||
      record.completedAt ||
      !Number.isFinite(Date.parse(record.startedAt))
    )
      fail();
    for (const project of projects) {
      const snapshot = record.before?.[project];
      if (
        !snapshot ||
        !/^[a-f0-9]{40}$/.test(snapshot.revision) ||
        !/^[a-f0-9]{64}$/.test(snapshot.sourceSha256) ||
        !Number.isSafeInteger(snapshot.fileCount) ||
        snapshot.fileCount <= 0
      )
        fail();
    }
  }
  const snapshots = {
    mcp: captureCheckout(root, mcpSnapshotExclusions),
    hub: captureCheckout(options.get("--hub")),
    agent: captureCheckout(options.get("--agent")),
  };
  if (phase === "before") {
    record = {
      schemaVersion: 1,
      authorizesRelease: false,
      startedAt: new Date().toISOString(),
      before: snapshots,
    };
    writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  } else {
    const value = options.get("--test-exit");
    if (!/^(0|[1-9][0-9]{0,2})$/.test(value)) fail();
    const testExitCode = Number(value);
    const unchanged = projects.every(
      (project) => JSON.stringify(record.before[project]) === JSON.stringify(snapshots[project]),
    );
    record = {
      ...record,
      completedAt: new Date().toISOString(),
      after: snapshots,
      testExitCode,
      unchanged,
      result: unchanged && testExitCode === 0 ? "passed" : "failed",
    };
    writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
    if (!unchanged || testExitCode !== 0) process.exitCode = 1;
  }
  // Only revision/count/digest metadata. Never log paths, source text or the private fixture manifest.
  console.log(JSON.stringify({ chainSources: record }));
} catch {
  console.error("Revisão da cadeia não comprovada: inventário ausente, inválido ou indisponível.");
  process.exitCode = 1;
}
