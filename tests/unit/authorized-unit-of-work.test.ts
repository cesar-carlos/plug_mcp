import { describe, expect, it } from "vitest";
import { oauthFixture } from "../helpers/oauth-fixture.js";
import {
  MemoryAuthorizedUnitOfWork,
  authorizedRepositories,
  assertOutsideAuthorizedTransaction,
} from "../../src/infrastructure/persistence/authorized-unit-of-work.js";
import { createMemoryRepositories } from "../../src/infrastructure/persistence/memory/repositories.js";
import { sessionContext } from "../../src/application/session-context.js";

const fixture = async () => {
  const f = await oauthFixture();
  const tokens = await f.oauth.exchange(await f.authorize());
  const auth = await f.oauth.resolve(tokens.access_token);
  if (auth?.kind !== "oauth") throw new Error("missing test auth");
  const repositories = createMemoryRepositories();
  repositories.acessos = f.accesses;
  const unit = new MemoryAuthorizedUnitOfWork(repositories, f.store, f.policy);
  return { ...f, auth, repositories, unit, facade: authorizedRepositories(repositories, unit) };
};
describe("Unidade de trabalho autorizada", () => {
  it("desfaz todas as gravações e reutiliza escopo aninhado", async () => {
    const f = await fixture();
    await expect(
      sessionContext.run({ auth: f.auth }, () =>
        f.unit.run(f.auth, async (r) => {
          await r.acessos.updatePersona(f.acesso.id, "temporary", null);
          await f.facade.acessos.updateDialeto(f.acesso.id, "mssql");
          throw new Error("synthetic rollback");
        }),
      ),
    ).rejects.toThrow("synthetic rollback");
    expect((await f.accesses.findById(f.acesso.id))?.nomePersona).toBeNull();
    expect((await f.accesses.findById(f.acesso.id))?.dialeto).toBe("postgres");
  });
  it("revogação anterior impede gravação pela fachada", async () => {
    const f = await fixture();
    await f.oauth.revokeGrant(f.auth.grantId);
    await expect(
      sessionContext.run({ auth: f.auth }, () =>
        f.facade.acessos.updatePersona(f.acesso.id, "forbidden", null),
      ),
    ).rejects.toMatchObject({ stage: "oauth" });
    expect((await f.accesses.findById(f.acesso.id))?.nomePersona).toBeNull();
  });
  it("revogação aguarda transação autorizada e bloqueia a seguinte", async () => {
    const f = await fixture();
    let entered!: () => void, release!: () => void;
    const inside = new Promise<void>((r) => {
        entered = r;
      }),
      barrier = new Promise<void>((r) => {
        release = r;
      });
    const mutation = f.unit.run(f.auth, async (r) => {
      entered();
      await barrier;
      await r.acessos.updatePersona(f.acesso.id, "committed", null);
    });
    await inside;
    const revocation = f.oauth.revokeGrant(f.auth.grantId);
    release();
    await mutation;
    await revocation;
    expect((await f.accesses.findById(f.acesso.id))?.nomePersona).toBe("committed");
    await expect(f.unit.run(f.auth, async () => undefined)).rejects.toMatchObject({
      stage: "oauth",
    });
  });
  it("expiração antes do commit desfaz a alteração", async () => {
    const f = await fixture();
    let now = Date.now();
    const unit = new MemoryAuthorizedUnitOfWork(f.repositories, f.store, f.policy, () => now);
    await expect(
      unit.run(f.auth, async (r) => {
        await r.acessos.updatePersona(f.acesso.id, "expired", null);
        now = f.auth.expiresAt;
      }),
    ).rejects.toMatchObject({ stage: "oauth" });
    expect((await f.accesses.findById(f.acesso.id))?.nomePersona).toBeNull();
  });
  it("rejeita novos locks de acesso dentro de um escopo já autorizado", async () => {
    const f = await fixture();
    await expect(
      f.unit.run(f.auth, () => f.unit.run(f.auth, async () => undefined, ["another-access"])),
    ).rejects.toThrow("declarados antes");
  });
  it("não permite rede do hub dentro da transação", async () => {
    const f = await fixture();
    await expect(
      f.unit.run(f.auth, async () => {
        assertOutsideAuthorizedTransaction();
      }),
    ).rejects.toThrow("hub dentro");
  });
});
