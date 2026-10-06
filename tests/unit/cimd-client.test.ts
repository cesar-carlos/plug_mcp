import { describe, expect, it } from "vitest";
import {
  CimdClient,
  isPublicOAuthAddress,
  type CimdNetwork,
} from "../../src/infrastructure/oauth/cimd-client.js";
const id = "https://chatgpt.com/oauth/client.json",
  redirect = "https://chatgpt.com/connector_platform_oauth_redirect";
const document = {
  client_id: id,
  redirect_uris: [redirect],
  token_endpoint_auth_methods_supported: ["private_key_jwt", "none"],
  token_endpoint_auth_method: "private_key_jwt",
};
const network = (
  body: unknown = document,
  addresses = [{ address: "8.8.8.8", family: 4 }],
): CimdNetwork => ({ resolve: async () => addresses, read: async () => JSON.stringify(body) });
describe("CIMD e SSRF", () => {
  it("negocia none no plural apesar da preferência singular", async () => {
    await expect(
      new CimdClient({ [id]: [redirect] }, network()).validate(id, redirect),
    ).resolves.toBeUndefined();
  });
  it("aceita singular legado e exige interseção", async () => {
    const legacy = { client_id: id, redirect_uris: [redirect], token_endpoint_auth_method: "none" };
    await expect(
      new CimdClient({ [id]: [redirect] }, network(legacy)).validate(id, redirect),
    ).resolves.toBeUndefined();
    await expect(
      new CimdClient(
        { [id]: [redirect] },
        network({ ...document, token_endpoint_auth_methods_supported: ["private_key_jwt"] }),
      ).validate(id, redirect),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "198.18.0.1",
    "::",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "2001:db8::1",
    "not-an-ip",
  ])("bloqueia endereço %s", (address) => expect(isPublicOAuthAddress(address)).toBe(false));
  it("rejeita DNS misto e usa IP validado sem segunda resolução", async () => {
    await expect(
      new CimdClient(
        { [id]: [redirect] },
        network(document, [
          { address: "8.8.8.8", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ]),
      ).validate(id, redirect),
    ).rejects.toMatchObject({ code: "invalid_client" });
    let resolved = 0,
      connected = "";
    const io: CimdNetwork = {
      resolve: async () => {
        resolved++;
        return [{ address: resolved === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }];
      },
      read: async (_url, address) => {
        connected = address.address;
        return JSON.stringify(document);
      },
    };
    await new CimdClient({ [id]: [redirect] }, io).validate(id, redirect);
    expect(resolved).toBe(1);
    expect(connected).toBe("8.8.8.8");
  });
  it.each([
    { ...document, client_id: "https://other.test/client" },
    { ...document, redirect_uris: ["https://other.test/cb"] },
    { client_id: id },
    "invalid",
  ])("recusa metadata divergente", async (body) => {
    await expect(
      new CimdClient({ [id]: [redirect] }, network(body)).validate(id, redirect),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });
  it("bloqueia respostas grandes e não reutiliza cache vencido após falha", async () => {
    const io = network();
    let now = 0;
    const client = new CimdClient({ [id]: [redirect] }, io, () => now);
    await client.validate(id, redirect);
    io.read = async () => {
      throw new Error("redirect/network");
    };
    await client.validate(id, redirect);
    now = 300_001;
    await expect(client.validate(id, redirect)).rejects.toMatchObject({ code: "invalid_client" });
    io.read = async () => "x".repeat(65_537);
    await expect(
      new CimdClient({ [id]: [redirect] }, io).validate(id, redirect),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });
});
