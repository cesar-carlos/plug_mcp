import { z } from "zod";
import type { PersonaServices } from "../../domain/ports/persona-v2.port.js";
import type {
  ConsumerIdentity,
  ManagedPersonaToken,
  Permissions,
} from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { assertDelegation, permissionsContainedBy } from "../../domain/persona-v2/authorization.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import { permissionsSchema } from "../../domain/persona-v2/permissions-schema.js";
import type {
  AdministrativeContext,
  PersonaAdministrativeAuthorization,
} from "./administrative-authorization.js";

export const delegatedTokenEditSchema = z.strictObject({
  tokenId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  expiresAt: z.iso.datetime().nullable(),
  permissions: permissionsSchema,
  delegation: permissionsSchema,
});
export const delegatedTokenReferenceSchema = delegatedTokenEditSchema.pick({
  tokenId: true,
  expectedVersion: true,
});

/** Non-secret token maintenance. Issuance and rotation remain browser-only. */
export class PersonaDelegatedTokens {
  constructor(
    private readonly s: PersonaServices,
    private readonly authorization: PersonaAdministrativeAuthorization,
  ) {}
  async list(identity: ConsumerIdentity): Promise<readonly ManagedPersonaToken[]> {
    return this.authorization.run(
      identity,
      identity.personaId,
      "gerenciar_tokens",
      async (tx, context) =>
        (await tx.listTokens(identity.personaId)).filter(
          (t) => t.id !== identity.tokenId && this.contained(t.permissions, t.delegation, context),
        ),
    );
  }
  async edit(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<{ tokenId: string; version: number }> {
    const input = delegatedTokenEditSchema.parse(raw);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (pareceSegredoEmTexto(input.name))
      throw new PersonaV2Error("INVALID_PLAN", "Nome inválido.");
    return this.authorization.run(
      identity,
      identity.personaId,
      "gerenciar_tokens",
      async (tx, context) => {
        const target = (await tx.listTokens(identity.personaId)).find(
          (t) => t.id === input.tokenId,
        );
        this.target(identity, target, input.expectedVersion, context);
        if (!this.contained(input.permissions, input.delegation, context)) this.denied();
        const ceiling = Math.min(
          context.expiresAt!.getTime(),
          context.state!.token.expiresAt?.getTime() ?? Infinity,
          context.state!.grant?.expiresAt.getTime() ?? Infinity,
          identity.grant?.expiresAt ?? Infinity,
        );
        if (!expiresAt || expiresAt <= this.s.now() || expiresAt.getTime() > ceiling) this.denied();
        await tx.changeToken(
          {
            ...target!,
            name: input.name,
            expiresAt,
            permissions: input.permissions,
            delegation: input.delegation,
          },
          input.expectedVersion,
        );
        return { tokenId: input.tokenId, version: input.expectedVersion + 1 };
      },
      [input.tokenId],
    );
  }
  async revoke(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<{ tokenId: string; revoked: true }> {
    const input = delegatedTokenReferenceSchema.parse(raw);
    return this.authorization.run(
      identity,
      identity.personaId,
      "gerenciar_tokens",
      async (tx, context) => {
        const target = (await tx.listTokens(identity.personaId)).find(
          (t) => t.id === input.tokenId,
        );
        this.target(identity, target, input.expectedVersion, context);
        await tx.revokeToken(identity.personaId, input.tokenId, this.s.now());
        return { tokenId: input.tokenId, revoked: true };
      },
      [input.tokenId],
    );
  }
  private contained(
    permissions: Permissions,
    delegation: Permissions,
    context: AdministrativeContext,
  ): boolean {
    const state = context.state!;
    try {
      if (!permissions.administrative.every((p) => context.delegatedPermissions?.includes(p)))
        return false;
      assertDelegation(permissions, delegation, state.token);
      return (
        !state.grant ||
        (permissionsContainedBy(permissions, state.grant.permissions) &&
          permissionsContainedBy(delegation, state.grant.permissions))
      );
    } catch {
      return false;
    }
  }
  private target(
    identity: ConsumerIdentity,
    token: ManagedPersonaToken | undefined,
    version: number,
    context: AdministrativeContext,
  ): void {
    if (
      !token ||
      token.id === identity.tokenId ||
      !this.contained(token.permissions, token.delegation, context)
    )
      this.denied();
    if (token.revokedAt || token.authorizationVersion !== version)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Token mudou; recarregue antes de alterar.");
  }
  private denied(): never {
    throw new PersonaV2Error(
      "AUTHORIZATION_DENIED",
      "Token excede os limites de administração delegada.",
    );
  }
}
