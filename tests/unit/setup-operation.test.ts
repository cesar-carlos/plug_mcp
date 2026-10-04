import { describe, expect, it, vi } from "vitest";
import { SetupOperations } from "../../src/application/use-cases/setup-operation.js";
import { MemorySetupOperations } from "../../src/infrastructure/persistence/setup-operation.js";
import {
  InMemoryAcessoRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { stubSessions } from "../helpers/stub-sessions.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const fixture = () => {
  const store = new MemorySetupOperations();
  const complete = vi.fn(async () => ({ token: "browser-only" }));
  const operations = new SetupOperations(
    store,
    crypto,
    new InMemoryAcessoRepository(),
    new InMemoryUsuarioRepository(),
    new FakePlugServer(),
    stubSessions(),
    "http://localhost",
    complete,
  );
  return { store, complete, operations };
};
describe("operações seguras do navegador", () => {
  it("persiste hash de 256 bits, GET não consome nem emite Bearer; POST só uma vez", async () => {
    const { store, complete, operations } = fixture();
    const issued = await operations.begin("registrar");
    const code = new URL(issued.setupUrl).pathname.split("/").at(-1)!;
    expect(Buffer.from(code, "base64url")).toHaveLength(32);
    expect(await store.find(code)).toBeNull();
    expect(await store.find(crypto.sha256Hex(code))).toMatchObject({
      purpose: "registrar",
      usuarioId: null,
      claimedAt: null,
    });
    const first = await operations.form(code);
    const second = await operations.form(code);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(complete).not.toHaveBeenCalled();
    const body = { csrf: second!.csrf, confirmado: "sim" };
    const attempts = await Promise.allSettled([
      operations.complete(code, body),
      operations.complete(code, body),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(complete).toHaveBeenCalledOnce();
    expect(await operations.form(code)).toBeNull();
  });
  it("recusa CSRF, replay e expiração sem executar a operação", async () => {
    const { store, complete, operations } = fixture();
    const issued = await operations.begin("registrar");
    const code = new URL(issued.setupUrl).pathname.split("/").at(-1)!;
    await expect(
      operations.complete(code, { csrf: "incorrect", confirmado: "sim" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const row = await store.find(crypto.sha256Hex(code));
    await store.create({ ...row!, expiresAt: new Date(0) });
    expect(await operations.form(code)).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });
});
