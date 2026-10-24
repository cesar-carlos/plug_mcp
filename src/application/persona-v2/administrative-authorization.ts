import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { OwnerDelegation } from "../../domain/ports/persona-security.port.js";
import type {
  AdministrativePermission,
  AuthorizationSnapshot,
  ConsumerIdentity,
} from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import {
  assertAdministrativePermission,
  assertConsumer,
} from "../../domain/persona-v2/authorization.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import type { PersonaAdministration } from "./administration.js";
import type { PersonaOwnerDelegation } from "./owner-delegation.js";

export type AdministrativeActor = string | ConsumerIdentity;
export interface AdministrativeContext {
  ownerId: string;
  binding: string | null;
  state?: AuthorizationSnapshot;
  expiresAt?: Date;
  delegatedPermissions?: readonly AdministrativePermission[];
}

/** Hub proof precedes locks. The same transaction authorizes and audits the local mutation. */
export class PersonaAdministrativeAuthorization {
  constructor(
    private readonly s: PersonaServices,
    private readonly admin: PersonaAdministration,
    private readonly delegation: PersonaOwnerDelegation,
  ) {}

  async available(identity: ConsumerIdentity): Promise<readonly AdministrativePermission[]> {
    try {
      const proof = await this.delegation.verify(identity);
      const state = await this.s.repository.authorization(identity);
      if (!state) return [];
      const layers = assertConsumer(identity, state, this.s.now());
      return proof.administrative.filter((p) => layers.every((l) => l.administrative.includes(p)));
    } catch {
      return [];
    }
  }

  async run<T>(
    actor: AdministrativeActor,
    personaId: string,
    permission: AdministrativePermission,
    action: (tx: PersonaTransaction, context: AdministrativeContext) => Promise<T>,
    tokenIds: readonly string[] = [],
  ): Promise<T> {
    if (typeof actor === "string") {
      const session = await this.admin.validateSession(actor);
      return this.s.repository.transaction({ personaIds: [personaId], tokenIds }, async (tx) => {
        const persona = await tx.findPersona(personaId);
        if (!persona?.active || persona.ownerId !== session.owner.id) this.denied();
        await tx.setAdministrativeActor(session.owner.id);
        const value = await action(tx, { ownerId: session.owner.id, binding: null });
        if (session.expiresAt <= this.s.now()) this.denied();
        return value;
      });
    }
    if (actor.personaId !== personaId) this.denied();
    const proof = await this.delegation.verify(actor);
    if (!proof.administrative.includes(permission)) this.denied();
    return this.s.repository.transaction(
      { personaIds: [personaId], tokenIds: [actor.tokenId, ...tokenIds] },
      async (tx) => {
        const state = await this.assert(tx, actor, proof, permission);
        await tx.setAdministrativeActor(proof.ownerId);
        await tx.setAdministrativeConsumer(actor);
        const binding = canonicalJson({ identity: actor, delegationVersion: proof.version });
        const result = await action(tx, {
          ownerId: proof.ownerId,
          binding,
          state,
          expiresAt: proof.expiresAt,
          delegatedPermissions: proof.administrative,
        });
        await this.assert(tx, actor, proof, permission);
        return result;
      },
    );
  }

  private async assert(
    tx: PersonaTransaction,
    identity: ConsumerIdentity,
    proof: OwnerDelegation,
    permission: AdministrativePermission,
  ): Promise<AuthorizationSnapshot> {
    const state = await tx.authorization(identity);
    if (!state) this.denied();
    assertAdministrativePermission(identity, state, permission, this.s.now());
    const current = await tx.security.delegation(identity.personaId);
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt <= this.s.now() ||
      proof.expiresAt <= this.s.now() ||
      current.version !== proof.version ||
      current.hubId !== proof.hubId ||
      current.ownerId !== state.persona.ownerId ||
      !current.administrative.includes(permission)
    )
      this.denied();
    return state;
  }
  private denied(): never {
    throw new PersonaV2Error(
      "AUTHORIZATION_DENIED",
      "Administração indisponível para este consumidor.",
    );
  }
}
