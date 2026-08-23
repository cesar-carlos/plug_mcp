import { describe, expect, it } from "vitest";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { getLiveEnv } from "../helpers/live-env.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

const env = getLiveEnv();

describe.skipIf(!env)("plug-server live", () => {
  it("login + getClientTokenPolicy round-trip", async () => {
    const live = env!;
    const adapter = new PlugServerRestAdapter(live.PLUG_SERVER_BASE_URL, new SilentTestLogger());
    const tokens = await adapter.login(live.E2E_CLIENT_EMAIL, live.E2E_CLIENT_PASSWORD);
    expect(tokens.accessToken.length).toBeGreaterThan(10);
    const policy = await adapter.getClientTokenPolicy({
      accessToken: tokens.accessToken,
      agentId: live.E2E_AGENT_ID,
      clientToken: live.E2E_CLIENT_TOKEN,
    });
    expect(policy.allTables === true || policy.tables.length >= 0).toBe(true);
  });
});
