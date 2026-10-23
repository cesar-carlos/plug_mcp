import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  HUB_CONTRACT_REF,
  HUB_CONTRACT_HASH,
  HUB_CONTRACT_SNAPSHOT_HASH,
  HUB_CONTRACT_SNAPSHOT_BASE_REF,
  HUB_CONTRACT_SNAPSHOT_INCORPORATED_REF,
  obterTreinamentoBase,
} from "../src/application/use-cases/shared/treinamento-base.js";
import { evaluationContracts } from "./evaluation-contracts.js";
import { verifyHistoricalHubSnapshot } from "./hub-snapshot.js";
const bundled = readFileSync("contracts/plug-mcp-rest-v1.json");
if (
  createHash("sha256")
    .update(readFileSync("contracts/hub-persona-v2.snapshot.patch"))
    .digest("hex") !== HUB_CONTRACT_SNAPSHOT_HASH
)
  throw new Error("Reviewed hub contract snapshot changed: review its pin and base together.");
if (createHash("sha256").update(bundled).digest("hex") !== HUB_CONTRACT_HASH)
  throw new Error("Bundled hub contract changed: review base and reference together.");
const hub = resolve(
  process.env.PLUG_SERVER_CHECKOUT ??
    (existsSync("plug_server_contract") ? "plug_server_contract" : "../plug_server"),
);
if (!existsSync(hub))
  throw new Error("Reviewed hub checkout required; upstream verification cannot be skipped.");
if (existsSync(hub)) {
  const head = execFileSync("git", ["-C", hub, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const hash = createHash("sha256")
    .update(readFileSync(resolve(hub, "contracts/plug-mcp-rest-v1.json")))
    .digest("hex");
  if (head !== HUB_CONTRACT_REF || hash !== HUB_CONTRACT_HASH)
    throw new Error(
      "Hub differs from base commit + reviewed snapshot: review contract, snapshot and tests together.",
    );
  verifyHistoricalHubSnapshot({
    hub,
    baseRef: HUB_CONTRACT_SNAPSHOT_BASE_REF,
    incorporatedRef: HUB_CONTRACT_SNAPSHOT_INCORPORATED_REF,
    currentRef: head,
    patch: resolve("contracts/hub-persona-v2.snapshot.patch"),
  });
  const committed = execFileSync("git", [
    "-C",
    hub,
    "show",
    `${head}:contracts/plug-mcp-rest-v1.json`,
  ]);
  if (createHash("sha256").update(committed).digest("hex") !== HUB_CONTRACT_HASH)
    throw new Error("Pinned commit does not contain the reviewed bundled contract.");
}
const adapter = readFileSync("src/infrastructure/plug-server/plug-server-rest.adapter.ts", "utf8");
if (!adapter.includes("/api/v1/agents/commands") || !adapter.includes("preserve"))
  throw new Error("Adapter/base diverged");
if (!evaluationContracts().has("obter_treinamento_base")) throw new Error("Base tool missing");
process.stdout.write(
  JSON.stringify({ success: true, base: obterTreinamentoBase({ modulo: "plug-server" }) }) + "\n",
);
