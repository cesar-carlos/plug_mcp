import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

// GHSA-rmxm-3fg6-px4f: exercise the installed transitive dependency with synthetic files.
let directory: string;
let app: Hono;
const confidential = "synthetic-private-content";
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "plug-mcp-static-regression-"));
  await mkdir(join(directory, "private"));
  await writeFile(join(directory, "private", "record.txt"), confidential);
  await writeFile(join(directory, "public file.txt"), "synthetic-public-content");
  app = new Hono();
  app.use("/private/*", (context) => Promise.resolve(context.text("Access denied", 403)));
  app.use("*", serveStatic({ root: directory }));
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

it.each(["/private/record.txt", "/%70rivate/record.txt"])(
  "preserves authorization for %s",
  async (path) => {
    const response = await app.request(path);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(confidential);
  },
);
it("does not decode a malformed path into a protected directory", async () => {
  const response = await app.request("/%%37%30rivate/record.txt");
  const body = await response.text();
  expect(body).not.toContain(confidential);
  expect(response.status).toBe(404);
});
it("still serves public files with ordinary URL encoding", async () => {
  const response = await app.request("/public%20file.txt");
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("synthetic-public-content");
});
