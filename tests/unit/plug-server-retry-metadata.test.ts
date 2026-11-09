import { afterEach, expect, it, vi } from "vitest";
import {
  extractRpcError,
  mapPlugServerAbort,
  mapPlugServerFailure,
  parseRetryAfterMs,
} from "../../src/infrastructure/plug-server/map-plug-error.js";

afterEach(() => vi.restoreAllMocks());
const now = Date.parse("2026-11-08T12:00:00Z");

it.each([429, 503])("HTTP %s não fabrica prazo ausente ou inválido", (status) => {
  for (const retryAfterMs of [undefined, null, NaN, Infinity, -1, 0.5]) {
    const error = mapPlugServerFailure({ status, body: {}, retryAfterMs });
    expect(error.retryAfterMs).toBeNull();
    expect(error.hint).toContain("não repita automaticamente");
  }
});

it.each([429, 503])(
  "HTTP %s preserva prazo RPC quando o header não fornece prazo válido",
  (status) => {
    const body = { error: { data: { retry_after_ms: 1700 } } };
    expect(mapPlugServerFailure({ status, body, retryAfterMs: NaN }).retryAfterMs).toBe(1700);
    expect(mapPlugServerFailure({ status, body, retryAfterMs: 0 }).retryAfterMs).toBe(0);
    expect(mapPlugServerFailure({ status, body, retryAfterMs: 2500 }).retryAfterMs).toBe(2500);
  },
);

it.each(["-1", "1.5", "1e3", "0x10", "Infinity", " ", "999999999999999999999", "invalid"])(
  "ignora Retry-After inválido %s e usa reset válido",
  (header) => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(parseRetryAfterMs(header, null)).toBeNull();
    expect(parseRetryAfterMs(header, String(now / 1000 + 2))).toBe(2000);
  },
);

it("preserva segundos, datas HTTP, zero e reset em segundos/milissegundos", () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  expect(parseRetryAfterMs(" 2 ", null)).toBe(2000);
  expect(parseRetryAfterMs("0", String(now + 3000))).toBe(0);
  expect(parseRetryAfterMs("Sun, 08 Nov 2026 12:00:03 GMT", null)).toBe(3000);
  expect(parseRetryAfterMs("Sun, 08 Nov 2026 11:59:00 GMT", null)).toBe(0);
  expect(parseRetryAfterMs(null, String(now + 4000))).toBe(4000);
  expect(parseRetryAfterMs(null, "999999999999999999999")).toBeNull();
});

it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1000"])(
  "ignora prazo RPC inválido %s sem perder código do erro",
  (retry_after_ms) => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const body = { error: { code: -32013, data: { retry_after_ms, reset_at: "invalid" } } };
    expect(extractRpcError(body).retryAfterMs).toBeUndefined();
    const mapped = mapPlugServerFailure({ status: 200, body, retryAfterMs: NaN });
    expect(mapped.code).toBe("RATE_LIMITED");
    expect(mapped.retryAfterMs).toBeNull();
    body.error.data.reset_at = "2026-11-08T12:00:02Z";
    expect(extractRpcError(body).retryAfterMs).toBe(2000);
  },
);

it("timeout não inventa prazo nem orienta repetição ou cancelamento confirmado", () => {
  const error = mapPlugServerAbort("sql.execute");
  expect(error.retryable).toBe(false);
  expect(error.retryAfterMs).toBeNull();
  expect(error.hint).toContain("não comprova cancelamento");
  expect(error.hint).not.toContain("Tente de novo");
});

it.each(["1", "2026-02-30T12:00:00Z", "2026-11-08T12:00:00", "yesterday"])(
  "reset_at exige instante ISO válido com timezone: %s",
  (reset_at) => {
    expect(
      extractRpcError({ error: { code: -32013, data: { reset_at } } }).retryAfterMs,
    ).toBeUndefined();
  },
);
