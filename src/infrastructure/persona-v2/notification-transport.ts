import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { PersonaNotificationTransport } from "../../domain/ports/persona-outbox.port.js";
import { PublicExternalHttp, publicExternalAddress } from "./external-http.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { OUTBOX_LIMITS } from "../../domain/persona-v2/notifications.js";

export function notificationUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PersonaV2Error("INVALID_PLAN", "Endereço de notificações inválido.");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "443")
  )
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Notificações exigem HTTPS público sem query ou credenciais.",
    );
  return url;
}
export class PersonaNotificationHttps implements PersonaNotificationTransport {
  constructor(
    private readonly http = new PublicExternalHttp(),
    private readonly resolve = (host: string) => lookup(host, { all: true, verbatim: true }),
  ) {}
  async validate(value: string): Promise<void> {
    const url = notificationUrl(value);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const addresses = await Promise.race([
        this.resolve(url.hostname),
        new Promise<never>((_r, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new PersonaV2Error("CAPABILITY_UNAVAILABLE", "DNS de notificações indisponível."),
              ),
            OUTBOX_LIMITS.timeoutMs,
          );
        }),
      ]);
      if (
        !addresses.length ||
        addresses.some((a) => ![4, 6].includes(a.family) || !publicExternalAddress(a.address))
      )
        throw new PersonaV2Error("INVALID_PLAN", "Destino público obrigatório.");
    } finally {
      clearTimeout(timer);
    }
  }
  async deliver(
    input: Parameters<PersonaNotificationTransport["deliver"]>[0],
    beforeDispatch: () => Promise<void>,
  ): Promise<void> {
    const url = notificationUrl(input.destination);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", input.secret)
      .update(`${input.id}.${timestamp}.${input.body}`)
      .digest("hex");
    await this.http.send(
      {
        url,
        method: "POST",
        body: input.body,
        signal: input.signal,
        maxBytes: OUTBOX_LIMITS.maxResponseBytes,
        headers: {
          "Content-Type": "application/json",
          "Accept-Encoding": "identity",
          "X-Se7e-Event-Id": input.id,
          "X-Se7e-Timestamp": timestamp,
          "X-Se7e-Signature-256": `sha256=${signature}`,
        },
      },
      beforeDispatch,
    );
  }
}
