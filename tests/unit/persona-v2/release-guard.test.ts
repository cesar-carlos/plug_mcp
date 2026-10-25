import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("aceite de clientes permanece bloqueado; deploy de teste tem verificador próprio", () => {
  const probe = spawnSync(process.execPath, ["scripts/check-persona-release.mjs"], {
    encoding: "utf8",
  });
  expect(probe.status).toBe(1);
  expect(probe.stderr).toContain("Publicação bloqueada");
  expect(readFileSync(".github/workflows/ci.yml", "utf8")).toContain(
    "node scripts/check-persona-release.mjs",
  );
  expect(readFileSync(".github/workflows/deploy.yml", "utf8")).toContain(
    "node scripts/check-persona-test-deploy.mjs",
  );
});
