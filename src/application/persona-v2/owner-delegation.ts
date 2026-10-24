import type { PersonaServices } from "../../domain/ports/persona-v2.port.js";
import type {
  OwnerDelegationHubPort,
  OwnerDelegation,
} from "../../domain/ports/persona-security.port.js";
import type { AdministrativePermission, ConsumerIdentity } from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { assertConsumer } from "../../domain/persona-v2/authorization.js";
import type { PersonaAdministration } from "./administration.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { delegatedPermissionsSchema } from "../../domain/persona-v2/administrative-permissions.js";
export interface DelegationStatus {
  administrative: readonly AdministrativePermission[];
  version: number;
  active: boolean;
  expiresAt: string | null;
}

/** Remote calls never hold an MCP transaction; this proof grants no local permission. */
export class PersonaOwnerDelegation {
  constructor(
    private readonly s: PersonaServices,
    private readonly admin: PersonaAdministration,
    private readonly hub: OwnerDelegationHubPort,
    readonly audience: string,
  ) {}
  async status(sessionId: string, personaId: string): Promise<DelegationStatus> {
    const session = await this.admin.validateSession(sessionId);
    return this.s.repository.transaction({ personaIds: [personaId], tokenIds: [] }, async (tx) => {
      const p = await tx.findPersona(personaId);
      if (p?.ownerId !== session.owner.id) this.denied();
      const d = await tx.security.delegation(personaId);
      return {
        administrative: d?.administrative ?? [],
        version: d?.version ?? 0,
        active: !!d && !d.revokedAt && d.expiresAt > this.s.now(),
        expiresAt: d?.expiresAt.toISOString() ?? null,
      };
    });
  }
  async create(
    sessionId: string,
    personaId: string,
    expectedVersion: number,
    administrative: readonly AdministrativePermission[] = ["gerenciar_fontes"],
  ): Promise<DelegationStatus> {
    const selected = delegatedPermissionsSchema.parse(administrative).sort();
    const session = await this.admin.validateSession(sessionId);
    const before = await this.status(sessionId, personaId);
    if (before.version !== expectedVersion)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Delegação mudou.");
    // Revoke old authority first, so renewal never creates an overlap.
    const old = await this.s.repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      (tx) => tx.security.delegation(personaId),
    );
    if (old && !old.revokedAt) await this.hub.revoke(session.accessToken, old.hubId);
    const remote = await this.hub.create(session.accessToken, {
      audience: this.audience,
      personaId,
      administrative: selected,
    });
    try {
      if (
        canonicalJson([...remote.administrative].sort()) !== canonicalJson(selected) ||
        remote.clientId !== session.owner.hubClientId ||
        remote.personaId !== personaId ||
        remote.audience !== this.audience ||
        Date.parse(remote.expiresAt) <= this.s.now().getTime() ||
        !/^pdv2_[A-Za-z0-9_-]{43}$/.test(remote.credential)
      )
        this.denied();
      await this.admin.validateSession(sessionId);
      await this.s.repository.transaction({ personaIds: [personaId], tokenIds: [] }, async (tx) => {
        const persona = await tx.findPersona(personaId);
        if (
          !persona?.active ||
          persona.ownerId !== session.owner.id ||
          session.expiresAt <= this.s.now()
        )
          this.denied();
        await tx.setAdministrativeActor(session.owner.id);
        await tx.security.saveDelegation(
          {
            personaId,
            administrative: selected,
            ownerId: session.owner.id,
            hubId: remote.id,
            credentialEnc: this.s.crypto.encrypt(remote.credential),
            expiresAt: new Date(remote.expiresAt),
            revokedAt: null,
            version: expectedVersion + 1,
          },
          expectedVersion,
        );
      });
    } catch (error) {
      // A failed compensation leaves only an unbound remote credential until expiry, never local authority.
      try {
        await this.hub.revoke(session.accessToken, remote.id);
      } catch {
        throw new PersonaV2Error(
          "CAPABILITY_UNAVAILABLE",
          "Gravação não concluída. Delegação externa sem vínculo local; revogue no hub ou aguarde sua expiração.",
        );
      }
      throw error;
    }
    return this.status(sessionId, personaId);
  }
  async revoke(
    sessionId: string,
    personaId: string,
    expectedVersion: number,
  ): Promise<DelegationStatus> {
    const session = await this.admin.validateSession(sessionId);
    await this.status(sessionId, personaId);
    const old = await this.s.repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      async (tx) => {
        const persona = await tx.findPersona(personaId);
        if (
          !persona?.active ||
          persona.ownerId !== session.owner.id ||
          session.expiresAt <= this.s.now()
        )
          this.denied();
        const d = await tx.security.delegation(personaId);
        if (d?.version !== expectedVersion)
          throw new PersonaV2Error("OPERATION_CONFLICT", "Delegação mudou.");
        await tx.setAdministrativeActor(session.owner.id);
        await tx.security.saveDelegation(
          { ...d, version: d.version + 1, revokedAt: this.s.now() },
          d.version,
        );
        return d;
      },
    );
    // Local revocation remains effective even when the hub is unavailable.
    await this.hub.revoke(session.accessToken, old.hubId);
    return this.status(sessionId, personaId);
  }
  async verify(identity: ConsumerIdentity): Promise<OwnerDelegation> {
    const local = await this.s.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [identity.tokenId] },
      async (tx) => {
        const state = await tx.authorization(identity);
        if (!state) this.denied();
        assertConsumer(identity, state, this.s.now());
        const d = await tx.security.delegation(identity.personaId);
        if (d?.ownerId !== state.persona.ownerId || d.revokedAt || d.expiresAt <= this.s.now())
          this.denied();
        return d;
      },
    );
    const proof = await this.hub.verify(this.s.crypto.decrypt(local.credentialEnc), {
      audience: this.audience,
      personaId: identity.personaId,
    });
    const owner = await this.s.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [] },
      async (tx) => {
        const p = await tx.findPersona(identity.personaId);
        const d = await tx.security.delegation(identity.personaId);
        if (
          !p?.active ||
          d?.version !== local.version ||
          d.revokedAt ||
          d.expiresAt <= this.s.now()
        )
          this.denied();
        return tx.owner(this.s.ownerAuth.hubOrigin, proof.clientId);
      },
    );
    if (
      canonicalJson([...proof.administrative].sort()) !==
        canonicalJson([...local.administrative].sort()) ||
      proof.id !== local.hubId ||
      proof.active !== true ||
      proof.personaId !== identity.personaId ||
      proof.audience !== this.audience ||
      owner.id !== local.ownerId ||
      Date.parse(proof.expiresAt) <= this.s.now().getTime()
    )
      this.denied();
    return {
      ...local,
      expiresAt: new Date(Math.min(local.expiresAt.getTime(), Date.parse(proof.expiresAt))),
    };
  }
  private denied(): never {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Delegação do responsável indisponível.");
  }
}
