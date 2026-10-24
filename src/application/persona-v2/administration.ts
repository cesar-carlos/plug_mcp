import type {
  PersonaServices,
  AdministrativeSession,
  PersonaTransaction,
} from "../../domain/ports/persona-v2.port.js";
import type { PersonaBrowserCommitGuard } from "../../domain/ports/persona-security.port.js";
import {
  PersonaV2Error,
  type Persona,
  type Permissions,
  type ManagedPersonaToken,
} from "../../domain/persona-v2/model.js";
import { permissionsContainedBy } from "../../domain/persona-v2/authorization.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import type { Dialeto } from "../../domain/entities/dialeto.js";
import type { Source } from "../../domain/persona-v2/model.js";
import { sourceRestrictionsSchema } from "../../domain/persona-v2/source-restrictions.js";
import { sourceReplacementSchema } from "./source-registration.js";

interface SourceRegistration {
  personaId: string;
  name: string;
  purpose: string;
  environment: string;
  agentId: string;
  database?: string;
  dialect: Exclude<Dialeto, "firebird">;
  email: string;
  password: string;
  clientToken: string;
  rowRestrictions?: readonly unknown[];
}

export class PersonaAdministration {
  constructor(private readonly services: PersonaServices) {}

  async login(email: string, password: string): Promise<{ sessionId: string; expiresAt: Date }> {
    const s = this.services;
    const { accessToken } = await s.ownerAuth.login(email, password);
    const profile = await s.ownerAuth.profile(accessToken);
    if (!profile.active) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Client responsável inativo.");
    }
    const owner = await s.repository.transaction({ personaIds: [], tokenIds: [] }, (tx) =>
      tx.owner(s.ownerAuth.hubOrigin, profile.clientId),
    );
    const expiresAt = new Date(s.now().getTime() + 15 * 60 * 1000);
    const sessionId = s.sessions.create({ owner, accessToken, expiresAt });
    return { sessionId, expiresAt };
  }

  async validateSession(sessionId: string): Promise<AdministrativeSession> {
    const s = this.services;
    const session = s.sessions.find(sessionId, s.now());
    if (!session) {
      throw new PersonaV2Error("ADMIN_SESSION_EXPIRED", "Sessão administrativa expirada.");
    }
    const profile = await s.ownerAuth.profile(session.accessToken);
    if (
      !profile.active ||
      profile.clientId !== session.owner.hubClientId ||
      s.ownerAuth.hubOrigin !== session.owner.hubOrigin ||
      session.expiresAt <= s.now()
    ) {
      s.sessions.remove(sessionId);
      throw new PersonaV2Error("ADMIN_SESSION_EXPIRED", "Identidade administrativa revogada.");
    }
    return session;
  }

  async createPersona(
    sessionId: string,
    input: { name: string; specialty: string; instructions: string },
  ): Promise<Persona> {
    const s = this.services;
    const session = await this.validateSession(sessionId);
    if (
      !input.name.trim() ||
      input.name.length > 200 ||
      !input.specialty.trim() ||
      input.specialty.length > 5000 ||
      input.instructions.length > 20000 ||
      pareceSegredoEmTexto(`${input.name}\n${input.specialty}\n${input.instructions}`)
    ) {
      throw new PersonaV2Error("INVALID_PLAN", "Dados da persona inválidos ou contêm segredos.");
    }
    const persona: Persona = {
      id: s.crypto.randomId(),
      ownerId: session.owner.id,
      name: input.name.trim(),
      specialty: input.specialty.trim(),
      instructions: input.instructions,
      active: true,
      authorizationVersion: 1,
    };
    await s.repository.transaction({ personaIds: [], tokenIds: [] }, async (tx) => {
      await tx.setAdministrativeActor(session.owner.id);
      await tx.createPersona(persona);
      this.assertSessionTime(session);
    });
    return persona;
  }

  async listPersonas(sessionId: string): Promise<readonly Persona[]> {
    const session = await this.validateSession(sessionId);
    return this.services.repository.transaction({ personaIds: [], tokenIds: [] }, (tx) =>
      tx.listPersonas(session.owner.id),
    );
  }

  async addSource(
    sessionId: string,
    input: SourceRegistration,
    guard?: PersonaBrowserCommitGuard,
  ): Promise<Source> {
    return this.createSource(sessionId, input, guard);
  }

  async replaceSource(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): Promise<Source> {
    const input = sourceReplacementSchema.parse(raw);
    return this.createSource(sessionId, { ...input.source, personaId }, undefined, {
      sourceId,
      expectedVersion: input.expectedVersion,
    });
  }

  private async createSource(
    sessionId: string,
    input: SourceRegistration,
    guard?: PersonaBrowserCommitGuard,
    replacement?: { sourceId: string; expectedVersion: number },
  ): Promise<Source> {
    const s = this.services;
    const session = await this.validateSession(sessionId);
    if (!s.sourceVerifier) {
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Verificador de fontes indisponível.");
    }
    const rowRestrictions = sourceRestrictionsSchema.parse(input.rowRestrictions ?? []);
    // Check ownership before sending credentials anywhere; repeat under lock after network.
    await s.repository.transaction({ personaIds: [input.personaId], tokenIds: [] }, async (tx) => {
      const persona = await tx.findPersona(input.personaId);
      if (!persona?.active || persona.ownerId !== session.owner.id) {
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Persona indisponível para este responsável.",
        );
      }
      if (pareceSegredoEmTexto(`${input.name}\n${input.purpose}\n${input.environment}`)) {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Metadados de fonte contêm segredo; utilize os campos de credencial.",
        );
      }
      if (replacement) await this.replacementSource(tx, input.personaId, replacement);
    });
    const verified = await s.sourceVerifier.verify(input);
    await this.validateSession(sessionId);
    await guard?.beforeWrite();
    return s.repository.transaction({ personaIds: [input.personaId], tokenIds: [] }, async (tx) => {
      await tx.setAdministrativeActor(session.owner.id);
      const persona = await tx.findPersona(input.personaId);
      if (!persona?.active || persona.ownerId !== session.owner.id) {
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Persona indisponível para este responsável.",
        );
      }
      const previous = replacement
        ? await this.replacementSource(tx, input.personaId, replacement)
        : undefined;
      const physicalSourceId = await tx.physicalSource(
        s.crypto.sha256Hex(
          JSON.stringify([new URL(s.ownerAuth.hubOrigin).origin, verified.identityHash]),
        ),
      );
      await guard?.commit(tx);
      const source: Source = {
        id: s.crypto.randomId(),
        personaId: persona.id,
        physicalSourceId,
        name: input.name,
        purpose: input.purpose,
        environment: input.environment,
        agentId: input.agentId,
        database: verified.database,
        dialect: verified.dialect,
        identityHash: verified.identityHash,
        identityVerifiedAt: verified.verifiedAt,
        credentialId: s.crypto.randomId(),
        credentialVersion: 1,
        rowRestrictions,
        authorizationVersion: 1,
        active: true,
        replacedBySourceId: null,
      };
      await tx.addSource(source, {
        emailEnc: s.crypto.encrypt(input.email),
        passwordEnc: s.crypto.encrypt(input.password),
        clientTokenEnc: s.crypto.encrypt(input.clientToken),
      });
      if (previous && replacement)
        await tx.replaceSource(previous, source.id, replacement.expectedVersion);
      await guard?.finish(tx);
      this.assertSessionTime(session);
      return source;
    });
  }

  private async replacementSource(
    tx: PersonaTransaction,
    personaId: string,
    input: { sourceId: string; expectedVersion: number },
  ): Promise<Source> {
    const source = (await tx.listSources(personaId)).find((s) => s.id === input.sourceId);
    if (!source)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Vínculo indisponível para substituição.");
    if (source.authorizationVersion !== input.expectedVersion)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Fonte mudou; revise a substituição.");
    if (source.replacedBySourceId)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Vínculo indisponível para substituição.");
    return source;
  }

  async listSources(sessionId: string, personaId: string): Promise<readonly Source[]> {
    const session = await this.validateSession(sessionId);
    return this.services.repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      async (tx) => {
        const persona = await tx.findPersona(personaId);
        if (!persona?.active || persona.ownerId !== session.owner.id) {
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Persona indisponível para este responsável.",
          );
        }
        return tx.listSources(personaId);
      },
    );
  }

  async issueToken(
    sessionId: string,
    input: {
      personaId: string;
      name: string;
      permissions: Permissions;
      delegation: Permissions;
      expiresAt: Date | null;
    },
  ): Promise<{ tokenId: string; bearer: string }> {
    const s = this.services;
    const session = await this.validateSession(sessionId);
    if (
      !input.name.trim() ||
      input.name.length > 200 ||
      pareceSegredoEmTexto(input.name) ||
      (input.expiresAt !== null && input.expiresAt <= s.now()) ||
      !permissionsContainedBy(input.delegation, input.permissions)
    ) {
      throw new PersonaV2Error("INVALID_PLAN", "Concessão ou prazo inválidos.");
    }
    const bearer = s.crypto.randomToken(32);
    const tokenId = s.crypto.randomId();
    await s.repository.transaction({ personaIds: [input.personaId], tokenIds: [] }, async (tx) => {
      await tx.setAdministrativeActor(session.owner.id);
      const persona = await tx.findPersona(input.personaId);
      if (!persona?.active || persona.ownerId !== session.owner.id) {
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Persona indisponível para este responsável.",
        );
      }
      await tx.issueToken(
        {
          id: tokenId,
          personaId: persona.id,
          tokenHash: s.crypto.sha256Hex(bearer),
          expiresAt: input.expiresAt,
          revokedAt: null,
          authorizationVersion: 1,
          permissions: input.permissions,
          delegation: input.delegation,
        },
        input.name,
      );
      this.assertSessionTime(session);
    });
    return { tokenId, bearer };
  }

  private assertSessionTime(session: AdministrativeSession): void {
    if (session.expiresAt <= this.services.now()) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Sessão expirou antes da gravação.");
    }
  }

  async listTokens(sessionId: string, personaId: string): Promise<readonly ManagedPersonaToken[]> {
    const session = await this.validateSession(sessionId);
    return this.services.repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      async (tx) => {
        const persona = await tx.findPersona(personaId);
        if (persona?.ownerId !== session.owner.id)
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Persona indisponível para este responsável.",
          );
        const tokens = await tx.listTokens(personaId);
        this.assertSessionTime(session);
        return tokens;
      },
    );
  }

  async changeToken(
    sessionId: string,
    input: {
      personaId: string;
      tokenId: string;
      expectedVersion: number;
      name: string;
      expiresAt: Date | null;
      permissions: Permissions;
      delegation: Permissions;
    },
    rotate = false,
  ): Promise<{ tokenId: string; bearer?: string }> {
    const s = this.services,
      session = await this.validateSession(sessionId);
    if (
      !input.name.trim() ||
      input.name.length > 200 ||
      pareceSegredoEmTexto(input.name) ||
      (input.expiresAt !== null &&
        (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= s.now())) ||
      !permissionsContainedBy(input.delegation, input.permissions)
    ) {
      throw new PersonaV2Error("INVALID_PLAN", "Concessão ou prazo inválidos.");
    }
    const bearer = rotate ? s.crypto.randomToken(32) : undefined;
    await s.repository.transaction(
      { personaIds: [input.personaId], tokenIds: [input.tokenId] },
      async (tx) => {
        await tx.setAdministrativeActor(session.owner.id);
        const persona = await tx.findPersona(input.personaId);
        if (!persona?.active || persona.ownerId !== session.owner.id)
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Persona indisponível para este responsável.",
          );
        const token = (await tx.listTokens(input.personaId)).find((t) => t.id === input.tokenId);
        if (!token || token.revokedAt || token.authorizationVersion !== input.expectedVersion)
          throw new PersonaV2Error(
            "OPERATION_CONFLICT",
            "Token mudou ou foi revogado. Recarregue antes de editar.",
          );
        await tx.changeToken(
          {
            ...token,
            name: input.name.trim(),
            expiresAt: input.expiresAt,
            permissions: input.permissions,
            delegation: input.delegation,
          },
          input.expectedVersion,
          bearer ? s.crypto.sha256Hex(bearer) : undefined,
        );
        this.assertSessionTime(session);
      },
      () => {
        this.assertSessionTime(session);
        return Promise.resolve();
      },
    );
    return { tokenId: input.tokenId, ...(bearer ? { bearer } : {}) };
  }

  async revokeToken(sessionId: string, personaId: string, tokenId: string): Promise<void> {
    const s = this.services;
    const session = await this.validateSession(sessionId);
    await s.repository.transaction({ personaIds: [personaId], tokenIds: [tokenId] }, async (tx) => {
      await tx.setAdministrativeActor(session.owner.id);
      const persona = await tx.findPersona(personaId);
      if (!persona?.active || persona.ownerId !== session.owner.id) {
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Persona indisponível para este responsável.",
        );
      }
      await tx.revokeToken(personaId, tokenId, s.now());
      this.assertSessionTime(session);
    });
  }

  logout(sessionId: string): void {
    this.services.sessions.remove(sessionId);
  }
}
