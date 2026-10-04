import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  HUB_CONTRACT_REF,
  HUB_CONTRACT_HASH,
  obterTreinamentoBase,
} from "../src/application/use-cases/shared/treinamento-base.js";
import { evaluationContracts } from "./evaluation-contracts.js";
const bundled = readFileSync("contracts/plug-mcp-rest-v1.json");
if (createHash("sha256").update(bundled).digest("hex") !== HUB_CONTRACT_HASH)
  throw new Error("Bundled hub contract changed: review base and reference together.");
const hub = resolve(
  process.env.PLUG_SERVER_CHECKOUT ??
    (existsSync("plug_server_contract") ? "plug_server_contract" : "../plug_server"),
);
if (existsSync(hub)) {
  const head = execFileSync("git", ["-C", hub, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const hash = createHash("sha256")
    .update(readFileSync(resolve(hub, "contracts/plug-mcp-rest-v1.json")))
    .digest("hex");
  if (head !== HUB_CONTRACT_REF || hash !== HUB_CONTRACT_HASH)
    throw new Error(
      "Hub changed: review base, pinned contract and tests together before updating reference.",
    );
}
const adapter = readFileSync("src/infrastructure/plug-server/plug-server-rest.adapter.ts", "utf8");
if (!adapter.includes("/api/v1/agents/commands") || !adapter.includes("preserve"))
  throw new Error("Adapter/base diverged");
if (!evaluationContracts().has("obter_treinamento_base")) throw new Error("Base tool missing");
console.log(
  JSON.stringify({ success: true, base: obterTreinamentoBase({ modulo: "plug-server" }) }),
);
