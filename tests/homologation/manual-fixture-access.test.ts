import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { assertManualFixtureAccess } from "../../scripts/homologation/manual-fixture-access.js";
import { fixtureEnvironment } from "../../scripts/homologation/fixture-environment.js";

it("recusa pasta não protegida antes de gravar chaves ou iniciar serviços e não altera sua ACL", () => {
  if (process.platform !== "win32") throw new Error("Homologação manual requer Windows real.");
  const runId = `se7e_persona_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
  const root = join(tmpdir(), runId);
  mkdirSync(root);
  const script = join(root, "acl-fixture.ps1");
  writeFileSync(
    script,
    `param([string] $Root, [string] $Mode)
$ErrorActionPreference = 'Stop'
if ($Mode -eq 'private') {
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($sid)
  foreach ($identity in @($sid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
  }
  Set-Acl -LiteralPath $Root -AclObject $acl
}
if ($Mode -eq 'shared') {
  & icacls.exe $Root /grant '*S-1-5-32-545:(OI)(CI)(RX)' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare shared test ACL.' }
}
(Get-Acl -LiteralPath $Root).Sddl
`,
  );
  const acl = (mode: string) =>
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-File", script, "-Root", root, "-Mode", mode],
      { env: fixtureEnvironment(process.env), encoding: "utf8", windowsHide: true, timeout: 15000 },
    ).trim();
  try {
    const before = acl("inspect");
    expect(() => assertManualFixtureAccess(root)).toThrow("sem proteção privada comprovada");
    expect(acl("inspect")).toBe(before);
    const manifest = join(root, "manifest.json");
    writeFileSync(
      manifest,
      JSON.stringify({
        runId,
        root,
        controlDatabaseUrl:
          "postgresql://postgres:synthetic_never_print@127.0.0.1:1/persona_chain_control_test",
        hubDatabaseUrl:
          "postgresql://postgres:synthetic_never_print@127.0.0.1:1/persona_chain_hub_test",
        redisUrl: "redis://127.0.0.1:1",
        engines: Object.fromEntries(
          ["postgres", "mssql", "sybase"].map((dialect) => [
            dialect,
            { database: runId, port: 1, connectionString: "synthetic_never_print" },
          ]),
        ),
      }),
    );
    const child = spawnSync(
      process.execPath,
      [
        "node_modules/tsx/dist/cli.mjs",
        "scripts/homologation/manual-training.ts",
        "--manifest",
        manifest,
        "--hub",
        "unused",
        "--agent",
        "unused",
        "--flutter",
        "unused",
        "--image",
        `sha256:${"0".repeat(64)}`,
      ],
      { env: fixtureEnvironment(process.env), encoding: "utf8", windowsHide: true, timeout: 20000 },
    );
    expect(child.status).toBe(1);
    expect(child.stderr).toContain("sem proteção privada comprovada");
    expect(child.stderr).not.toContain("synthetic_never_print");
    expect(readdirSync(root).some((name) => name.startsWith("chain-"))).toBe(false);
    expect(acl("inspect")).toBe(before);

    const unusedFlutter = join(root, "unused-flutter.bat");
    writeFileSync(unusedFlutter, "@exit /b 91\r\n");
    for (const suite of ["manual-training", "manual-publication"]) {
      for (const options of [[], ["-Persistence", "memory", "-CandidateImage", "unused"]]) {
        const runner = spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-File",
            resolve("scripts/run-persona-chain-homologation.ps1"),
            "-Manifest",
            manifest,
            "-Flutter",
            unusedFlutter,
            "-HubCheckout",
            root,
            "-AgentCheckout",
            root,
            "-Suite",
            suite,
            ...options,
          ],
          {
            env: fixtureEnvironment(process.env),
            encoding: "utf8",
            windowsHide: true,
            timeout: 15000,
          },
        );
        expect(runner.status).toBe(1);
        expect(runner.stderr).toContain("requires an explicit candidate and persistent authority");
        expect(runner.stderr).not.toContain("synthetic_never_print");
      }
    }
    expect(readdirSync(root).some((name) => name.startsWith("chain-"))).toBe(false);

    acl("private");
    expect(() => assertManualFixtureAccess(root)).not.toThrow();
    const expanded = acl("shared");
    expect(() => assertManualFixtureAccess(root)).toThrow("sem proteção privada comprovada");
    expect(acl("inspect")).toBe(expanded);
  } finally {
    // Only this freshly generated direct child of the OS temp directory.
    rmSync(root, { recursive: true, force: true });
  }
});
