import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const revision = "a".repeat(40);
function verify(change: (dir: string, proof: Record<string, unknown>) => void): number | null {
  const dir = mkdtempSync(join(tmpdir(), "se7e-image-proof-"));
  try {
    const bytes = Buffer.from("isolated archive fixture");
    const proof: Record<string, unknown> = {
      schemaVersion: 1,
      imageId: `sha256:${"b".repeat(64)}`,
      platform: "linux/amd64",
      runtime: "legacy",
      revision,
      archiveSha256: createHash("sha256").update(bytes).digest("hex"),
      archiveBytes: bytes.length,
    };
    writeFileSync(join(dir, "image.tar"), bytes);
    change(dir, proof);
    writeFileSync(join(dir, "image-proof.json"), JSON.stringify(proof));
    return spawnSync(process.execPath, [resolve("scripts/tested-image.mjs"), "verify", dir], {
      env: { ...process.env, PERSONA_V2_RELEASE_REVISION: revision },
      encoding: "utf8",
      timeout: 10_000,
    }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}
interface Job {
  needs?: string[];
  if?: string;
  permissions?: Record<string, string>;
  steps: Step[];
}
const workflow = (name: string): Record<string, Job> =>
  (parse(readFileSync(`.github/workflows/${name}.yml`, "utf8")) as { jobs: Record<string, Job> })
    .jobs;

describe("tested image integrity", () => {
  it("accepts matching bytes and revision, without release approval", () => {
    expect(verify(() => undefined)).toBe(0);
  });
  it.each([
    ["revision", "c".repeat(40)],
    ["platform", "linux/arm64"],
    ["runtime", "unrecognized"],
    ["schemaVersion", 2],
    ["archiveBytes", 0],
    ["imageId", "invalid"],
  ])("rejects inconsistent %s", (key, value) => {
    expect(
      verify((_dir, proof) => {
        proof[key] = value;
      }),
    ).toBe(1);
  });
  it("rejects altered archive and missing archive", () => {
    expect(verify((dir) => writeFileSync(join(dir, "image.tar"), "changed"))).toBe(1);
    expect(verify((dir) => rmSync(join(dir, "image.tar")))).toBe(1);
  });
});

describe("publication ordering", () => {
  it("produces v2 separately, testing before export without publishing", () => {
    const candidate = workflow("ci")["persona-v2-candidate"]!;
    expect(candidate.permissions?.packages).toBeUndefined();
    const commands = candidate.steps.map((step) => step.run ?? "").join("\n");
    expect(commands).toContain("--target persona-v2-candidate");
    expect(commands.indexOf("test-persona-candidate.ps1 -Image se7e-native")).toBeLessThan(
      commands.indexOf("docker save"),
    );
    expect(commands).not.toMatch(/docker (push|login)/);
    const upload = candidate.steps.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(upload?.with?.name).toBe("persona-v2-tested-image-amd64");
  });
  it("requires every checking job, including the whole architecture matrix", () => {
    const jobs = workflow("ci");
    const publish = jobs["publish-image"]!;
    expect([...(publish.needs ?? [])].sort()).toEqual(
      Object.keys(jobs)
        .filter((name) => name !== "publish-image")
        .sort(),
    );
    expect(publish.if).not.toMatch(/always|failure|cancelled/);
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "publish-image") continue;
      expect(job.permissions?.packages).not.toBe("write");
      expect(job.steps.map((step) => step.run ?? "").join("\n")).not.toContain("docker push");
    }
    const commands = publish.steps.map((step) => step.run ?? "").join("\n");
    expect(commands).not.toContain("docker build");
    expect(commands.indexOf("check-persona-release.mjs")).toBeLessThan(
      commands.indexOf("docker push"),
    );
    expect(commands.indexOf("verify-loaded")).toBeLessThan(commands.indexOf("docker push"));
    expect(commands.indexOf("--image-proof")).toBeGreaterThan(commands.indexOf("verify-loaded"));
    expect(commands.indexOf("--image-proof")).toBeLessThan(commands.indexOf("docker push"));
  });
  it("deploys only the immutable artifact from the accepted origin", () => {
    const job = workflow("deploy").publish!;
    const download = job.steps.find((step) => step.uses?.startsWith("actions/download-artifact@"))!;
    expect(download.with?.["run-id"]).toBe("${{ steps.accepted-image.outputs.run_id }}");
    expect(download.with?.["artifact-ids"]).toBe("${{ steps.accepted-image.outputs.artifact_id }}");
    expect(download.with?.["digest-mismatch"]).toBe("error");
    const commands = job.steps.map((step) => step.run ?? "").join("\n");
    expect(commands.indexOf("accepted-image-origin.mjs")).toBeLessThan(
      commands.indexOf("verify-loaded"),
    );
    expect(commands).not.toMatch(/docker (pull|build)/);
    expect(commands.indexOf("verify-loaded")).toBeLessThan(commands.indexOf("docker save"));
    expect(commands.indexOf("--image-proof")).toBeGreaterThan(commands.indexOf("verify-loaded"));
    expect(commands.indexOf("--image-proof")).toBeLessThan(commands.indexOf("docker save"));
    expect(commands.indexOf("check-persona-release.mjs")).toBeLessThan(
      commands.indexOf("docker save"),
    );
    expect(commands).toContain('[ "$PUBLISH" = "false" ]');
  });
});
