import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { PersonaRepositoryPort } from "../../domain/ports/persona-v2.port.js";
import type {
  PersonaOAuthClient,
  PersonaOAuthRecord,
  PersonaOAuthStore,
  PersonaOAuthUnit,
} from "../../domain/ports/persona-oauth.port.js";
import { assertConsumer, permissionsContainedBy } from "../../domain/persona-v2/authorization.js";
import {
  PersonaV2Error,
  type AuthorizationSnapshot,
  type ConsumerIdentity,
  type Permissions,
  type AdministrativePermission,
} from "../../domain/persona-v2/model.js";
import { OAuthError } from "../../domain/errors/oauth-error.js";
import {
  queryLimits,
  operationLimits,
  queryLimitsSchema,
  operationLimitsSchema,
  type QueryLimits,
  type OperationLimits,
} from "../../domain/persona-v2/execution-limits.js";

export const PERSONA_OAUTH_SCOPE = "se7e:persona";
const MINUTE = 60_000;
const opaque = /^[A-Za-z0-9_-]{43}$/;
export interface PersonaOAuthPolicy {
  issuer: string;
  resource: string;
  clients: Readonly<Record<string, readonly string[]>>;
}
export interface PersonaOAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

/** Delegation of one persona token. It neither logs into the hub nor delegates human approval. */
export class PersonaOAuth {
  constructor(
    private readonly store: PersonaOAuthStore,
    private readonly repository: PersonaRepositoryPort,
    private readonly crypto: CryptoPort,
    private readonly client: PersonaOAuthClient,
    readonly policy: PersonaOAuthPolicy,
    private readonly challenge: (verifier: string) => string,
    private readonly now: () => number = Date.now,
    private readonly administrative?: (
      identity: ConsumerIdentity,
    ) => Promise<readonly AdministrativePermission[]>,
  ) {}

  private allowed(row: PersonaOAuthRecord): void {
    if (
      row.binding.resource !== this.policy.resource ||
      !this.policy.clients[row.binding.clientId]?.includes(row.binding.redirectUri)
    ) {
      throw new OAuthError("invalid_client");
    }
  }

  async begin(
    params: Record<string, string>,
  ): Promise<{ id: string; nonce: string; csrf: string; clientId: string }> {
    const binding = {
      clientId: params.client_id ?? "",
      redirectUri: params.redirect_uri ?? "",
      resource: params.resource ?? "",
      challenge: params.code_challenge ?? "",
    };
    if (!this.policy.clients[binding.clientId]?.includes(binding.redirectUri)) {
      throw new OAuthError("invalid_client");
    }
    if (params.response_type !== "code") {
      throw new OAuthError("unsupported_response_type");
    }
    if (params.scope !== PERSONA_OAUTH_SCOPE) {
      throw new OAuthError("invalid_scope");
    }
    if (binding.resource !== this.policy.resource) {
      throw new OAuthError("invalid_target");
    }
    if (params.code_challenge_method !== "S256" || !opaque.test(binding.challenge)) {
      throw new OAuthError("invalid_request");
    }
    // DNS/TLS and client metadata are checked outside the database transaction.
    await this.client.validate(binding.clientId, binding.redirectUri);
    const id = this.crypto.randomToken(32),
      nonce = this.crypto.randomToken(32),
      csrf = this.crypto.randomToken(32);
    const row: PersonaOAuthRecord = {
      hash: this.crypto.sha256Hex(id),
      kind: "transaction",
      binding,
      expiresAt: this.now() + 15 * MINUTE,
      nonceHash: this.crypto.sha256Hex(nonce),
      csrfHash: this.crypto.sha256Hex(csrf),
      ...(params.state !== undefined ? { state: params.state } : {}),
    };
    await this.store.transaction(undefined, (tx) => tx.put(row));
    return { id, nonce, csrf, clientId: binding.clientId };
  }

  private browser(
    row: PersonaOAuthRecord | null,
    nonce: string,
    csrf: string,
  ): asserts row is PersonaOAuthRecord {
    if (
      row?.kind !== "transaction" ||
      row.consumedAt !== undefined ||
      row.expiresAt <= this.now() ||
      !opaque.test(nonce) ||
      !opaque.test(csrf) ||
      row.nonceHash !== this.crypto.sha256Hex(nonce) ||
      row.csrfHash !== this.crypto.sha256Hex(csrf)
    ) {
      throw new OAuthError("invalid_request");
    }
    this.allowed(row);
  }

  private async state(
    tx: PersonaOAuthUnit,
    identity: ConsumerIdentity,
  ): Promise<AuthorizationSnapshot> {
    const state = await tx.authorization(identity);
    if (!state) {
      throw new OAuthError("invalid_grant");
    }
    try {
      assertConsumer(identity, state, new Date(this.now()));
    } catch (error) {
      if (error instanceof PersonaV2Error) {
        throw new OAuthError("invalid_grant");
      }
      throw error;
    }
    return state;
  }

  async authenticate(
    id: string,
    nonce: string,
    csrf: string,
    bearer: string,
  ): Promise<{
    csrf: string;
    persona: string;
    permissions: Permissions;
    identity: ConsumerIdentity;
    redirectUri: string;
  }> {
    const state = await this.repository.authentication(this.crypto.sha256Hex(bearer));
    if (!state) {
      throw new OAuthError("access_denied");
    }
    const identity: ConsumerIdentity = {
      personaId: state.persona.id,
      personaVersion: state.persona.authorizationVersion,
      tokenId: state.token.id,
      tokenVersion: state.token.authorizationVersion,
    };
    const nextCsrf = this.crypto.randomToken(32);
    const administrative =
      state.token.permissions.administrative.length > 0 && this.administrative
        ? await this.administrative(identity)
        : [];
    return this.store.transaction(identity, async (tx) => {
      const row = await tx.record(this.crypto.sha256Hex(id));
      this.browser(row, nonce, csrf);
      if (row.identity) {
        throw new OAuthError("invalid_request");
      }
      const current = await this.state(tx, identity);
      const permissions: Permissions = {
        ...current.token.permissions,
        ...(current.token.permissions.managedIntegrationIds
          ? {
              managedIntegrationIds: administrative.includes("gerenciar_integracoes")
                ? current.token.permissions.managedIntegrationIds
                : [],
            }
          : {}),
        administrative: current.token.permissions.administrative.filter((p) =>
          administrative.includes(p),
        ),
      };
      await tx.put({ ...row, identity, permissions, csrfHash: this.crypto.sha256Hex(nextCsrf) });
      await this.state(tx, identity);
      return {
        csrf: nextCsrf,
        persona: current.persona.name,
        permissions,
        identity,
        redirectUri: row.binding.redirectUri,
      };
    });
  }

  async consent(
    id: string,
    nonce: string,
    csrf: string,
    selected: {
      sources: readonly string[];
      skills: readonly string[];
      external: readonly string[];
      managedIntegrations?: readonly string[];
      administrative?: readonly AdministrativePermission[];
      queryLimits?: Partial<QueryLimits>;
      operationLimits?: Partial<OperationLimits>;
    } | null,
  ): Promise<string> {
    const existing = await this.store.record(this.crypto.sha256Hex(id));
    if (!existing?.identity) {
      throw new OAuthError("invalid_request");
    }
    if (selected?.administrative?.length) {
      if (!this.administrative) throw new OAuthError("access_denied");
      const allowed = await this.administrative(existing.identity);
      if (selected.administrative.some((p) => !allowed.includes(p)))
        throw new OAuthError("access_denied");
    }
    return this.store.transaction(existing.identity, async (tx) => {
      const row = await tx.record(existing.hash);
      this.browser(row, nonce, csrf);
      if (!row.identity || !row.permissions) {
        throw new OAuthError("invalid_request");
      }
      const state = await this.state(tx, row.identity);
      const redirect = new URL(row.binding.redirectUri);
      redirect.searchParams.set("iss", this.policy.issuer);
      if (row.state !== undefined) {
        redirect.searchParams.set("state", row.state);
      }
      if (selected) {
        if (
          selected.sources.some((id) => !row.permissions!.sourceIds.includes(id)) ||
          selected.skills.some((id) => !row.permissions!.skills.some((g) => g.skillId === id)) ||
          selected.external.some((id) => !row.permissions!.externalOperationIds.includes(id)) ||
          (selected.administrative ?? []).some((p) => !row.permissions!.administrative.includes(p))
        ) {
          throw new OAuthError("access_denied");
        }
        const permissions: Permissions = {
          ...row.permissions,
          ...(row.permissions.managedIntegrationIds
            ? {
                managedIntegrationIds: selected.administrative?.includes("gerenciar_integracoes")
                  ? row.permissions.managedIntegrationIds.filter((id) =>
                      selected.managedIntegrations?.includes(id),
                    )
                  : [],
              }
            : {}),
          ...(selected.queryLimits
            ? {
                queryLimits: queryLimits(
                  row.permissions.queryLimits ?? {},
                  queryLimitsSchema.parse(selected.queryLimits),
                ),
              }
            : {}),
          ...(selected.operationLimits
            ? {
                operationLimits: operationLimits(
                  row.permissions.operationLimits ?? {},
                  operationLimitsSchema.parse(selected.operationLimits),
                ),
              }
            : {}),
          sourceIds: row.permissions.sourceIds.filter((id) => selected.sources.includes(id)),
          skills: row.permissions.skills.filter((g) => selected.skills.includes(g.skillId)),
          externalOperationIds: row.permissions.externalOperationIds.filter((id) =>
            selected.external.includes(id),
          ),
          administrative: row.permissions.administrative.filter((p) =>
            (selected.administrative ?? []).includes(p),
          ),
        };
        if (!permissionsContainedBy(permissions, state.token.permissions)) {
          throw new OAuthError("access_denied");
        }
        const grantId = this.crypto.randomId();
        const expiresAt = Math.min(
          this.now() + 30 * 86_400_000,
          state.token.expiresAt?.getTime() ?? Infinity,
        );
        await tx.grant(
          {
            id: grantId,
            personaId: state.persona.id,
            tokenId: state.token.id,
            tokenVersion: state.token.authorizationVersion,
            permissions,
            expiresAt: new Date(expiresAt),
            revokedAt: null,
          },
          row.binding.clientId,
        );
        const code = this.crypto.randomToken(32);
        await tx.put({
          hash: this.crypto.sha256Hex(code),
          kind: "code",
          binding: row.binding,
          expiresAt: Math.min(this.now() + MINUTE, expiresAt),
          identity: { ...row.identity, grant: { id: grantId } },
        });
        redirect.searchParams.set("code", code);
      } else {
        redirect.searchParams.set("error", "access_denied");
      }
      await tx.put({ ...row, consumedAt: this.now() });
      await this.state(tx, row.identity);
      return redirect.href;
    });
  }

  private async tokens(tx: PersonaOAuthUnit, record: PersonaOAuthRecord) {
    const identity = record.identity!;
    const state = await this.state(tx, identity);
    const access = this.crypto.randomToken(32),
      refresh = this.crypto.randomToken(32);
    const expiresAt = Math.min(
      this.now() + 15 * MINUTE,
      state.grant!.expiresAt.getTime(),
      state.token.expiresAt?.getTime() ?? Infinity,
    );
    await tx.put({
      hash: this.crypto.sha256Hex(access),
      kind: "access_token",
      binding: record.binding,
      identity: { ...identity, grant: { id: identity.grant!.id, expiresAt } },
      expiresAt,
    });
    await tx.put({
      hash: this.crypto.sha256Hex(refresh),
      kind: "refresh_token",
      binding: record.binding,
      identity,
      expiresAt: state.grant!.expiresAt.getTime(),
    });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer" as const,
      expires_in: Math.max(0, Math.floor((expiresAt - this.now()) / 1000)),
      scope: PERSONA_OAUTH_SCOPE,
    };
  }

  async token(params: Record<string, string>): Promise<PersonaOAuthTokens> {
    const codeFlow = params.grant_type === "authorization_code";
    if (!codeFlow && params.grant_type !== "refresh_token") {
      throw new OAuthError("unsupported_grant_type");
    }
    const raw = codeFlow ? params.code : params.refresh_token;
    if (!raw || !opaque.test(raw)) {
      throw new OAuthError("invalid_grant");
    }
    const existing = await this.store.record(this.crypto.sha256Hex(raw));
    if (!existing?.identity?.grant || existing.kind !== (codeFlow ? "code" : "refresh_token")) {
      throw new OAuthError("invalid_grant");
    }
    this.allowed(existing);
    if (
      params.client_id !== existing.binding.clientId ||
      params.resource !== this.policy.resource ||
      (params.scope !== undefined && params.scope !== PERSONA_OAUTH_SCOPE) ||
      (codeFlow &&
        (params.redirect_uri !== existing.binding.redirectUri ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(params.code_verifier ?? "") ||
          this.challenge(params.code_verifier!) !== existing.binding.challenge))
    ) {
      throw new OAuthError("invalid_grant");
    }
    await this.client.validate(existing.binding.clientId, existing.binding.redirectUri);
    const result = await this.store.transaction(existing.identity, async (tx) => {
      const row = await tx.record(existing.hash);
      if (!row?.identity?.grant) {
        throw new OAuthError("invalid_grant");
      }
      if (row.consumedAt !== undefined) {
        // Commit family revocation before returning invalid_grant; wrong bindings never reach here.
        await tx.revoke(row.identity, new Date(this.now()));
        return null;
      }
      if (row.expiresAt <= this.now()) {
        throw new OAuthError("invalid_grant");
      }
      const tokens = await this.tokens(tx, row);
      await tx.put({ ...row, consumedAt: this.now() });
      await this.state(tx, row.identity);
      return tokens;
    });
    if (!result) {
      throw new OAuthError("invalid_grant");
    }
    return result;
  }

  async resolve(bearer: string): Promise<ConsumerIdentity> {
    const row = opaque.test(bearer) ? await this.store.record(this.crypto.sha256Hex(bearer)) : null;
    if (!row?.identity?.grant || row.kind !== "access_token" || row.expiresAt <= this.now()) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Conexão OAuth inválida ou expirada.", {
        authorizationReason:
          row?.kind === "access_token" && row.expiresAt <= this.now()
            ? "access_expired"
            : "identity_invalid",
      });
    }
    try {
      this.allowed(row);
    } catch {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cliente OAuth indisponível.");
    }
    const state = await this.repository.authorization(row.identity);
    if (!state) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Conexão OAuth indisponível.");
    }
    assertConsumer(row.identity, state, new Date(this.now()));
    return row.identity;
  }

  async revoke(identity: ConsumerIdentity): Promise<{
    status: "revoked";
    connectionId: string;
    revokedAt: string;
    terminal: true;
    otherConnectionsRevoked: false;
  }> {
    if (!identity.grant) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Conexão OAuth necessária.");
    }
    return this.store.transaction(identity, async (tx) => {
      await this.state(tx, identity);
      const revokedAt = new Date(this.now());
      await tx.revoke(identity, revokedAt);
      return {
        status: "revoked" as const,
        connectionId: identity.grant!.id,
        revokedAt: revokedAt.toISOString(),
        terminal: true as const,
        otherConnectionsRevoked: false as const,
      };
    });
  }

  async revokeToken(params: Record<string, string>): Promise<void> {
    const row = opaque.test(params.token ?? "")
      ? await this.store.record(this.crypto.sha256Hex(params.token!))
      : null;
    if (!row?.identity?.grant || !["access_token", "refresh_token"].includes(row.kind)) {
      return;
    }
    if (params.client_id !== row.binding.clientId) {
      throw new OAuthError("invalid_client");
    }
    this.allowed(row);
    await this.client.validate(row.binding.clientId, row.binding.redirectUri);
    await this.store.transaction(row.identity, (tx) =>
      tx.revoke(row.identity!, new Date(this.now())),
    );
  }
}
