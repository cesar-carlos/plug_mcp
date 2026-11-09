import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { expect, it } from "vitest";

it.each([false, true, "pagar", "receber"])(
  "wrapper emite argumentos isolados e campoPrazos explícito: %s",
  (enabled) => {
    const manifest = "fixture folder/manifest.json";
    const result = spawnSync(
      process.platform === "win32" ? "powershell.exe" : "pwsh",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        "scripts/homologation/manual-training-arguments.ps1",
        "-Manifest",
        manifest,
        "-Hub",
        "hub folder",
        "-Agent",
        "agent folder",
        "-Flutter",
        "flutter folder/flutter.bat",
        "-Image",
        `sha256:${"a".repeat(64)}`,
        "-Minutes",
        "30",
        ...(typeof enabled === "string"
          ? ["-CampoPrazo", enabled]
          : enabled
            ? ["-CampoPrazos"]
            : []),
      ],
      { encoding: "utf8" },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const values = parseArgs({
      args: result.stdout.trim().split(/\r?\n/),
      options: {
        manifest: { type: "string" },
        hub: { type: "string" },
        agent: { type: "string" },
        flutter: { type: "string" },
        image: { type: "string" },
        minutes: { type: "string" },
        campoPrazos: { type: "boolean", default: false },
        campoPrazo: { type: "string" },
      },
    }).values;
    expect(values).toEqual({
      manifest,
      hub: "hub folder",
      agent: "agent folder",
      flutter: "flutter folder/flutter.bat",
      image: `sha256:${"a".repeat(64)}`,
      minutes: "30",
      campoPrazos: enabled === true,
      ...(typeof enabled === "string" ? { campoPrazo: enabled } : {}),
    });
  },
);

it("recusa dois perfis antes de emitir argumentos", () => {
  const result = spawnSync(
    process.platform === "win32" ? "powershell.exe" : "pwsh",
    [
      "-NoProfile",
      "-NonInteractive",
      "-File",
      "scripts/homologation/manual-training-arguments.ps1",
      "-Manifest",
      "fixture",
      "-Hub",
      "hub",
      "-Agent",
      "agent",
      "-Flutter",
      "flutter",
      "-Image",
      `sha256:${"a".repeat(64)}`,
      "-CampoPrazos",
      "-CampoPrazo",
      "pagar",
    ],
    { encoding: "utf8" },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stdout.trim()).toBe("");
});
