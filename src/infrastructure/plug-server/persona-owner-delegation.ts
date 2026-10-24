import { z } from "zod";
import type { OwnerDelegationHubPort } from "../../domain/ports/persona-security.port.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { AdministrativePermission } from "../../domain/persona-v2/model.js";
import { delegatedPermissionsSchema } from "../../domain/persona-v2/administrative-permissions.js";
const proof = z.object({
  id: z.uuid(),
  clientId: z.string().min(1),
  audience: z.url(),
  personaId: z.uuid(),
  expiresAt: z.iso.datetime(),
  administrative: delegatedPermissionsSchema.default(["gerenciar_fontes"]),
});
export class PersonaOwnerDelegationHub implements OwnerDelegationHubPort {
  constructor(
    private readonly baseUrl: string,
    private readonly http: typeof fetch,
  ) {}
  private async request(
    token: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const res = await this.http(new URL(path, this.baseUrl), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Autoridade de delegação indisponível.");
    if (res.status === 204) return undefined;
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Empty delegation response");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk: unknown = next.value;
      if (!(chunk instanceof Uint8Array)) throw new Error("Invalid delegation response chunk");
      bytes += chunk.byteLength;
      if (bytes > 16384) {
        await reader.cancel();
        throw new Error("Delegation response too large");
      }
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const envelope = z
      .object({ success: z.literal(true), data: z.unknown() })
      .parse(JSON.parse(raw));
    return envelope.data;
  }
  async create(
    jwt: string,
    input: {
      audience: string;
      personaId: string;
      administrative: readonly AdministrativePermission[];
    },
  ): ReturnType<OwnerDelegationHubPort["create"]> {
    return proof
      .extend({ credential: z.string().regex(/^pdv2_[A-Za-z0-9_-]{43}$/) })
      .parse(await this.request(jwt, "POST", "/api/v1/client-auth/persona-delegations", input));
  }
  async verify(
    credential: string,
    input: { audience: string; personaId: string },
  ): ReturnType<OwnerDelegationHubPort["verify"]> {
    return proof
      .extend({ active: z.literal(true) })
      .parse(
        await this.request(
          credential,
          "POST",
          "/api/v1/client-auth/persona-delegations/verify",
          input,
        ),
      );
  }
  async revoke(jwt: string, id: string): Promise<void> {
    z.uuid().parse(id);
    await this.request(jwt, "DELETE", `/api/v1/client-auth/persona-delegations/${id}`);
  }
}
