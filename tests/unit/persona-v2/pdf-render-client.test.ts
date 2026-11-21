import { createServer, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PdfSocketRenderer } from "../../../src/infrastructure/persona-v2/pdf-render-client.js";

const input = {
  orientation: "portrait" as const,
  columns: ["id"],
  rows: [["1"]],
  readAt: "2026-11-20T00:00:00.000Z",
  complete: false,
  maxPages: 2,
  maxBytes: 1024,
};

it("enforces a total deadline even while the peer keeps sending bytes", async () => {
  await withServer(
    (socket) => {
      socket.write(" ");
      const interval = setInterval(() => socket.write(" "), 10);
      const finish = setTimeout(
        () =>
          socket.end(
            JSON.stringify({ data: Buffer.from("%PDF-fixture").toString("base64"), pages: 1 }),
          ),
        400,
      );
      socket.once("close", () => {
        clearInterval(interval);
        clearTimeout(finish);
      });
    },
    async (client, calls) => {
      await expect(client.render(input, 80)).rejects.toMatchObject({
        code: "CAPABILITY_UNAVAILABLE",
      });
      expect(calls()).toBe(1);
    },
  );
});
async function withServer(
  reply: (socket: Socket) => void,
  test: (client: PdfSocketRenderer, calls: () => number) => Promise<void>,
) {
  const id = `pdf-fixture-${randomUUID()}`;
  const path = process.platform === "win32" ? `\\\\.\\pipe\\${id}` : join(tmpdir(), `${id}.sock`);
  let calls = 0;
  const sockets = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    calls++;
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
    socket.on("data", () => reply(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, resolve);
  });
  try {
    await test(new PdfSocketRenderer(path), () => calls);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

it("accepts a bounded response over the real local transport", async () => {
  const data = Buffer.from("%PDF-fixture");
  await withServer(
    (socket) => socket.end(JSON.stringify({ data: data.toString("base64"), pages: 1 })),
    async (client, calls) => {
      expect(await client.render(input, 1000)).toEqual({ data, pages: 1 });
      expect(calls()).toBe(1);
    },
  );
});

it.each(["disconnect", "timeout", "invalid", "overflow", "secret"])(
  "rejects %s without retry or leaking remote content",
  async (scenario) => {
    await withServer(
      (socket) => {
        if (scenario === "disconnect") socket.destroy();
        if (scenario === "invalid") socket.end(JSON.stringify({ data: "%%%", pages: 1 }));
        if (scenario === "overflow")
          socket.end(
            JSON.stringify({
              data: Buffer.from("%PDF-" + "x".repeat(2000)).toString("base64"),
              pages: 1,
            }),
          );
        if (scenario === "secret")
          socket.end(JSON.stringify({ error: "password=synthetic-secret SQL SELECT private" }));
      },
      async (client, calls) => {
        const error = await client.render(input, 80).catch((error: unknown) => error);
        expect(error).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
        expect(String(error)).not.toMatch(/synthetic-secret|SELECT|password/);
        expect(calls()).toBe(1);
      },
    );
  },
);

it("preserves only a closed renderer reason and discards accompanying private details", async () => {
  await withServer(
    (socket) =>
      socket.end(JSON.stringify({ error: "PDF_CELL_TOO_TALL", details: "private row value" })),
    async (client) => {
      const error = await client.render(input, 1000).catch((error: unknown) => error);
      expect(error).toMatchObject({
        code: "CAPABILITY_UNAVAILABLE",
        renderReason: "PDF_CELL_TOO_TALL",
      });
      expect(JSON.stringify(error)).not.toContain("private row value");
    },
  );
});
