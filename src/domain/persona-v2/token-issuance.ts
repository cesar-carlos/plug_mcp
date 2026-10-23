import { z } from "zod";
import { permissionsSchema } from "./permissions-schema.js";
import { assertDelegation, permissionsContainedBy } from "./authorization.js";
import { PersonaV2Error, type AuthorizationSnapshot, type ConsumerIdentity } from "./model.js";
import type { OwnerDelegation } from "../ports/persona-security.port.js";
import { pareceSegredoEmTexto } from "../entities/parece-segredo.js";

export const tokenIssuanceSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  expiresAt: z.iso.datetime(),
  permissions: permissionsSchema,
  delegation: permissionsSchema,
});
export type TokenIssuance = z.infer<typeof tokenIssuanceSchema>;

export const assertTokenIssuance = (
  proposal: TokenIssuance,
  state: AuthorizationSnapshot,
  identity: ConsumerIdentity,
  ownerDelegation: OwnerDelegation,
  now: Date,
): void => {
  assertDelegation(proposal.permissions, proposal.delegation, state.token);
  const expiresAt = new Date(proposal.expiresAt).getTime();
  const ceiling = Math.min(
    ownerDelegation.expiresAt.getTime(),
    state.token.expiresAt?.getTime() ?? Infinity,
    state.grant?.expiresAt.getTime() ?? Infinity,
    identity.grant?.expiresAt ?? Infinity,
  );
  if (
    pareceSegredoEmTexto(proposal.name) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now.getTime() ||
    expiresAt > ceiling ||
    !proposal.permissions.administrative.every((p) => ownerDelegation.administrative.includes(p)) ||
    (state.grant &&
      (!permissionsContainedBy(proposal.permissions, state.grant.permissions) ||
        !permissionsContainedBy(proposal.delegation, state.grant.permissions)))
  ) {
    throw new PersonaV2Error(
      "AUTHORIZATION_DENIED",
      "Emissão excede concessões ou prazo vigentes.",
    );
  }
};
