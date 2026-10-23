import { expect, it } from "vitest";
import { testConfig } from "../../../src/config/env.js";
const clients = {
  "https://client.fixture.test/client.json": ["https://client.fixture.test/callback"],
};
it("OAuth v2 exige HTTPS e allowlist independente do legado", () => {
  expect(() =>
    testConfig({ PERSONA_V2_OAUTH_ENABLED: true, CHATGPT_OAUTH_CLIENTS: clients }),
  ).toThrow();
  expect(() =>
    testConfig({
      PERSONA_V2_OAUTH_ENABLED: true,
      PUBLIC_BASE_URL: "https://persona.fixture.test",
      PERSONA_V2_OAUTH_CLIENTS: {},
    }),
  ).toThrow("allowlist própria");
  const config = testConfig({
    PERSONA_V2_OAUTH_ENABLED: true,
    PUBLIC_BASE_URL: "https://persona.fixture.test",
    PERSONA_V2_OAUTH_CLIENTS: clients,
    CHATGPT_OAUTH_ENABLED: false,
  });
  expect(config.CHATGPT_OAUTH_ENABLED).toBe(false);
  expect(config.PERSONA_V2_OAUTH_CLIENTS).toEqual(clients);
});
it("OAuth v2 recusa redirects não HTTPS e issuer com path/query", () => {
  expect(() =>
    testConfig({
      PERSONA_V2_OAUTH_CLIENTS: {
        "https://client.fixture.test/client.json": ["http://client.fixture.test/callback"],
      },
    }),
  ).toThrow();
  expect(() =>
    testConfig({
      PERSONA_V2_OAUTH_ENABLED: true,
      PUBLIC_BASE_URL: "https://persona.fixture.test/path",
      PERSONA_V2_OAUTH_CLIENTS: clients,
    }),
  ).toThrow("canônica");
});
