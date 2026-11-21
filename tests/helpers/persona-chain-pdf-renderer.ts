import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import type {
  PdfRendererPort,
  PdfRenderInput,
} from "../../src/domain/ports/persona-pdf-renderer.port.js";
const exec = promisify(execFile);
const files = [
  "pdf-renderer-main.js",
  "domain/persona-v2/pdf-format.js",
  "domain/persona-v2/pdf-renderer-failure.js",
  "domain/persona-v2/model.js",
  "domain/errors/error-codes.js",
  "infrastructure/persona-v2/pdf-render-slot.js",
  "infrastructure/persona-v2/pdf-renderer.js",
  "infrastructure/persona-v2/pdf-render-task.js",
  "infrastructure/persona-v2/pdf-render-client.js",
  "infrastructure/persona-v2/pdf-chart.js",
  "../assets/pdf-fonts/NotoSans-Regular.ttf",
  "../assets/pdf-fonts/NotoSans-Bold.ttf",
  "../assets/pdf-fonts/fonts.conf",
  "../node_modules/pdfkit/package.json",
  "../node_modules/sharp/package.json",
  "../node_modules/echarts/package.json",
  "../node_modules/zrender/package.json",
];
const bridge = `import {PdfSocketRenderer} from '/app/dist/infrastructure/persona-v2/pdf-render-client.js'; let bytes=0;const chunks=[];for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>16777216)throw Error('INPUT_LIMIT');chunks.push(chunk);} const input=JSON.parse(Buffer.concat(chunks)); const r=await new PdfSocketRenderer('/run/se7e-pdf/renderer.sock').render(input,11000);process.stdout.write(JSON.stringify({pages:r.pages,data:Buffer.from(r.data).toString('base64')}));`;

/** Operator-only fixture adapter. Data travels on stdin, never command arguments. */
export async function chainPdfRenderer(binding: {
  container: string;
  imageId: string;
}): Promise<PdfRendererPort> {
  if (
    process.env.NODE_ENV !== "test" ||
    !/^plug-mcp-pdf-render-[a-z0-9-]{1,50}$/.test(binding.container)
  )
    throw new Error("PDF fixture binding required");
  const { stdout } = await exec("docker", ["inspect", binding.container], {
    maxBuffer: 1024 * 1024,
    timeout: 5000,
  });
  const info = JSON.parse(stdout)[0];
  if (
    info.Image !== binding.imageId ||
    !info.State.Running ||
    info.HostConfig.NetworkMode !== "none" ||
    !info.HostConfig.ReadonlyRootfs ||
    info.Config.User !== "1000:1000" ||
    info.HostConfig.PidsLimit !== 32 ||
    info.HostConfig.Memory !== 384 * 1024 * 1024 ||
    info.HostConfig.NanoCpus !== 1_000_000_000 ||
    info.Config.Labels.task !== "plug-mcp-pdf-charts"
  )
    throw new Error("PDF fixture isolation differs");
  const remoteCode = `import{readFileSync}from'node:fs';import{createHash}from'node:crypto';console.log(JSON.stringify(${JSON.stringify(files)}.map(f=>createHash('sha256').update(readFileSync('/app/dist/'+f)).digest('hex'))));`;
  const remote = await exec(
    "docker",
    ["exec", binding.container, "node", "--input-type=module", "-e", remoteCode],
    { timeout: 5000, maxBuffer: 4096 },
  );
  const local = await Promise.all(
    files.map(async (file) =>
      createHash("sha256")
        .update(await readFile(new URL(`../../dist/${file}`, import.meta.url)))
        .digest("hex"),
    ),
  );
  if (JSON.stringify(local) !== JSON.stringify(JSON.parse(remote.stdout)))
    throw new Error("PDF fixture compiled revision differs");
  return {
    render: (input: PdfRenderInput, timeoutMs: number) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          "docker",
          ["exec", "-i", binding.container, "node", "--input-type=module", "-e", bridge],
          { stdio: ["pipe", "pipe", "ignore"], windowsHide: true },
        );
        const chunks: Buffer[] = [];
        let bytes = 0;
        let settled = false;
        const fail = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          child.kill();
          reject(new Error("PDF fixture render failed; no SQL replay"));
        };
        const timer = setTimeout(fail, Math.min(12000, Math.max(1, timeoutMs)));
        child.once("error", fail);
        child.stdin.once("error", fail);
        child.stdout.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 12 * 1024 * 1024) fail();
          else chunks.push(chunk);
        });
        child.once("close", (code) => {
          if (settled) return;
          if (code !== 0) {
            fail();
            return;
          }
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const data = Buffer.from(result.data, "base64");
            if (!Number.isInteger(result.pages) || data.subarray(0, 5).toString() !== "%PDF-") {
              fail();
              return;
            }
            settled = true;
            clearTimeout(timer);
            resolve({ data, pages: result.pages });
          } catch {
            fail();
          }
        });
        child.stdin.end(JSON.stringify(input));
      }),
  };
}
