import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
const { publishedRevision, findPublishedRevision, pendingDeployment } = (await import(
  pathToFileURL(resolve("scripts/pending-test-deployment.mjs")).href
)) as {
  publishedRevision: (run: unknown, jobs: unknown[], repository: string) => string | null;
  findPublishedRevision: (
    api: (path: string) => unknown,
    repository: string,
    currentRunId: number,
  ) => string | null;
  pendingDeployment: (
    revision: string,
    baseline: string | null,
    git: (args: string[]) => string,
    classify: (paths: string) => boolean,
  ) => boolean;
};
const sha = "a".repeat(40),
  repo = "fixture/project";
const run = {
  id: 1,
  path: ".github/workflows/deploy.yml",
  repository: { full_name: repo },
  head_repository: { full_name: repo },
  head_branch: "main",
  head_sha: sha,
  event: "workflow_run",
  status: "completed",
  conclusion: "success",
};
const job = {
  name: "publish",
  status: "completed",
  conclusion: "success",
  steps: [
    {
      name: "Publish the CI image",
      status: "completed",
      conclusion: "success",
      completed_at: "2026-10-28T12:00:00Z",
    },
  ],
};
it("ignora workflow verde sem envio e exige origem e publicação bem-sucedidas", () => {
  expect(publishedRevision(run, [job], repo)).toBe(sha);
  for (const conclusion of ["skipped", "failure", "cancelled"]) {
    expect(
      publishedRevision(run, [{ ...job, steps: [{ ...job.steps[0], conclusion }] }], repo),
    ).toBeNull();
  }
  expect(
    publishedRevision({ ...run, head_repository: { full_name: "other/project" } }, [job], repo),
  ).toBeNull();
  expect(publishedRevision(run, [job, job], repo)).toBeNull();
});
it("atravessa páginas e no-ops sem promovê-los a baseline", () => {
  const paths: string[] = [];
  const api = (path: string) => {
    paths.push(path);
    if (path.endsWith("&page=1"))
      return { workflow_runs: Array.from({ length: 100 }, (_, i) => ({ ...run, id: i + 2 })) };
    if (path.endsWith("&page=2")) return { workflow_runs: [run] };
    return { total_count: 1, jobs: path.includes("/runs/1/") ? [job] : [{ ...job, steps: [] }] };
  };
  expect(findPublishedRevision(api, repo, 999)).toBe(sha);
  expect(paths.some((p) => p.endsWith("page=2"))).toBe(true);
});
it("falha de API ou resposta incompleta não equivale a ausência de alterações", () => {
  expect(() =>
    findPublishedRevision(
      () => {
        throw new Error("API unavailable");
      },
      repo,
      999,
    ),
  ).toThrow("API unavailable");
  expect(() =>
    findPublishedRevision(
      (p: string) =>
        p.includes("/workflows/") ? { workflow_runs: [run] } : { total_count: 2, jobs: [job] },
      repo,
      999,
    ),
  ).toThrow("Incomplete");
  expect(findPublishedRevision(() => ({ workflow_runs: [] }), repo, 999)).toBeNull();
});
it("Git real: inclui correção antes do commit de teste; só ignora docs após publicação", () => {
  const dir = mkdtempSync(join(tmpdir(), "pending-deploy-"));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" });
  try {
    git(["init"]);
    git(["config", "user.email", "fixture@example.test"]);
    git(["config", "user.name", "Fixture"]);
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/main.ts"), "old");
    git(["add", "."]);
    git(["commit", "-m", "published"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    writeFileSync(join(dir, "src/main.ts"), "fixed");
    git(["commit", "-am", "runtime fix"]);
    const fixed = git(["rev-parse", "HEAD"]).trim();
    writeFileSync(join(dir, "README.md"), "docs");
    git(["add", "."]);
    git(["commit", "-m", "test followup"]);
    const head = git(["rev-parse", "HEAD"]).trim();
    const classify = (paths: string) => paths.split("\n").some((p) => p.startsWith("src/"));
    expect(pendingDeployment(head, base, git, classify)).toBe(true);
    expect(pendingDeployment(head, fixed, git, classify)).toBe(false);
    expect(pendingDeployment(head, head, git, classify)).toBe(false);
    expect(pendingDeployment(head, null, git, classify)).toBe(true);
    expect(() => pendingDeployment(base, head, git, classify)).toThrow();
    expect(() => pendingDeployment(head, "b".repeat(40), git, classify)).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("reexecução antiga usa o horário da publicação, não a criação do workflow", () => {
  const older = { ...run, id: 2, head_sha: "b".repeat(40) };
  expect(
    findPublishedRevision(
      (p: string) =>
        p.includes("/workflows/")
          ? { workflow_runs: [run, older] }
          : {
              total_count: 1,
              jobs: [
                {
                  ...job,
                  steps: [
                    {
                      ...job.steps[0],
                      completed_at: p.includes("/runs/2/")
                        ? "2026-10-29T12:00:00Z"
                        : "2026-10-28T12:00:00Z",
                    },
                  ],
                },
              ],
            },
      repo,
      999,
    ),
  ).toBe(older.head_sha);
});
