import { createServer } from "node:https";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, rename, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { PersonaNotificationHttps } from "../../src/infrastructure/persona-v2/notification-transport.js";
import {
  PublicExternalHttp,
  sendExternalHttps,
} from "../../src/infrastructure/persona-v2/external-http.js";

export const fixtureNotificationSecret = "isolated_notification_secret_0123456789";
export async function notificationProviderFixture() {
  const cert = await readFile(new URL("../fixtures/tls/test-cert.pem", import.meta.url));
  const key = await readFile(new URL("../fixtures/tls/test-key.pem", import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), "se7e-notification-fixture-")),
    ledger = join(directory, "ledger.json");
  await writeFile(ledger, "{}");
  let writing = Promise.resolve();
  const state = {
    requests: 0,
    invalid: 0,
    loseReply: false,
    status: 204,
    oversized: false,
    addresses: [{ address: "93.184.216.34", family: 4 }],
    beforeDns: () => Promise.resolve(),
    beforeReply: () => Promise.resolve(),
  };
  const server = createServer({ cert, key }, (req, res) => {
    void (async () => {
      state.requests++;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = Buffer.concat(chunks).toString(),
        id = String(req.headers["x-se7e-event-id"]),
        timestamp = String(req.headers["x-se7e-timestamp"]);
      const expected = `sha256=${createHmac("sha256", fixtureNotificationSecret).update(`${id}.${timestamp}.${body}`).digest("hex")}`;
      const signature = String(req.headers["x-se7e-signature-256"]);
      const parsed = JSON.parse(body) as { id?: string };
      if (
        parsed.id !== id ||
        !/^\d+$/.test(timestamp) ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
        signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
        req.headers.authorization ||
        req.method !== "POST"
      ) {
        state.invalid++;
        res.writeHead(401).end();
        return;
      }
      // Serialize native concurrent POSTs; a read/write race would hide duplicates or lose IDs.
      writing = writing.then(async () => {
        const data = JSON.parse(await readFile(ledger, "utf8")) as Record<
          string,
          { copies: number; effects: number; body: string }
        >;
        if (data[id] && data[id].body !== body) {
          throw new Error("Changed notification body");
        }
        data[id] = { copies: (data[id]?.copies ?? 0) + 1, effects: 1, body };
        await writeFile(`${ledger}.tmp`, JSON.stringify(data), { flush: true });
        await rename(`${ledger}.tmp`, ledger);
      });
      await writing;
      await state.beforeReply();
      if (state.loseReply) {
        req.socket.destroy();
        return;
      }
      res.writeHead(
        state.status,
        state.status === 302 ? { Location: "https://private.invalid/" } : {},
      );
      res.end(state.oversized ? "x".repeat(16384) : "");
    })().catch(() => req.socket.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const resolve = async () => {
    await state.beforeDns();
    return state.addresses;
  };
  const transport = new PersonaNotificationHttps(
    new PublicExternalHttp({
      resolve,
      send: (input) => {
        const url = new URL(input.url);
        url.hostname = "localhost";
        url.port = String(port);
        return sendExternalHttps({ ...input, url }, { address: "127.0.0.1", family: 4 }, cert);
      },
    }),
    resolve,
  );
  return {
    transport,
    state,
    ledger,
    port,
    read: async () => {
      await writing;
      return JSON.parse(await readFile(ledger, "utf8")) as Record<
        string,
        { copies: number; effects: number; body: string }
      >;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await rm(directory, { recursive: true });
    },
  };
}
