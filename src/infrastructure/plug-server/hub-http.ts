import { request as httpRequest, Agent as HttpAgent, type IncomingMessage } from "node:http";
import { request as httpsRequest, Agent as HttpsAgent } from "node:https";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { safeErrorDetails } from "../../domain/errors/safe-error-details.js";
import { queryTransportContext } from "../../application/persona-v2/query-transport-context.js";

export class HubTransportError extends Error {
  readonly errno?: string;
  constructor(
    readonly phase: "queue" | "connection" | "response",
    readonly reason: "capacity" | "timeout" | "network",
    nativeError?: unknown,
  ) {
    super("Hub transport unavailable.");
    this.name = reason === "timeout" ? "TimeoutError" : "HubTransportError";
    const code =
      nativeError && typeof nativeError === "object" && "code" in nativeError
        ? nativeError.code
        : undefined;
    const { errno } = safeErrorDetails({ errno: code });
    if (typeof errno === "string") this.errno = errno;
  }
}

const admissions = new WeakMap<HubHttpAgentPair, Map<string, Map<string, number>>>();

const admit = (agents: HubHttpAgentPair, url: URL): (() => void) => {
  let destinations = admissions.get(agents);
  if (!destinations) {
    destinations = new Map();
    admissions.set(agents, destinations);
  }
  let consumers = destinations.get(url.origin);
  if (!consumers) {
    consumers = new Map();
    destinations.set(url.origin, consumers);
  }
  const persona = queryTransportContext.getStore()?.personaId ?? "unscoped";
  const configured = (url.protocol === "https:" ? agents.https : agents.http).maxSockets;
  const sockets = Number.isFinite(configured) ? configured : HUB_HTTP_MAX_SOCKETS;
  const total = [...consumers.values()].reduce((sum, count) => sum + count, 0);
  const count = consumers.get(persona) ?? 0;
  const consumerLimit = persona === "unscoped" ? sockets * 2 : Math.max(1, Math.floor(sockets / 2));
  if (total >= sockets * 2 || count >= consumerLimit) {
    throw new HubTransportError("queue", "capacity");
  }
  consumers.set(persona, count + 1);
  return () => {
    const remaining = (consumers.get(persona) ?? 1) - 1;
    if (remaining) consumers.set(persona, remaining);
    else consumers.delete(persona);
    if (!consumers.size) destinations.delete(url.origin);
  };
};

const unzip = promisify(gunzip);
/** Transport ceiling, independent of the smaller per-consumer delivery limit. */
export const HUB_HTTP_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export class HubResponseError extends Error {
  constructor() {
    super("Invalid or oversized hub response.");
    this.name = "HubResponseError";
  }
}

/**
 * Defaults do bridge REST (`plug_server/docs/api/api_rest_bridge.md`):
 * `timeoutMs` default 30s, teto 360s; `options.timeout_ms` 1..300_000;
 * wait efetivo = max(body, timeout_ms + 5s).
 */
export const HUB_BRIDGE_TIMEOUT_MS_DEFAULT = 30_000;
export const HUB_BRIDGE_TIMEOUT_MS_CAP = 360_000;
export const AGENT_TIMEOUT_MS_LIMIT = 300_000;
export const HUB_AGENT_TIMEOUT_HEADROOM_MS = 5_000;
/** Download/parse JSON depois do hub responder (materialização REST). */
export const HTTP_RESPONSE_HEADROOM_MS = 5_000;
/**
 * Probe TCP keepalive (`keepAliveMsecs` do `http.Agent`). Não é idle de 30s:
 * o socket reusado fica até o peer fechar (Nginx `keepalive_timeout` no hub).
 * O undici do `fetch` global fecha idle em ~4s — menor que o intervalo entre
 * tools MCP, então cada `sql.execute` refazia TLS.
 */
export const HUB_HTTP_KEEPALIVE_MS = 30_000;
/** Pool de `sql.execute` — o valor atual do cliente REST. */
export const HUB_HTTP_MAX_SOCKETS = 16;
/** Pool de login/refresh/`getPolicy` (e demais REST JWT): menor, para SQL longo não esgotar o JWT. */
export const HUB_HTTP_AUTH_MAX_SOCKETS = 4;
const HUB_HTTP_MAX_FREE_SOCKETS = 8;
const HUB_HTTP_AUTH_MAX_FREE_SOCKETS = 2;

export interface HubHttpAgentPair {
  readonly http: HttpAgent;
  readonly https: HttpsAgent;
}

export interface HubHttpAgents {
  readonly sql: HubHttpAgentPair;
  readonly auth: HubHttpAgentPair;
}

/** Sem `Agent.timeout`: o corte é `AbortSignal` por request. JWT no Bearer, sem cookie jar. */
const createAgentPair = (maxSockets: number, maxFreeSockets: number): HubHttpAgentPair => ({
  http: new HttpAgent({
    keepAlive: true,
    keepAliveMsecs: HUB_HTTP_KEEPALIVE_MS,
    maxSockets,
    maxFreeSockets,
    scheduling: "lifo",
  }),
  https: new HttpsAgent({
    keepAlive: true,
    keepAliveMsecs: HUB_HTTP_KEEPALIVE_MS,
    maxSockets,
    maxFreeSockets,
    scheduling: "lifo",
  }),
});

export const createHubHttpAgents = (): HubHttpAgents => ({
  sql: createAgentPair(HUB_HTTP_MAX_SOCKETS, HUB_HTTP_MAX_FREE_SOCKETS),
  auth: createAgentPair(HUB_HTTP_AUTH_MAX_SOCKETS, HUB_HTTP_AUTH_MAX_FREE_SOCKETS),
});

const destroyAgentPair = (pair: HubHttpAgentPair): void => {
  pair.http.destroy();
  pair.https.destroy();
};

export const destroyHubHttpAgents = (agents: HubHttpAgents): void => {
  destroyAgentPair(agents.sql);
  destroyAgentPair(agents.auth);
};

export const clampAgentTimeoutMs = (timeoutMs: number | undefined): number | undefined => {
  if (timeoutMs == null) {
    return undefined;
  }
  return Math.min(Math.max(1, timeoutMs), AGENT_TIMEOUT_MS_LIMIT);
};

export const hubBridgeWaitMs = (agentTimeoutMs: number | undefined): number => {
  const body = agentTimeoutMs ?? HUB_BRIDGE_TIMEOUT_MS_DEFAULT;
  const fromAgent = agentTimeoutMs != null ? agentTimeoutMs + HUB_AGENT_TIMEOUT_HEADROOM_MS : 0;
  return Math.min(HUB_BRIDGE_TIMEOUT_MS_CAP, Math.max(body, fromAgent));
};

export const hubHttpAbortMs = (floorMs: number, bridgeWaitMs: number): number => {
  const cap = HUB_BRIDGE_TIMEOUT_MS_CAP + HTTP_RESPONSE_HEADROOM_MS;
  return Math.min(cap, Math.max(floorMs, bridgeWaitMs + HTTP_RESPONSE_HEADROOM_MS));
};

const requestUrl = (input: unknown): string => {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "url" in input &&
    typeof input.url === "string"
  ) {
    return input.url;
  }
  return String(input);
};

const headerLine = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const decodeBody = async (
  raw: Buffer,
  encoding: string | undefined,
  maxBytes: number,
): Promise<{ readonly body: Buffer; readonly gunzipped: boolean }> => {
  if (encoding == null || encoding.toLowerCase() === "identity") {
    return { body: raw, gunzipped: false };
  }
  const lower = encoding.toLowerCase();
  if (lower === "gzip" || lower === "x-gzip") {
    try {
      return { body: await unzip(raw, { maxOutputLength: maxBytes }), gunzipped: true };
    } catch {
      throw new HubResponseError();
    }
  }
  throw new HubResponseError();
};

const collectBody = (res: IncomingMessage, maxBytes: number, bodyless: boolean): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (chunk: Buffer | string) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += bytes.length;
      if (size > maxBytes) {
        res.destroy(new HubResponseError());
        return;
      }
      chunks.push(bytes);
    });
    res.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    res.on("error", reject);
    const declaredLength = Number(headerLine(res.headers["content-length"]));
    if (!bodyless && declaredLength > maxBytes) res.destroy(new HubResponseError());
  });

const toTimeoutError = (): DOMException =>
  new DOMException("The operation was aborted due to timeout.", "TimeoutError");

/**
 * `fetch` com `http(s).Agent` keep-alive. O `fetch` global do Node (undici)
 * não expõe o Agent empacotado; este cliente reusa TCP/TLS no hop MCP → hub.
 */
export const createPooledFetch = (
  agents: HubHttpAgentPair,
  maxBytes = HUB_HTTP_MAX_RESPONSE_BYTES,
): typeof fetch => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > HUB_HTTP_MAX_RESPONSE_BYTES) {
    throw new Error("Invalid hub response limit.");
  }
  const pooled = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = new URL(requestUrl(input));
    const isHttps = url.protocol === "https:";
    const method = (init?.method ?? "GET").toUpperCase();
    const signal = init?.signal ?? null;
    const headers = new Headers(init?.headers);
    if (!headers.has("accept-encoding")) {
      headers.set("accept-encoding", "gzip");
    }
    const headerRecord: Record<string, string> = {};
    headers.forEach((value, key) => {
      headerRecord[key] = value;
    });
    const body =
      typeof init?.body === "string"
        ? init.body
        : init?.body instanceof Uint8Array
          ? Buffer.from(init.body)
          : undefined;

    if (signal?.aborted) {
      throw new HubTransportError("queue", "timeout");
    }

    const release = admit(agents, url);
    return new Promise<Response>((resolve, reject) => {
      let phase: "queue" | "connection" | "response" = "queue";
      const requestFn = isHttps ? httpsRequest : httpRequest;
      const req = requestFn(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method,
          headers: headerRecord,
          agent: isHttps ? agents.https : agents.http,
        },
        (res) => {
          phase = "response";
          const bodyless = [204, 205, 304].includes(res.statusCode ?? 0) || method === "HEAD";
          void collectBody(res, maxBytes, bodyless)
            .then(async (raw) => {
              const encoding = headerLine(res.headers["content-encoding"]);
              const { body: decoded, gunzipped } = bodyless
                ? { body: raw, gunzipped: false }
                : await decodeBody(raw, encoding, maxBytes);
              if (signal?.aborted) throw toTimeoutError();
              const outHeaders = new Headers();
              for (const [key, value] of Object.entries(res.headers)) {
                const lower = key.toLowerCase();
                if (
                  value == null ||
                  lower === "content-encoding" ||
                  (gunzipped && lower === "content-length")
                ) {
                  continue;
                }
                if (Array.isArray(value)) {
                  for (const item of value) {
                    outHeaders.append(key, item);
                  }
                } else {
                  outHeaders.set(key, value);
                }
              }
              resolve(
                new Response(bodyless ? null : decoded, {
                  status: res.statusCode ?? 0,
                  statusText: res.statusMessage ?? "",
                  headers: outHeaders,
                }),
              );
            })
            .catch((error: unknown) =>
              reject(
                error instanceof HubResponseError || error instanceof HubTransportError
                  ? error
                  : new HubTransportError(
                      "response",
                      signal?.aborted ? "timeout" : "network",
                      error,
                    ),
              ),
            )
            .finally(() => {
              signal?.removeEventListener("abort", onAbort);
            });
        },
      );
      const onAbort = (): void => {
        const error = new HubTransportError(phase, "timeout");
        req.destroy(error);
        // Queued ClientRequests may emit error only after a socket becomes free.
        reject(error);
      };
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
      req.on("socket", () => {
        phase = "connection";
      });
      req.on("finish", () => {
        phase = "response";
      });
      req.on("error", (error: Error) => {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        if (signal?.aborted || error.name === "TimeoutError" || error.name === "AbortError") {
          reject(new HubTransportError(phase, "timeout"));
          return;
        }
        reject(
          error instanceof HubResponseError
            ? error
            : new HubTransportError(phase, "network", error),
        );
      });
      if (body !== undefined) {
        req.write(body);
      }
      req.end();
    }).finally(release);
  }) as typeof fetch;
  return pooled;
};
