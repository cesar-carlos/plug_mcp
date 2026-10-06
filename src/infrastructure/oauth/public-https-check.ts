import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isPublicOAuthAddress, pinnedOAuthLookup } from "./cimd-client.js";

/** GET limitado para discovery. Não segue redirects nem aceita redes privadas. */
export const readPublicOAuthEndpoint = async (
  url: URL,
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}> => {
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search)
    throw new Error("URL inválida.");
  const signal = AbortSignal.timeout(5000);
  const addresses = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    const abort = (): void => reject(new Error("Timeout DNS."));
    signal.addEventListener("abort", abort, { once: true });
    void lookup(url.hostname, { all: true, verbatim: true })
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener("abort", abort);
      });
  });
  if (!addresses.length || addresses.some((a) => !isPublicOAuthAddress(a.address)))
    throw new Error("DNS inválido.");
  const address = addresses[0]!;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        rejectUnauthorized: true,
        servername: url.hostname,
        family: address.family,
        ...{ autoSelectFamily: false },
        lookup: pinnedOAuthLookup(address),
        headers: { Accept: "application/json", "Accept-Encoding": "identity" },
      },
      (res) => {
        if (![200, 401].includes(res.statusCode ?? 0) || res.headers["content-encoding"]) {
          res.destroy();
          req.destroy();
          reject(new Error("Discovery inválido."));
          return;
        }
        let size = 0;
        const parts: Buffer[] = [];
        res.on("data", (part: Buffer) => {
          size += part.length;
          if (size > 65536) res.destroy(new Error("Resposta excessiva."));
          else parts.push(part);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body: JSON.parse(Buffer.concat(parts).toString("utf8")),
            });
          } catch {
            reject(new Error("JSON inválido."));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
};
