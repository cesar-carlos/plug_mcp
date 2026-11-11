import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const hosts = ["azure.archive.ubuntu.com", "archive.ubuntu.com", "security.ubuntu.com"];
type Command = (file: string, args: string[]) => string;

/** Only an ephemeral GitHub-hosted Linux runner may change its own resolver. */
export function prepareBrowserDns(
  env: NodeJS.ProcessEnv,
  platform: string,
  command: Command,
): { fallback: boolean } {
  if (
    platform !== "linux" ||
    env.GITHUB_ACTIONS !== "true" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted"
  )
    throw new Error("Browser DNS preparation requires an ephemeral GitHub-hosted Linux runner.");
  const available = () =>
    hosts.every((host) => {
      try {
        // Match APT's unprivileged download user, not just the runner/root resolver.
        return (
          command("sudo", ["-n", "-u", "_apt", "timeout", "10", "getent", "ahostsv4", host]).trim()
            .length > 0
        );
      } catch {
        return false;
      }
    });
  if (available()) return { fallback: false };
  const routes: unknown = JSON.parse(command("ip", ["-j", "-4", "route", "show", "default"]));
  if (!Array.isArray(routes)) throw new Error("Cannot identify runner default interface.");
  const interfaces = [
    ...new Set(
      routes.map((route: unknown) =>
        route && typeof route === "object" && "dev" in route ? route.dev : undefined,
      ),
    ),
  ];
  const link = interfaces[0];
  if (
    interfaces.length !== 1 ||
    typeof link !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,14}$/.test(link)
  )
    throw new Error("Ambiguous or invalid runner default interface.");
  command("sudo", ["-n", "resolvectl", "dns", link, "1.1.1.1", "8.8.8.8"]);
  command("sudo", ["-n", "resolvectl", "domain", link, "~."]);
  command("sudo", ["-n", "resolvectl", "flush-caches"]);
  if (!available())
    throw new Error(
      "Ubuntu repository DNS remains unavailable; browser gates must not be skipped.",
    );
  return { fallback: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(
      JSON.stringify(
        prepareBrowserDns(process.env, process.platform, (file, args) =>
          execFileSync(file, args, { encoding: "utf8", timeout: 12000, stdio: "pipe" }),
        ),
      ),
    );
  } catch {
    console.error(
      "CI browser DNS preparation failed. Preserve browser gates and inspect runner DNS.",
    );
    process.exitCode = 1;
  }
}
