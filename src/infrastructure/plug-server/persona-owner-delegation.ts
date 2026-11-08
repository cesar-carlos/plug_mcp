import { z } from "zod";
import type { OwnerDelegationHubPort } from "../../domain/ports/persona-security.port.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { AdministrativePermission } from "../../domain/persona-v2/model.js";
import { delegatedPermissionsSchema } from "../../domain/persona-v2/administrative-permissions.js";
import { DomainError } from "../../domain/errors/domain-error.js";
export const DELEGATION_RESPONSE_MAX_BYTES = 16384;
const unavailable = () =>
  new DomainError({
    code: "PLUG_SERVER_ERROR",
    message: "Não foi possível confirmar a autoridade de delegação.",
    source: "plug_server_http",
    stage: "delegation",
    retryable: false,
    hint: "Verifique disponibilidade e compatibilidade do hub. Não infira revogação, peça reconexão ou repita automaticamente.",
  });
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
    try {
      return await this.performRequest(token, method, path, body);
    } catch (error) {
      if (error instanceof PersonaV2Error || error instanceof DomainError) throw error;
      throw unavailable();
    }
  }
  private async performRequest(
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
    if (!res.ok) {
      await res.body?.cancel();
      if (res.status === 401 || res.status === 403)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Autoridade de delegação recusada.");
      throw unavailable();
    }
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
      if (bytes > DELEGATION_RESPONSE_MAX_BYTES) {
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
    const parsed = proof
      .extend({ credential: z.string().regex(/^pdv2_[A-Za-z0-9_-]{43}$/) })
      .safeParse(await this.request(jwt, "POST", "/api/v1/client-auth/persona-delegations", input));
    if (!parsed.success) throw unavailable();
    return parsed.data;
  }
  async verify(
    credential: string,
    input: { audience: string; personaId: string },
  ): ReturnType<OwnerDelegationHubPort["verify"]> {
    const parsed = proof
      .extend({ active: z.literal(true) })
      .safeParse(
        await this.request(
          credential,
          "POST",
          "/api/v1/client-auth/persona-delegations/verify",
          input,
        ),
      );
    if (!parsed.success) throw unavailable();
    return parsed.data;
  }
  async revoke(jwt: string, id: string): Promise<void> {
    z.uuid().parse(id);
    await this.request(jwt, "DELETE", `/api/v1/client-auth/persona-delegations/${id}`);
  }
}
