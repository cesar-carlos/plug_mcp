import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const revision = "a".repeat(40);
function fixture() {
  return {
    candidate: {
      imageRunId: 123,
      imageArtifactId: 456,
      imageRevision: revision,
      imageArtifactDigest: "b".repeat(64),
    },
    repository: "fixture/project",
    run: {
      id: 123,
      repository: { full_name: "fixture/project" },
      head_repository: { full_name: "fixture/project" },
      event: "push",
      head_branch: "main",
      head_sha: revision,
      path: ".github/workflows/ci.yml",
      status: "completed",
      conclusion: "success",
    },
    artifact: {
      id: 456,
      name: "persona-v2-tested-image-amd64",
      expired: false,
      workflow_run: { id: 123, head_sha: revision },
      digest: `sha256:${"b".repeat(64)}`,
    },
  };
}
function verify(f: ReturnType<typeof fixture>): unknown {
  const url = pathToFileURL(resolve("scripts/accepted-image-origin.mjs")).href;
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {validateOrigin} from ${JSON.stringify(url)}; import {readFileSync} from 'node:fs'; const f=JSON.parse(readFileSync(0,'utf8')); console.log(JSON.stringify(validateOrigin(f.candidate,f.repository,f.run,f.artifact)));`,
      ],
      { input: JSON.stringify(f), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ),
  );
}
describe("accepted image origin", () => {
  it("selects immutable origin without rebuilding", () =>
    expect(verify(fixture())).toEqual({
      run_id: "123",
      artifact_id: "456",
      image_revision: revision,
    }));
  it.each(["event", "head_branch", "head_sha", "path", "status", "conclusion"] as const)(
    "refuses different run %s",
    (key) => {
      const f = fixture();
      f.run[key] = "different";
      expect(() => verify(f)).toThrow();
    },
  );
  it("refuses forks, different repository, expired artifact and changed digest", () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.run.head_repository.full_name = "other/project";
      },
      (f: ReturnType<typeof fixture>) => {
        f.run.repository.full_name = "other/project";
      },
      (f: ReturnType<typeof fixture>) => {
        f.artifact.expired = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.artifact.digest = `sha256:${"c".repeat(64)}`;
      },
      (f: ReturnType<typeof fixture>) => {
        f.artifact.id = 999;
      },
      (f: ReturnType<typeof fixture>) => {
        f.artifact.workflow_run.id = 999;
      },
      (f: ReturnType<typeof fixture>) => {
        f.candidate.imageRunId = 0;
      },
    ]) {
      const f = fixture();
      change(f);
      expect(() => verify(f)).toThrow();
    }
  });
});
