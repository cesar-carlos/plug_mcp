/** Dedicated network-none sidecar: no config loader, database, keyring or hub clients. */
import { createServer } from "node:net";
import { chmod, lstat, unlink } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { PdfRenderSlot } from "./infrastructure/persona-v2/pdf-render-slot.js";
// Fontconfig/libvips read the native process environment, not a worker's JS-only
// environment copy. Configure only fixed local resources before starting threads.
const fontConfig = fileURLToPath(new URL("../assets/pdf-fonts/fonts.conf", import.meta.url));
process.env.FONTCONFIG_FILE = fontConfig;
process.env.VIPS_CONCURRENCY = "1";
process.env.RAYON_NUM_THREADS = "1";
const path = "/run/se7e-pdf/renderer.sock";
try {
  const entry = await lstat(path);
  if (!entry.isSocket()) throw new Error("PDF_SOCKET_PATH_INVALID");
  await unlink(path);
} catch (error) {
  if ((error as { code?: string }).code !== "ENOENT") throw error;
}
const slot = new PdfRenderSlot();
const server = createServer({ allowHalfOpen: true }, (socket) => {
  let bytes = 0;
  let dispatched = false;
  const chunks: Buffer[] = [];
  socket.setTimeout(12000, () => socket.destroy());
  socket.on("error", () => socket.destroy());
  socket.on("data", (chunk: Buffer) => {
    if (dispatched) {
      socket.destroy();
      return;
    }
    bytes += chunk.length;
    if (bytes > 16 * 1024 * 1024) socket.destroy();
    else {
      chunks.push(chunk);
      if (chunk.includes(10)) {
        dispatched = true;
        const payload = Buffer.concat(chunks);
        if (payload.indexOf(10) !== payload.length - 1) {
          socket.destroy();
          return;
        }
        dispatch();
      }
    }
  });
  socket.once("end", () => {
    if (!dispatched) socket.destroy();
  });
  const dispatch = () => {
    if (!bytes || socket.destroyed) {
      socket.end();
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      socket.end(JSON.stringify({ error: "PDF_INPUT_INVALID" }));
      return;
    }
    if (!slot.acquire()) {
      socket.end(JSON.stringify({ error: "PDF_RENDER_BUSY" }));
      return;
    }
    let task: Worker;
    try {
      task = new Worker(
        new URL("./infrastructure/persona-v2/pdf-render-task.js", import.meta.url),
        {
          workerData: input,
          env: {
            VIPS_CONCURRENCY: "1",
            RAYON_NUM_THREADS: "1",
            FONTCONFIG_FILE: fontConfig,
          },
          resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 },
        },
      );
    } catch {
      void slot.releaseAfter(() => Promise.resolve());
      socket.end(JSON.stringify({ error: "PDF_RENDER_FAILED" }));
      return;
    }
    let settled = false;
    const finish = (result: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void slot
        .releaseAfter(() => task.terminate())
        .then(() => {
          if (!socket.destroyed) socket.end(JSON.stringify(result));
        });
    };
    const timer = setTimeout(() => finish({ error: "PDF_RENDER_TIMEOUT" }), 10000);
    task.once("message", (result: { error?: string; data?: Uint8Array; pages?: number }) => {
      if (result.error) finish({ error: result.error });
      else if (
        result.data &&
        result.data.byteLength <= 8 * 1024 * 1024 &&
        Number.isInteger(result.pages)
      ) {
        finish({ data: Buffer.from(result.data).toString("base64"), pages: result.pages });
      } else finish({ error: "PDF_RENDER_FAILED" });
    });
    task.once("error", () => finish({ error: "PDF_RENDER_FAILED" }));
    task.once("exit", () => finish({ error: "PDF_RENDER_FAILED" }));
    socket.once("close", () => finish({ error: "PDF_RENDER_CANCELLED" }));
  };
});
server.maxConnections = 2;
server.listen(path, () => {
  void chmod(path, 0o600);
});
process.once("SIGTERM", () => server.close());
process.once("SIGINT", () => server.close());
