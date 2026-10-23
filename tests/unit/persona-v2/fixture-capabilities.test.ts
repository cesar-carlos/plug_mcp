import { afterEach, expect, it, vi } from "vitest";
import { readFixtureCapabilities } from "../../helpers/persona-chain-capabilities.js";

afterEach(() => vi.unstubAllGlobals());

it("diagnóstico recusa autoridade externa antes de enviar credenciais", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const url of [
    "https://example.test",
    "http://127.0.0.1",
    "http://127.0.0.1:1234/path",
    "http://user:password@127.0.0.1:1234",
  ]) {
    await expect(readFixtureCapabilities(url, "agent", "fixture-secret")).rejects.toThrow(
      "loopback",
    );
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it("diagnóstico conserva somente metadados e recusa redirects", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          agent: {
            isHubConnected: true,
            sourceIdentity: 1,
            sourceSchema: 1,
            sourceConstraints: 1,
            sqlOperations: { version: 1 },
            password: "fixture-secret",
            rows: ["private"],
          },
        },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await readFixtureCapabilities("http://127.0.0.1:1234", "agent", "fixture-secret");
  expect(result).toMatchObject({
    status: 200,
    connected: true,
    sourceIdentity: 1,
    sourceSchema: 1,
    sourceConstraints: 1,
    sqlOperations: 1,
    transportError: false,
  });
  expect(JSON.stringify(result)).not.toMatch(/fixture-secret|private|password/);
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ redirect: "error" });
});

it("falha técnica continua distinta de capability ausente", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private credential")));
  const result = await readFixtureCapabilities("http://127.0.0.1:1234", "agent", "fixture-secret");
  expect(result).toMatchObject({
    status: null,
    connected: null,
    sourceIdentity: null,
    transportError: true,
  });
  expect(JSON.stringify(result)).not.toContain("private");
});
