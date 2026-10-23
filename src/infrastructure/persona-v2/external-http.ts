import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import type { ConnectionOptions } from "node:tls";
import ipaddr from "ipaddr.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
export interface ExternalHttpRequest {
  url: URL;
  method: string;
  headers: Readonly<Record<string, string>>;
  body?: string;
  signal: AbortSignal;
  maxBytes: number;
}
export interface ExternalHttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}
export interface ExternalNetwork {
  resolve(host: string): Promise<readonly { address: string; family: number }[]>;
  send(
    input: ExternalHttpRequest,
    address: { address: string; family: number },
  ): Promise<ExternalHttpResponse>;
}
const refused = () =>
  new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Destino ou resposta externa indisponível.");
export const publicExternalAddress = (address: string): boolean => {
  try {
    return !address.includes("%") && ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
};
/** Test CA is dependency injection only; there is no env option to bypass TLS. */
export const sendExternalHttps = (
  input: ExternalHttpRequest,
  address: { address: string; family: number },
  ca?: ConnectionOptions["ca"],
): Promise<ExternalHttpResponse> =>
  new Promise((resolve, reject) => {
    const pinned: LookupFunction = (_host, options, done) =>
      options.all ? done(null, [address]) : done(null, address.address, address.family);
    const req = request(
      input.url,
      {
        method: input.method,
        headers: input.headers,
        signal: input.signal,
        agent: false,
        rejectUnauthorized: true,
        servername: input.url.hostname,
        lookup: pinned,
        family: address.family,
        ...{ autoSelectFamily: false },
        ...(ca ? { ca } : {}),
      },
      (res) => {
        if (
          (res.statusCode ?? 500) >= 300 ||
          res.headers["content-encoding"] ||
          Number(res.headers["content-length"] ?? 0) > input.maxBytes
        ) {
          res.destroy();
          req.destroy();
          reject(refused());
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        res.on("data", (part: Buffer) => {
          size += part.length;
          if (size > input.maxBytes) {
            res.destroy(refused());
            req.destroy();
          } else parts.push(part);
        });
        res.on("error", reject);
        res.on("aborted", () => reject(refused()));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 500,
            headers: Object.fromEntries(
              Object.entries(res.headers).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string",
              ),
            ),
            body: Buffer.concat(parts).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", () => reject(refused()));
    req.end(input.body);
  });
export class PublicExternalHttp {
  constructor(
    private readonly network: ExternalNetwork = {
      resolve: (host) => lookup(host, { all: true, verbatim: true }),
      send: sendExternalHttps,
    },
  ) {}
  async send(
    input: ExternalHttpRequest,
    beforeDispatch: () => Promise<void>,
  ): Promise<ExternalHttpResponse> {
    const { url, signal } = input;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== "443")
    )
      throw refused();
    let stop: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      stop = () => reject(refused());
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
    });
    try {
      return await Promise.race([
        aborted,
        (async () => {
          const addresses = await this.network.resolve(url.hostname);
          if (
            signal.aborted ||
            !addresses.length ||
            addresses.some((a) => ![4, 6].includes(a.family) || !publicExternalAddress(a.address))
          )
            throw refused();
          await beforeDispatch();
          if (signal.aborted) throw refused();
          const result = await this.network.send(input, addresses[0]!);
          if (
            result.status < 200 ||
            result.status >= 300 ||
            result.headers["content-encoding"] ||
            Buffer.byteLength(result.body) > input.maxBytes
          )
            throw refused();
          return result;
        })(),
      ]);
    } finally {
      if (stop) signal.removeEventListener("abort", stop);
    }
  }
}
