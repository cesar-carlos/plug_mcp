import { lookup } from "node:dns/promises";
import net from "node:net";
import type { WebhookDestinationPort } from "../../domain/ports/webhook-destination.port.js";

const privateIpv4 = (address: string): boolean => {
  const parts = address.split(".").map(Number);
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  const c = parts[2] ?? -1;
  const d = parts[3] ?? -1;
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224 ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    d < 0
  );
};
const privateIp = (address: string): boolean => {
  const family = net.isIP(address);
  if (family === 4) return privateIpv4(address);
  if (family !== 6) return true;
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab][0-9a-f]:/.test(normalized) ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("2001:db8:")
  );
};

export class PublicHttpsWebhookDestination implements WebhookDestinationPort {
  async validate(value: string): Promise<URL> {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("webhook_url_invalid");
    }
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("webhook_url_invalid");
    await this.resolve(url);
    return url;
  }
  async resolve(url: URL): Promise<{ address: string; family: 4 | 6 }> {
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error("webhook_url_invalid");
    const family = net.isIP(url.hostname);
    const results = family
      ? [{ address: url.hostname, family }]
      : await lookup(url.hostname, { all: true, verbatim: true });
    const allowed = results.find((item) => !privateIp(item.address));
    if (!allowed) throw new Error("webhook_destino_bloqueado");
    return { address: allowed.address, family: allowed.family as 4 | 6 };
  }
}
