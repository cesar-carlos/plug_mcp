import { request as httpRequest, Agent as HttpAgent, type IncomingMessage } from "node:http";
import { request as httpsRequest, Agent as HttpsAgent } from "node:https";
import { gunzipSync } from "node:zlib";

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

const decodeBody = (
  raw: Buffer,
  encoding: string | undefined,
): { readonly body: Buffer; readonly gunzipped: boolean } => {
  if (raw.length === 0 || encoding == null || encoding === "identity") {
    return { body: raw, gunzipped: false };
  }
  const lower = encoding.toLowerCase();
  if (lower === "gzip" || lower === "x-gzip") {
    return { body: gunzipSync(raw), gunzipped: true };
  }
  return { body: raw, gunzipped: false };
};

const collectBody = (res: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    res.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    res.on("error", reject);
  });

const toTimeoutError = (): DOMException =>
  new DOMException("The operation was aborted due to timeout.", "TimeoutError");

/**
 * `fetch` com `http(s).Agent` keep-alive. O `fetch` global do Node (undici)
 * não expõe o Agent empacotado; este cliente reusa TCP/TLS no hop MCP → hub.
 */
export const createPooledFetch = (agents: HubHttpAgentPair): typeof fetch => {
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
      throw toTimeoutError();
    }

    return new Promise<Response>((resolve, reject) => {
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
          void collectBody(res)
            .then((raw) => {
              const encoding = headerLine(res.headers["content-encoding"]);
              const { body: decoded, gunzipped } = decodeBody(raw, encoding);
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
                new Response(decoded, {
                  status: res.statusCode ?? 0,
                  statusText: res.statusMessage ?? "",
                  headers: outHeaders,
                }),
              );
            })
            .catch(reject);
        },
      );
      const onAbort = (): void => {
        req.destroy(toTimeoutError());
      };
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
      req.on("error", (error: Error) => {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        if (signal?.aborted || error.name === "TimeoutError" || error.name === "AbortError") {
          reject(toTimeoutError());
          return;
        }
        reject(error);
      });
      req.on("close", () => {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      });
      if (body !== undefined) {
        req.write(body);
      }
      req.end();
    });
  }) as typeof fetch;
  return pooled;
};
