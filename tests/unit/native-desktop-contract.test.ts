import { describe, expect, it } from "vitest";
import { nativeDiscoverySchema } from "../../scripts/homologation/native-desktop-contract.js";

describe("compiled desktop discovery through the REST bridge", () => {
  it("accepts the real normalized single response instead of requiring a direct JSON-RPC result", () => {
    const response = {
      response: {
        type: "single",
        success: true,
        item: { success: true, result: { openrpc: "1.3.2" } },
      },
    };
    expect(nativeDiscoverySchema.parse(response).response.item.result.openrpc).toBe("1.3.2");
  });

  it("refuses normalized errors returned with HTTP 200", () => {
    const response = {
      response: {
        type: "single",
        success: false,
        item: { success: false, error: { code: -32000, message: "Agent unavailable" } },
      },
    };
    expect(nativeDiscoverySchema.safeParse(response).success).toBe(false);
  });

  it("refuses raw, batch and unnormalized discovery envelopes", () => {
    for (const response of [
      { response: { result: { openrpc: "1.3.2" } } },
      { response: { type: "raw", success: false, payload: {} } },
      { response: { type: "batch", success: true, items: [] } },
    ])
      expect(nativeDiscoverySchema.safeParse(response).success).toBe(false);
  });
});
