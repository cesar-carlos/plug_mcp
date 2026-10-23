import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { FixtureProcesses } from "../../../scripts/homologation/fixture-processes.js";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "se7e-process-unit-"));
  roots.push(root);
  return { root, processes: new FixtureProcesses(root) };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("separa preparação concluída de serviço encerrado inesperadamente", async () => {
  const { root, processes } = fixture();
  const preparation = processes.launch(
    process.execPath,
    ["-e", "process.exit(0)"],
    root,
    {},
    "preparation",
  );
  await processes.completed(preparation);
  expect(() => processes.assertRunning()).not.toThrow();
  const service = processes.launch(
    process.execPath,
    ["-e", "process.exit(2)"],
    root,
    {},
    "service",
  );
  await service.exit;
  expect(() => processes.assertRunning()).toThrow("serviço");
  expect(await processes.stop()).toEqual({ stopped: true, clean: false });
});

it("recusa confirmação inválida sem incluir seu conteúdo privado no erro", async () => {
  const { root, processes } = fixture();
  writeFileSync(join(root, "ready.json"), JSON.stringify({ url: "synthetic-private-value" }));
  await expect(processes.waitJson("ready.json", z.object({ url: z.url() }))).rejects.toThrow(
    /^Confirmação de serviço da fixture inválida\.$/,
  );
  expect(await processes.stop()).toEqual({ stopped: true, clean: true });
});
