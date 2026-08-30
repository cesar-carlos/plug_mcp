import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const startedAt = Date.now();

const readPackageVersion = (): string => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "../../package.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "version" in parsed) {
      const version = (parsed as { version?: unknown }).version;
      if (typeof version === "string") {
        return version;
      }
    }
  } catch {
    /* package.json ausente no bundle */
  }
  return "0.1.0";
};

export const buildInfo = (): {
  version: string;
  sha: string;
  buildTime: string;
  startedAt: number;
  uptimeSec: number;
} => ({
  version: process.env.MCP_VERSION ?? readPackageVersion(),
  sha: process.env.GIT_SHA ?? process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? "unknown",
  buildTime: process.env.BUILD_TIME ?? new Date(startedAt).toISOString(),
  startedAt,
  uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
});
