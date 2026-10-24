import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fixtureEnvironment } from "./fixture-environment.js";

/** Windows mode bits do not establish privacy; confirm the actual inherited ACL. */
export function assertManualFixtureAccess(root: string): void {
  if (process.platform !== "win32") throw new Error("A sessão manual exige Windows.");
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        fileURLToPath(new URL("./assert-manual-fixture-access.ps1", import.meta.url)),
        "-Root",
        root,
      ],
      {
        env: fixtureEnvironment(process.env),
        windowsHide: true,
        timeout: 15000,
        stdio: "pipe",
      },
    );
  } catch {
    throw new Error(
      "Pasta de fixture sem proteção privada comprovada; nenhum serviço manual foi iniciado.",
    );
  }
}
