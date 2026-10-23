import { z } from "zod";
import { parseIntegrationSetup } from "../../domain/persona-v2/integration-credential.js";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { PersonaSetup } from "../../domain/ports/persona-security.port.js";
import {
  PersonaV2Error,
  type ConsumerIdentity,
  type AdministrativePermission,
} from "../../domain/persona-v2/model.js";
import { assertAdministrativePermission } from "../../domain/persona-v2/authorization.js";
import type { PersonaOwnerDelegation } from "./owner-delegation.js";
import type { PersonaAdministration } from "./administration.js";
import type { PersonaMaintenance } from "./maintenance.js";
import {
  tokenIssuanceSchema,
  assertTokenIssuance,
} from "../../domain/persona-v2/token-issuance.js";
export const setupSourceSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(5000),
  environment: z.string().trim().min(1).max(100),
  agentId: z.uuid(),
  dialect: z.enum(["postgres", "mssql", "sybase"]),
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
  clientToken: z.string().min(1).max(8192),
});
export class PersonaTemporarySetups {
  constructor(
    private readonly s: PersonaServices,
    private readonly delegation: PersonaOwnerDelegation,
    private readonly admin: PersonaAdministration,
    private readonly maintenance: PersonaMaintenance,
    private readonly origin: string,
  ) {}
  async startIntegration(
    identity: ConsumerIdentity,
    target?: { id: string; version: number },
  ): Promise<{
    url: string;
    expiresAt: string;
    purpose: PersonaSetup["purpose"];
    requiresOwnerLogin: true;
    oneTime: true;
  }> {
    if (!this.origin.startsWith("https:"))
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Setup exige HTTPS.");
    const proof = await this.delegation.verify(identity);
    const code = this.s.crypto.randomToken(32),
      csrf = this.s.crypto.randomToken(32);
    const value: PersonaSetup = {
      hash: this.s.crypto.sha256Hex(code),
      csrfHash: this.s.crypto.sha256Hex(csrf),
      identity,
      delegationVersion: proof.version,
      purpose: target ? "integration_rotate" : "integration_create",
      expiresAt: new Date(
        Math.min(this.s.now().getTime() + 900000, identity.grant?.expiresAt ?? Infinity),
      ),
      consumedAt: null,
    };
    await this.s.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [identity.tokenId] },
      async (tx) => {
        await this.authorize(tx, value);
        if (target) {
          const integration = await tx.security.integration(identity.personaId, target.id);
          if (integration?.version !== target.version)
            throw new PersonaV2Error(
              "AUTHORIZATION_DENIED",
              "Integração indisponível ou alterada.",
            );
          value.integration = integration;
        }
        await tx.security.createSetup(value);
      },
    );
    return {
      url: `${this.origin}/app/setup/${code}#${csrf}`,
      expiresAt: value.expiresAt.toISOString(),
      purpose: value.purpose,
      requiresOwnerLogin: true,
      oneTime: true,
    };
  }
  async visible(
    identity: ConsumerIdentity,
    permission: AdministrativePermission = "gerenciar_fontes",
  ): Promise<boolean> {
    try {
      const state = await this.s.repository.authorization(identity);
      if (!state) return false;
      assertAdministrativePermission(identity, state, permission, this.s.now());
      const proof = await this.delegation.verify(identity);
      if (!proof.administrative.includes(permission)) return false;
      return true;
    } catch {
      return false;
    }
  }
  async start(
    identity: ConsumerIdentity,
    source?: { id: string; version: number },
    rotateOwnToken = false,
    rawIssuance?: unknown,
  ): Promise<{
    url: string;
    expiresAt: string;
    purpose: PersonaSetup["purpose"];
    requiresOwnerLogin: true;
    oneTime: true;
  }> {
    if (!this.origin.startsWith("https:"))
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Setup exige HTTPS.");
    const proof = await this.delegation.verify(identity);
    const issuance = rawIssuance === undefined ? undefined : tokenIssuanceSchema.parse(rawIssuance);
    const permission = rotateOwnToken || issuance ? "gerenciar_tokens" : "gerenciar_fontes";
    if ((rotateOwnToken && (source || issuance)) || (issuance && source))
      throw new PersonaV2Error("INVALID_PLAN", "Setup incompatível.");
    if (!proof.administrative.includes(permission))
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Permissão não delegada.");
    const code = this.s.crypto.randomToken(32),
      csrf = this.s.crypto.randomToken(32);
    const value: PersonaSetup = {
      hash: this.s.crypto.sha256Hex(code),
      identity,
      delegationVersion: proof.version,
      purpose: issuance
        ? "token_issue"
        : rotateOwnToken
          ? "token_rotate"
          : source
            ? "source_rotate"
            : "source_create",
      ...(issuance ? { issuance } : {}),
      ...(source ? { sourceId: source.id, sourceVersion: source.version } : {}),
      csrfHash: this.s.crypto.sha256Hex(csrf),
      expiresAt: new Date(
        Math.min(this.s.now().getTime() + 900000, identity.grant?.expiresAt ?? Infinity),
      ),
      consumedAt: null,
    };
    await this.s.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [identity.tokenId] },
      async (tx) => {
        await this.authorize(tx, value);
        if (
          source &&
          !(await tx.listSources(identity.personaId)).some(
            (s) => s.id === source.id && s.active && s.authorizationVersion === source.version,
          )
        )
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível ou alterada.");
        await tx.security.createSetup(value);
      },
    );
    // CSRF is sent through the URL fragment, never in the HTTP request URL or tool arguments.
    return {
      url: `${this.origin}/app/setup/${code}#${csrf}`,
      expiresAt: value.expiresAt.toISOString(),
      purpose: value.purpose,
      requiresOwnerLogin: true,
      oneTime: true,
    };
  }
  private async authorize(tx: PersonaTransaction, value: PersonaSetup) {
    const state = await tx.authorization(value.identity);
    if (!state) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Consumidor indisponível.");
    const permission =
      value.purpose === "integration_create" || value.purpose === "integration_rotate"
        ? "gerenciar_integracoes"
        : value.purpose === "token_rotate" || value.purpose === "token_issue"
          ? "gerenciar_tokens"
          : "gerenciar_fontes";
    assertAdministrativePermission(value.identity, state, permission, this.s.now());
    const d = await tx.security.delegation(value.identity.personaId);
    if (
      !d ||
      !d.administrative.includes(permission) ||
      d.revokedAt ||
      d.expiresAt <= this.s.now() ||
      d.version !== value.delegationVersion
    )
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Delegação mudou ou expirou.");
    if (value.purpose === "token_issue") {
      assertTokenIssuance(
        tokenIssuanceSchema.parse(value.issuance),
        state,
        value.identity,
        d,
        this.s.now(),
      );
    }
  }
  async inspect(code: string): Promise<PersonaSetup> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(code))
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Setup inválido.");
    const hash = this.s.crypto.sha256Hex(code);
    return this.s.repository.transaction({ personaIds: [], tokenIds: [] }, async (tx) => {
      const v = await tx.security.setup(hash);
      if (!v || v.consumedAt || v.expiresAt <= this.s.now())
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Setup expirou ou já foi usado.");
      return v;
    });
  }
  async complete(
    code: string,
    csrf: string,
    credentials: { email: string; password: string },
    raw: unknown,
  ): Promise<
    | { completed: true; sourceId: string; credentialsReturned: false }
    | { completed: true; tokenId: string; bearer: string; issued?: boolean }
    | { completed: true; integrationId: string; version: number; credentialsReturned: false }
  > {
    const v = await this.inspect(code);
    if (!/^[A-Za-z0-9_-]{43}$/.test(csrf) || this.s.crypto.sha256Hex(csrf) !== v.csrfHash)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "CSRF inválido.");
    const login = await this.admin.login(credentials.email, credentials.password);
    try {
      const session = await this.admin.validateSession(login.sessionId);
      const proof = await this.delegation.verify(v.identity);
      if (proof.ownerId !== session.owner.id || proof.version !== v.delegationVersion)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Responsável ou delegação divergente.");
      if (v.purpose === "integration_create" || v.purpose === "integration_rotate") {
        const input = parseIntegrationSetup(raw, v.purpose === "integration_create");
        const integrationId = v.integration?.id ?? this.s.crypto.randomId();
        const expectedVersion = v.integration?.version ?? 0;
        const registration = input.registration ?? v.integration;
        if (!registration) throw new PersonaV2Error("INVALID_PLAN", "Integração não informada.");
        const checkTime = () => {
          if (
            v.expiresAt <= this.s.now() ||
            session.expiresAt <= this.s.now() ||
            !this.s.sessions.find(login.sessionId, this.s.now())
          )
            throw new PersonaV2Error("AUTHORIZATION_DENIED", "Setup ou sessão expirou.");
        };
        await this.delegation.verify(v.identity);
        await this.admin.validateSession(login.sessionId);
        await this.s.repository.transaction(
          { personaIds: [v.identity.personaId], tokenIds: [v.identity.tokenId] },
          async (tx) => {
            await tx.setAdministrativeActor(session.owner.id);
            await this.authorize(tx, v);
            if ((await tx.findPersona(v.identity.personaId))?.ownerId !== session.owner.id)
              throw new PersonaV2Error("AUTHORIZATION_DENIED", "Responsável divergente.");
            checkTime();
            await tx.security.consumeSetup(v.hash, this.s.now());
            await tx.security.saveIntegration({
              personaId: v.identity.personaId,
              id: integrationId,
              expectedVersion,
              registration: {
                name: registration.name,
                kind: registration.kind,
                destination: registration.destination,
              },
              credential: input.credential,
            });
            await this.authorize(tx, v);
            checkTime();
          },
          () => {
            checkTime();
            return Promise.resolve();
          },
        );
        return {
          completed: true,
          integrationId,
          version: expectedVersion + 1,
          credentialsReturned: false,
        };
      }
      if (v.purpose === "token_rotate" || v.purpose === "token_issue") {
        const issued = v.purpose === "token_issue";
        z.strictObject({ confirmed: z.literal(issued ? "issue" : "rotate") }).parse(raw);
        // Revalidate remote authority before acquiring local locks. The original
        // identity intentionally becomes invalid in this transaction.
        await this.delegation.verify(v.identity);
        await this.admin.validateSession(login.sessionId);
        const bearer = this.s.crypto.randomToken(32);
        const tokenId = issued ? this.s.crypto.randomId() : v.identity.tokenId;
        const checkTime = () => {
          if (
            v.expiresAt <= this.s.now() ||
            session.expiresAt <= this.s.now() ||
            !this.s.sessions.find(login.sessionId, this.s.now())
          ) {
            throw new PersonaV2Error("AUTHORIZATION_DENIED", "Setup ou sessão expirou.");
          }
        };
        await this.s.repository.transaction(
          { personaIds: [v.identity.personaId], tokenIds: [v.identity.tokenId] },
          async (tx) => {
            await tx.setAdministrativeActor(session.owner.id);
            await this.authorize(tx, v);
            const persona = await tx.findPersona(v.identity.personaId);
            if (persona?.ownerId !== session.owner.id)
              throw new PersonaV2Error("AUTHORIZATION_DENIED", "Responsável divergente.");
            const token = (await tx.listTokens(v.identity.personaId)).find(
              (t) => t.id === v.identity.tokenId,
            );
            if (!token) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Token indisponível.");
            checkTime();
            await tx.security.consumeSetup(v.hash, this.s.now());
            // Preserve all grants, ceilings, name and expiry; revoke derived OAuth
            // through the same repository operation used by the console.
            if (issued) {
              const proposal = tokenIssuanceSchema.parse(v.issuance);
              await tx.issueToken(
                {
                  id: tokenId,
                  personaId: v.identity.personaId,
                  tokenHash: this.s.crypto.sha256Hex(bearer),
                  authorizationVersion: 1,
                  permissions: proposal.permissions,
                  delegation: proposal.delegation,
                  expiresAt: new Date(proposal.expiresAt),
                  revokedAt: null,
                },
                proposal.name,
              );
              await this.authorize(tx, v);
            } else {
              await tx.changeToken(token, v.identity.tokenVersion, this.s.crypto.sha256Hex(bearer));
            }
            checkTime();
          },
          () => {
            checkTime();
            return Promise.resolve();
          },
        );
        return { completed: true, tokenId, bearer, issued };
      }
      const guard = {
        beforeWrite: async () => {
          await this.delegation.verify(v.identity);
        },
        commit: async (tx: PersonaTransaction) => {
          await this.authorize(tx, v);
          if (v.expiresAt <= this.s.now())
            throw new PersonaV2Error("AUTHORIZATION_DENIED", "Setup expirou.");
          await tx.security.consumeSetup(v.hash, this.s.now());
        },
        finish: async (tx: PersonaTransaction) => {
          await this.authorize(tx, v);
          if (v.expiresAt <= this.s.now())
            throw new PersonaV2Error("AUTHORIZATION_DENIED", "Setup expirou antes da gravação.");
        },
      };
      const result =
        v.purpose === "source_create"
          ? await this.admin.addSource(
              login.sessionId,
              { personaId: v.identity.personaId, ...setupSourceSchema.parse(raw) },
              guard,
            )
          : await this.maintenance.rotateSourceCredential(
              login.sessionId,
              v.identity.personaId,
              v.sourceId!,
              {
                ...z
                  .strictObject({
                    email: z.email().max(320),
                    password: z.string().min(1).max(1024),
                    clientToken: z.string().min(1).max(8192),
                  })
                  .parse(raw),
                expectedVersion: v.sourceVersion,
              },
              guard,
            );
      return { completed: true, sourceId: result.id, credentialsReturned: false };
    } finally {
      this.admin.logout(login.sessionId);
    }
  }
}
