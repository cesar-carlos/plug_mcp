import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:http";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { testConfig } from "../../src/config/env.js";
import { readChainManifest } from "../../scripts/homologation/chain-manifest.js";
import { PersonaRedisQueryStore } from "../../src/infrastructure/persona-v2/query-reuse-redis.js";

// Independent process with production v2 composition, no gateway overrides.
// Only synthetic fixture configuration is loaded; never reads an operational .env.
const path = process.env.PERSONA_CHAIN_MANIFEST;
if (!path || process.env.NODE_ENV !== "test") throw new Error("Manifesto de fixture obrigatório.");
const sessionRoot = realpathSync(dirname(path));
const manifest = readChainManifest(join(dirname(sessionRoot), "manifest.json"));
if (
  dirname(sessionRoot) !== manifest.root ||
  !/^chain-[a-f0-9]{32}$/.test(basename(sessionRoot)) ||
  realpathSync(process.cwd()) !== sessionRoot
)
  throw new Error("Processo MCP fora da sessão de fixture.");
const hub = JSON.parse(readFileSync(join(sessionRoot, "hub-ready.json"), "utf8")) as {
  hubUrl: string;
};
const hubUrl = new URL(hub.hubUrl);
if (
  hubUrl.protocol !== "http:" ||
  hubUrl.hostname !== "127.0.0.1" ||
  !hubUrl.port ||
  hubUrl.pathname !== "/" ||
  hubUrl.username ||
  hubUrl.password ||
  hubUrl.search ||
  hubUrl.hash
)
  throw new Error("Hub fora do endpoint local de fixture.");
// Bind first so browser Host/Origin are the actual owned loopback endpoint.
const server = createServer();
const instance = process.env.PERSONA_CHAIN_MCP_INSTANCE ?? "main";
if (!["main", "cache-a", "cache-b"].includes(instance))
  throw new Error("Instância de fixture inválida.");
const prefix = instance === "main" ? "mcp" : `mcp-${instance}`;
const bootPath = join(sessionRoot, `${prefix}-boot.json`);
const boot = existsSync(bootPath)
  ? (JSON.parse(readFileSync(bootPath, "utf8")) as { port: unknown })
  : undefined;
if (
  boot &&
  (!Number.isInteger(boot.port) || Number(boot.port) < 1024 || Number(boot.port) > 65535)
) {
  throw new Error("Endpoint MCP persistido inválido.");
}
server.listen(boot ? Number(boot.port) : 0, "127.0.0.1");
let runtime: Awaited<ReturnType<typeof composePersonaV2>> | undefined;
try {
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Endpoint MCP inválido.");
  const url = `http://127.0.0.1:${address.port}`;
  if (!boot) writeFileSync(bootPath, JSON.stringify({ port: address.port }), { flag: "wx" });
  const canonical =
    instance === "main"
      ? url
      : (JSON.parse(readFileSync(join(sessionRoot, "mcp-ready.json"), "utf8")) as { url: string })
          .url;
  const parsedCanonical = new URL(canonical);
  if (
    parsedCanonical.protocol !== "http:" ||
    parsedCanonical.hostname !== "127.0.0.1" ||
    !parsedCanonical.port ||
    parsedCanonical.pathname !== "/" ||
    parsedCanonical.username ||
    parsedCanonical.password ||
    parsedCanonical.search ||
    parsedCanonical.hash
  )
    throw new Error("Origem compartilhada fora da fixture.");
  if (instance !== "main") {
    // Fixture-only timing barriers around real Redis commands. Never alter SQL or authority.
    const publish = PersonaRedisQueryStore.prototype.publish;
    PersonaRedisQueryStore.prototype.publish = async function (...args) {
      const hold = join(sessionRoot, `${prefix}-hold`);
      if (existsSync(hold)) {
        writeFileSync(join(sessionRoot, `${prefix}-held.json`), '{"held":true}');
        const until = Date.now() + 15000;
        while (existsSync(hold)) {
          if (Date.now() >= until) throw new Error("Cache fixture barrier expired.");
          await delay(10);
        }
      }
      return publish.apply(this, args);
    };
    const claim = PersonaRedisQueryStore.prototype.claim;
    PersonaRedisQueryStore.prototype.claim = async function (...args) {
      const owned = await claim.apply(this, args);
      if (!owned)
        writeFileSync(join(sessionRoot, `${prefix}-following.json`), '{"following":true}');
      return owned;
    };
  }
  runtime = await composePersonaV2(
    testConfig({
      DATABASE_URL: manifest.controlDatabaseUrl,
      PLUG_SERVER_BASE_URL: hub.hubUrl,
      PUBLIC_BASE_URL: canonical,
      ...(instance !== "main"
        ? { PERSONA_V2_REDIS_URL: manifest.redisUrl, PERSONA_V2_QUERY_CACHE_TTL_MS: 60000 }
        : {}),
      LOG_LEVEL: "silent",
    }),
  );
  server.on("request", runtime.app);
  writeFileSync(join(sessionRoot, `${prefix}-ready.json`), JSON.stringify({ url }));
  const deadline = Date.now() + 15 * 60_000;
  while (!existsSync(join(sessionRoot, `${prefix}-stop`))) {
    if (Date.now() > deadline) throw new Error("Controlador não encerrou MCP de fixture.");
    await delay(100);
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await runtime?.close();
}
