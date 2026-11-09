import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readStablePluginFile } from "../../src/infrastructure/plugins/package-read.js";
import {
  pluginDiagnostic,
  PluginFailure,
} from "../../src/infrastructure/plugins/package-diagnostics.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof FsPromises>();
  return { ...actual, open: vi.fn(actual.open) };
});
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (!root.startsWith(resolve(tmpdir()) + sep + "se7e-read-")) throw Error("Unsafe cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "se7e-read-"));
  roots.push(root);
  const file = resolve(root, "data.json");
  await writeFile(file, "abcd");
  return file;
}
it("lê exatamente o limite e recusa excesso sem abrir o arquivo", async () => {
  const file = await fixture();
  expect(await readStablePluginFile(file, 4)).toEqual(await readFile(file));
  vi.mocked(open).mockClear();
  await expect(readStablePluginFile(file, 3)).rejects.toMatchObject({ code: "UNSAFE_FILE" });
  expect(open).not.toHaveBeenCalled();
});
it.each(["growth", "same-size"])("recusa alteração durante a leitura: %s", async (kind) => {
  const file = await fixture();
  const actual = await vi.importActual<typeof FsPromises>("node:fs/promises");
  const handle = await actual.open(file, "r");
  const read = handle.read.bind(handle);
  let changed = false;
  vi.spyOn(handle, "read").mockImplementation(async (...args: Parameters<typeof handle.read>) => {
    if (!changed) {
      changed = true;
      await writeFile(file, kind === "growth" ? "x".repeat(1024) : "wxyz");
      // Explicit mtime makes the same-size race deterministic on coarse filesystems.
      await actual.utimes(file, new Date(0), new Date(0));
    }
    return read(...args);
  });
  vi.mocked(open).mockResolvedValueOnce(handle);
  await expect(readStablePluginFile(file, 4)).rejects.toMatchObject({ code: "FILE_CHANGED" });
  await expect(handle.stat()).rejects.toThrow();
});
it("recusa substituição entre inspeção e abertura sem ler o substituto", async () => {
  const file = await fixture();
  const actual = await vi.importActual<typeof FsPromises>("node:fs/promises");
  const other = file + ".other";
  await writeFile(other, "private-content");
  const handle = await actual.open(other, "r");
  const read = vi.spyOn(handle, "read");
  vi.mocked(open).mockResolvedValueOnce(handle);
  await expect(readStablePluginFile(file, 4)).rejects.toMatchObject({ code: "FILE_CHANGED" });
  expect(read).not.toHaveBeenCalled();
  await expect(handle.stat()).rejects.toThrow();
});
it("diagnóstico não copia mensagem, causa, caminhos ou segredos", () => {
  const secret = "Authorization: Bearer synthetic-private-value";
  for (const error of [new Error(secret), new PluginFailure("FILE_CHANGED", secret)]) {
    const report = pluginDiagnostic(error, "validation");
    expect(report.action).toBeTruthy();
    expect(report.installedPackageVerified).toBe(false);
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(report.code).toBe(error instanceof PluginFailure ? "FILE_CHANGED" : "INVALID_PACKAGE");
  }
});
it.each([true, false])("falha ao fechar não oculta falha principal: %s", async (readFails) => {
  const file = await fixture();
  const actual = await vi.importActual<typeof FsPromises>("node:fs/promises");
  const handle = await actual.open(file, "r");
  const close = handle.close.bind(handle);
  if (readFails) vi.spyOn(handle, "read").mockRejectedValue(new PluginFailure("FILE_CHANGED"));
  vi.spyOn(handle, "close").mockImplementation(async () => {
    await close();
    throw new Error("synthetic-private-close-error");
  });
  vi.mocked(open).mockResolvedValueOnce(handle);
  const error = await readStablePluginFile(file, 4).catch((failure: unknown) => failure);
  expect(error).toMatchObject({ code: readFails ? "FILE_CHANGED" : "FILE_CLOSE_FAILED" });
  expect(pluginDiagnostic(error, "validation")).toMatchObject({ cleanupFailed: true });
  expect(JSON.stringify(pluginDiagnostic(error, "validation"))).not.toContain("synthetic-private");
});
