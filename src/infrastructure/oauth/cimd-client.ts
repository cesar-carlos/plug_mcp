import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import type { ConnectionOptions } from "node:tls";
import ipaddr from "ipaddr.js";
import { z } from "zod";
import type { OAuthClientPort } from "../../domain/ports/oauth.port.js";
import { OAuthError } from "../../domain/errors/oauth-error.js";

const documentSchema = z.object({
  client_id: z.string().url(),
  redirect_uris: z.array(z.string().url()).min(1),
  token_endpoint_auth_methods_supported: z.array(z.string()).min(1).optional(),
  token_endpoint_auth_method: z.string().optional(),
});
export const isPublicOAuthAddress = (address: string): boolean => {
  try {
    const parsed = ipaddr.parse(address);
    return (
      parsed.range() === "unicast" && !(parsed.kind() === "ipv6" && parsed.toString().includes("%"))
    );
  } catch {
    return false;
  }
};
export interface CimdNetwork {
  resolve(host: string): Promise<readonly { address: string; family: number }[]>;
  read(
    url: URL,
    address: { address: string; family: number },
    signal: AbortSignal,
  ): Promise<string>;
}
/** A resolução já foi validada; este callback nunca consulta DNS novamente. */
export const pinnedOAuthLookup =
  (address: { address: string; family: number }): LookupFunction =>
  (_host, options, done) => {
    if (options.all) done(null, [{ address: address.address, family: address.family }]);
    else done(null, address.address, address.family);
  };

/** CA é uma dependência do transporte para testes; não existe opção HTTP/env para desativar TLS. */
export const readCimdHttps = (
  url: URL,
  address: { address: string; family: number },
  signal: AbortSignal,
  ca?: ConnectionOptions["ca"],
): Promise<string> =>
  new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        signal,
        method: "GET",
        // Uma conexão nova impede reutilizar socket de uma resolução DNS anterior.
        agent: false,
        headers: { Accept: "application/json", "Accept-Encoding": "identity" },
        rejectUnauthorized: true,
        servername: url.hostname,
        family: address.family,
        ...{ autoSelectFamily: false },
        lookup: pinnedOAuthLookup(address),
        ...(ca ? { ca } : {}),
      },
      (response) => {
        if (
          response.statusCode !== 200 ||
          response.headers["content-encoding"] ||
          !response.headers["content-type"]?.includes("json")
        ) {
          response.destroy();
          req.destroy();
          reject(new OAuthError("invalid_client"));
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        response.on("data", (part: Buffer) => {
          size += part.length;
          if (size > 65_536) {
            response.destroy(new OAuthError("invalid_client"));
            req.destroy();
            return;
          }
          parts.push(part);
        });
        response.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
        response.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });

const network: CimdNetwork = {
  resolve: (host) => lookup(host, { all: true, verbatim: true }),
  read: readCimdHttps,
};

export class CimdClient implements OAuthClientPort {
  private readonly cache = new Map<
    string,
    { document: z.infer<typeof documentSchema>; expiresAt: number }
  >();
  constructor(
    private readonly allowed: Readonly<Record<string, readonly string[]>>,
    private readonly io: CimdNetwork = network,
    private readonly now: () => number = Date.now,
  ) {}
  async validate(clientId: string, redirectUri: string): Promise<void> {
    if (!this.allowed[clientId]?.includes(redirectUri)) throw new OAuthError("invalid_client");
    const url = new URL(clientId);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      clientId.length > 2048
    )
      throw new OAuthError("invalid_client");
    let cached = this.cache.get(clientId);
    if (!cached || cached.expiresAt <= this.now()) {
      this.cache.delete(clientId);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new OAuthError("invalid_client"));
        }, 5000);
        timer.unref();
      });
      try {
        const document = await Promise.race([
          timeout,
          (async () => {
            const addresses = await this.io.resolve(url.hostname);
            if (
              controller.signal.aborted ||
              !addresses.length ||
              addresses.some((item) => !isPublicOAuthAddress(item.address))
            )
              throw new OAuthError("invalid_client");
            const body = await this.io.read(url, addresses[0]!, controller.signal);
            if (Buffer.byteLength(body) > 65_536) throw new OAuthError("invalid_client");
            return documentSchema.parse(JSON.parse(body));
          })(),
        ]);
        cached = { document, expiresAt: this.now() + 300_000 };
        this.cache.set(clientId, cached);
      } catch {
        throw new OAuthError("invalid_client");
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    const doc = cached.document;
    const methods = doc.token_endpoint_auth_methods_supported ?? [
      doc.token_endpoint_auth_method ?? "none",
    ];
    if (
      doc.client_id !== clientId ||
      !doc.redirect_uris.includes(redirectUri) ||
      !methods.includes("none")
    )
      throw new OAuthError("invalid_client");
  }
}
