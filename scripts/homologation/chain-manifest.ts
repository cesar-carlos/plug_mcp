import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

export const chainEngines = ["postgres", "mssql", "sybase"] as const;
const engine = z.object({
  database: z.string().min(1),
  port: z.number().int().min(0).max(65535),
  connectionString: z.string().min(1),
});
const schema = z.object({
  runId: z.string().regex(/^se7e_persona_[a-f0-9]{12}_test$/),
  root: z.string(),
  controlDatabaseUrl: z.string().url(),
  hubDatabaseUrl: z.string().url().optional(),
  redisUrl: z.string().url(),
  engines: z.object({ postgres: engine, mssql: engine, sybase: engine }),
});
export function readChainManifest(path: string): z.infer<typeof schema> {
  const manifest = schema.parse(JSON.parse(readFileSync(path, "utf8")));
  const root = realpathSync(manifest.root);
  if (basename(root) !== manifest.runId || dirname(root) !== realpathSync(tmpdir()))
    throw new Error("A fixture deve ser filha direta do diretório temporário.");
  if (realpathSync(dirname(path)) !== root) throw new Error("Manifesto fora da fixture.");
  const control = new URL(manifest.controlDatabaseUrl);
  const redis = new URL(manifest.redisUrl);
  if (
    control.protocol !== "postgresql:" ||
    control.hostname !== "127.0.0.1" ||
    control.pathname !== "/persona_chain_control_test" ||
    !control.port ||
    control.search !== "" ||
    control.hash !== "" ||
    redis.protocol !== "redis:" ||
    redis.hostname !== "127.0.0.1" ||
    !redis.port ||
    redis.search !== "" ||
    redis.hash !== ""
  )
    throw new Error("Controle/Redis devem ser fixtures explícitas em loopback.");
  if (manifest.hubDatabaseUrl) {
    const hub = new URL(manifest.hubDatabaseUrl);
    if (
      hub.protocol !== control.protocol ||
      hub.hostname !== control.hostname ||
      hub.port !== control.port ||
      hub.pathname !== "/persona_chain_hub_test" ||
      hub.search !== "" ||
      hub.hash !== ""
    )
      throw new Error("Hub deve usar banco próprio na fixture PostgreSQL explícita.");
  }
  for (const dialect of chainEngines) {
    const db = manifest.engines[dialect].database;
    if (db !== manifest.runId) throw new Error(`Base descartável divergente: ${dialect}.`);
    if (manifest.engines[dialect].port === 0)
      throw new Error(`Porta explícita obrigatória: ${dialect}.`);
  }
  return { ...manifest, root };
}
