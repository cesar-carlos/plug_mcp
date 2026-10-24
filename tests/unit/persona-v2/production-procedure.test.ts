import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runPersonaProductionProcedure } from "../../../src/infrastructure/persona-v2/production-procedure.js";

const imageId = `sha256:${"a".repeat(64)}`;
const env = {
  PERSONA_V2_PRODUCTION_IMAGE: `ghcr.io/fixture/persona@sha256:${"b".repeat(64)}`,
  PERSONA_V2_PRODUCTION_PUBLIC_URL: "https://persona.example.test",
  PERSONA_V2_PRODUCTION_HUB_URL: "https://hub.example.test",
  PERSONA_V2_PRODUCTION_DATABASE_URL: "postgres://fixture:fixture@database/se7e_persona_v2",
  PERSONA_V2_PRODUCTION_ENCRYPTION_KEY: "a123456789bcdef0".repeat(4),
  PERSONA_V2_PRODUCTION_ENCRYPTION_KEY_ID: "fixture-key",
  PERSONA_V2_PRODUCTION_LOCAL_PORT: "3335",
};
function fixture(
  mode: "check" | "migrate" | "start",
  failAt = -1,
  state?: string,
  loadedImage = imageId,
) {
  const calls: string[][] = [];
  return {
    calls,
    execute: () =>
      runPersonaProductionProcedure({
        mode,
        artifactDirectory: "/fixture/artifact",
        node: process.execPath,
        env,
        candidate: { imageId, imageRevision: "c".repeat(40) },
        run: (command, args) => {
          calls.push([command, ...args]);
          if (calls.length - 1 === failAt) throw new Error("fixture failure");
          if (args[0] === "image") return JSON.stringify([{ Id: loadedImage }]);
          if (args.includes("ps")) return state ? "d".repeat(64) : "";
          if (args[0] === "inspect") return JSON.stringify([{ State: { Status: state } }]);
          return "";
        },
      }),
  };
}
const mutations = (calls: string[][]) =>
  calls.filter((c) => c[0] === "docker" && (c.includes("up") || c.includes("run")));

describe("operator production procedure", () => {
  it("refuses a configured digest resolving to a different image", () => {
    const f = fixture("start", -1, undefined, `sha256:${"e".repeat(64)}`);
    expect(f.execute).toThrow("Configured image differs");
    expect(mutations(f.calls)).toEqual([]);
  });
  it("checks evidence, provenance, archive, loaded image and compose without mutations", () => {
    const f = fixture("check");
    f.execute();
    expect(f.calls[0]?.[1]).toBe("scripts/check-persona-release.mjs");
    expect(f.calls.some((c) => c.includes("scripts/accepted-image-origin.mjs"))).toBe(true);
    expect(f.calls.some((c) => c.includes("verify-loaded") && c.includes(imageId))).toBe(true);
    expect(f.calls.at(-1)).toContain("--quiet");
    expect(mutations(f.calls)).toEqual([]);
  });
  it.each(["migrate", "start"] as const)("executes only the explicit %s phase", (mode) => {
    const f = fixture(mode);
    f.execute();
    expect(mutations(f.calls)).toHaveLength(1);
    const action = f.calls.at(-1)!;
    expect(action).toContain("--pull");
    expect(action).toContain("never");
    expect(action).toContain("/dev/null");
    expect(f.calls.at(-2)?.[1]).toBe("scripts/check-persona-release.mjs");
    if (mode === "start") {
      expect(action).toContain("--wait");
      expect(action).toContain("--no-build");
      expect(action.slice(-2)).toEqual(["server", "worker"]);
      expect(action).not.toContain("migrate");
    } else {
      expect(action.at(-1)).toBe("migrate");
      expect(action).not.toContain("up");
    }
  });
  it.each(["running", "paused", "restarting", "created", "dead"])(
    "refuses services in %s state",
    (state) => {
      const f = fixture("migrate", -1, state);
      expect(f.execute).toThrow();
      expect(mutations(f.calls)).toEqual([]);
    },
  );
  it("allows stopped services after explicit operator shutdown", () => {
    const f = fixture("start", -1, "exited");
    f.execute();
    expect(mutations(f.calls)).toHaveLength(1);
  });
  it("stops at every failed check and never retries the mutating command", () => {
    const baseline = fixture("start");
    baseline.execute();
    for (let i = 0; i < baseline.calls.length; i++) {
      const f = fixture("start", i);
      expect(f.execute).toThrow();
      expect(f.calls).toHaveLength(i + 1);
      expect(mutations(f.calls)).toHaveLength(i === baseline.calls.length - 1 ? 1 : 0);
    }
  });
  it("current real gate blocks the procedure before any Docker command", () => {
    const calls: string[] = [];
    expect(() =>
      runPersonaProductionProcedure({
        mode: "migrate",
        artifactDirectory: "/missing",
        node: process.execPath,
        env,
        candidate: { imageId, imageRevision: "c".repeat(40) },
        run: (command, args) => {
          calls.push(command);
          return execFileSync(command, args, { encoding: "utf8", stdio: "pipe" });
        },
      }),
    ).toThrow();
    expect(calls).toEqual([process.execPath]);
  });
});
