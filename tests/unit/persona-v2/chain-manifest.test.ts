import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readChainManifest } from "../../../scripts/homologation/chain-manifest.js";
import { fixtureEnvironment } from "../../../scripts/homologation/fixture-environment.js";

const roots: string[] = [];
it("processos filhos herdam ferramentas nativas, nunca segredos ou seletores operacionais", () => {
  expect(
    fixtureEnvironment({
      Path: "synthetic-toolchain",
      SystemRoot: "synthetic-system",
      TEMP: "synthetic-temp",
      DATABASE_URL: "never-propagate",
      JWT_ACCESS_SECRET: "never-propagate",
      REDIS_URL: "never-propagate",
      DOTENV_CONFIG_PATH: "never-propagate",
      NODE_OPTIONS: "never-propagate",
      E2E_CLIENT_PASSWORD: "never-propagate",
    }),
  ).toEqual({
    Path: "synthetic-toolchain",
    SystemRoot: "synthetic-system",
    TEMP: "synthetic-temp",
  });
});
function fixture(
  hubDatabaseUrl = "postgresql://fixture:synthetic@127.0.0.1:54321/persona_chain_hub_test",
) {
  const runId = `se7e_persona_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
  const root = join(realpathSync(tmpdir()), runId);
  mkdirSync(root);
  roots.push(root);
  const manifest = {
    runId,
    root,
    hubDatabaseUrl,
    controlDatabaseUrl: "postgresql://fixture:synthetic@127.0.0.1:54321/persona_chain_control_test",
    redisUrl: "redis://127.0.0.1:54322",
    engines: Object.fromEntries(
      ["postgres", "mssql", "sybase"].map((engine) => [
        engine,
        {
          database: engine === "firebird" ? join(root, `${runId}.fdb`) : runId,
          connectionString: "synthetic;never-opened",
          port: engine === "firebird" ? 0 : 54323,
        },
      ]),
    ),
  };
  const path = join(root, "manifest.json");
  const save = () => writeFileSync(path, JSON.stringify(manifest));
  save();
  return { manifest, path, save };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (
      dirname(realpathSync(root)) !== realpathSync(tmpdir()) ||
      !/^se7e_persona_[a-f0-9]{12}_test$/.test(basename(root))
    )
      throw new Error("Recusa de limpeza fora da fixture criada.");
    rmSync(root, { recursive: true });
  }
});

it("aceita controle MCP e autoridade hub em bancos separados da mesma fixture", () => {
  const value = fixture();
  expect(readChainManifest(value.path).hubDatabaseUrl).toBe(value.manifest.hubDatabaseUrl);
});
it.each([
  "postgresql://fixture:synthetic@127.0.0.1:54321/persona_chain_control_test",
  "postgresql://fixture:synthetic@127.0.0.1:54321/operational",
  "postgresql://fixture:synthetic@10.0.0.1:54321/persona_chain_hub_test",
  "postgresql://fixture:synthetic@127.0.0.1:54324/persona_chain_hub_test",
  "postgresql://fixture:synthetic@127.0.0.1:54321/persona_chain_hub_test?host=10.0.0.1",
  "postgresql://fixture:synthetic@127.0.0.1:54321/persona_chain_hub_test#fragment",
])("recusa autoridade fora do banco dedicado e overrides de conexão (%#)", (url) => {
  const value = fixture(url);
  expect(() => readChainManifest(value.path)).toThrow("Hub deve usar banco próprio");
});
it("recusa overrides de conexão no controle MCP", () => {
  const value = fixture();
  value.manifest.controlDatabaseUrl += "?host=10.0.0.1";
  value.save();
  expect(() => readChainManifest(value.path)).toThrow("Controle/Redis");
});
it("recusa manifesto incompleto em vez de omitir motor obrigatório", () => {
  const value = fixture();
  delete value.manifest.engines.sybase;
  value.save();
  expect(() => readChainManifest(value.path)).toThrow();
});
