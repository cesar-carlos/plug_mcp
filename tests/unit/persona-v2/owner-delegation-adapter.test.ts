import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PersonaOwnerDelegationHub } from "../../../src/infrastructure/plug-server/persona-owner-delegation.js";
describe("dedicated hub delegation adapter", () => {
  const binding = { audience: "https://mcp.fixture.test", personaId: randomUUID() },
    id = randomUUID();
  const proof = {
    ...binding,
    id,
    clientId: "owner-fixture",
    expiresAt: new Date(Date.now() + 100000).toISOString(),
  };
  it.each([401, 403, 429, 500, 502, 503])(
    "distingue recusa de indisponibilidade HTTP %s sem retry",
    async (status) => {
      const http = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("synthetic-secret", { status }));
      const hub = new PersonaOwnerDelegationHub("https://hub.fixture.test", http);
      const result = hub.verify("fixture", binding);
      await expect(result).rejects.toMatchObject({
        code: [401, 403].includes(status) ? "AUTHORIZATION_DENIED" : "PLUG_SERVER_ERROR",
      });
      await expect(result).rejects.not.toThrow("synthetic-secret");
      expect(http).toHaveBeenCalledTimes(1);
    },
  );
  it("sanitiza falha de rede e corpo JSON inválido sem inferir revogação", async () => {
    for (const http of [
      vi.fn<typeof fetch>().mockRejectedValue(new Error("synthetic-secret")),
      vi.fn<typeof fetch>().mockResolvedValue(new Response("synthetic-secret")),
    ]) {
      const result = new PersonaOwnerDelegationHub("https://hub.fixture.test", http).verify(
        "fixture",
        binding,
      );
      await expect(result).rejects.toMatchObject({
        code: "PLUG_SERVER_ERROR",
        source: "plug_server_http",
      });
      await expect(result).rejects.not.toThrow("synthetic-secret");
      expect(http).toHaveBeenCalledTimes(1);
    }
  });
  it("uses separate opaque verification credentials, no redirects and no retries", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ success: true, data: { ...proof, credential: "pdv2_" + "d".repeat(43) } }),
      )
      .mockResolvedValueOnce(Response.json({ success: true, data: { ...proof, active: true } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const hub = new PersonaOwnerDelegationHub("https://hub.fixture.test", http);
    const d = await hub.create("fixture-jwt", { ...binding, administrative: ["gerenciar_fontes"] });
    await hub.verify(d.credential, binding);
    await hub.revoke("fixture-jwt", id);
    expect(http.mock.calls.map((c) => new URL(c[0].toString()).pathname)).toEqual([
      "/api/v1/client-auth/persona-delegations",
      "/api/v1/client-auth/persona-delegations/verify",
      `/api/v1/client-auth/persona-delegations/${id}`,
    ]);
    expect(http.mock.calls[1]![1]).toMatchObject({
      redirect: "error",
      headers: { Authorization: `Bearer ${d.credential}` },
      body: JSON.stringify(binding),
    });
    expect(http).toHaveBeenCalledTimes(3);
  });
  it("does not reflect remote errors or accept oversized or malformed responses", async () => {
    for (const response of [
      new Response("remote-secret", { status: 401 }),
      new Response("x".repeat(16385)),
      Response.json({ success: true, data: { ...proof, active: false } }),
    ]) {
      const http = vi.fn<typeof fetch>().mockResolvedValue(response);
      const hub = new PersonaOwnerDelegationHub("https://hub.fixture.test", http);
      await expect(hub.verify("pdv2_" + "d".repeat(43), binding)).rejects.not.toThrow(
        "remote-secret",
      );
      expect(http).toHaveBeenCalledTimes(1);
    }
  });
});
