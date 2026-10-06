import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { ConsumerAuth } from "../../domain/entities/consumer-auth.js";
import type {
  ConsumerAuthorizationPort,
  OAuthBinding,
  OAuthClientPort,
  OAuthGrant,
  OAuthSource,
  OAuthStorePort,
  OAuthToken,
  OAuthTransaction,
  OAuthUnitOfWork,
} from "../../domain/ports/oauth.port.js";
import { OAuthError, oauthUnauthorized } from "../../domain/errors/oauth-error.js";
import { DomainError } from "../../domain/errors/domain-error.js";

export interface OAuthPolicy {
  readonly issuer: string;
  readonly resource: string;
  readonly accesses: readonly string[];
  readonly clients: Readonly<Record<string, readonly string[]>>;
}
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}
const DAY = 86_400_000;
const SCOPE = "se7e:access";

/** Delegação de um acesso existente; não autentica contas nem altera a policy SQL. */
export class ChatGptOAuth implements ConsumerAuthorizationPort {
  private readonly listeners = new Set<(grantId: string) => void>();
  constructor(
    readonly store: OAuthStorePort,
    private readonly crypto: CryptoPort,
    private readonly acessos: AcessoRepositoryPort,
    private readonly client: OAuthClientPort,
    readonly policy: OAuthPolicy,
    private readonly challenge: (verifier: string) => string,
    private readonly now: () => number = Date.now,
  ) {}

  onRevocation(listener: (grantId: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify(id: string): void {
    for (const listener of this.listeners) listener(id);
  }
  private allowed(clientId: string, redirectUri: string): boolean {
    return this.policy.clients[clientId]?.includes(redirectUri) === true;
  }
  private validSource(
    source: OAuthSource | null,
    hash: string,
    uid: string,
  ): source is OAuthSource {
    return (
      !!source &&
      source.usuarioId === uid &&
      source.tokenHash === hash &&
      source.statusAcesso !== "revoked" &&
      (!source.tokenExpiresAt || source.tokenExpiresAt.getTime() > this.now()) &&
      this.policy.accesses.includes(source.id)
    );
  }
  private checkGrant(
    grant: OAuthGrant | null,
    source: OAuthSource | null,
  ): asserts grant is OAuthGrant {
    if (
      !grant ||
      grant.revokedAt !== undefined ||
      grant.expiresAt <= this.now() ||
      grant.resource !== this.policy.resource ||
      grant.scope !== SCOPE ||
      !this.allowed(grant.clientId, grant.redirectUri) ||
      !this.validSource(source, grant.sourceHash, grant.usuarioId)
    ) {
      throw oauthUnauthorized();
    }
  }
  private identity(grant: OAuthGrant, token?: OAuthToken): ConsumerAuth {
    return {
      kind: "oauth",
      usuarioId: grant.usuarioId,
      acessoId: grant.acessoId,
      sourceHash: grant.sourceHash,
      grantId: grant.id,
      tokenHash: token?.id,
      expiresAt: token?.expiresAt ?? grant.expiresAt,
    };
  }
  async assertGrant(id: string): Promise<ConsumerAuth> {
    const grant = await this.store.get("grant", id);
    if (!grant) throw oauthUnauthorized();
    const source = await this.acessos.findById(grant.acessoId);
    try {
      this.checkGrant(grant, source);
    } catch (error) {
      if (error instanceof DomainError && error.stage === "oauth") await this.revokeGrant(id);
      throw error;
    }
    return this.identity(grant);
  }
  async assert(auth: ConsumerAuth): Promise<void> {
    if (auth.kind !== "oauth") return;
    const current = await this.assertGrant(auth.grantId);
    if (
      current.acessoId !== auth.acessoId ||
      current.usuarioId !== auth.usuarioId ||
      current.sourceHash !== auth.sourceHash ||
      auth.expiresAt <= this.now()
    )
      throw oauthUnauthorized();
    if (auth.tokenHash) {
      const token = await this.store.get("access", auth.tokenHash);
      if (token?.grantId !== auth.grantId || token.expiresAt <= this.now())
        throw oauthUnauthorized();
    }
  }
  async resolve(token: string): Promise<ConsumerAuth | null> {
    const row = await this.store.get("access", this.crypto.sha256Hex(token));
    if (!row || row.expiresAt <= this.now()) return null;
    try {
      const grant = await this.store.get("grant", row.grantId);
      const source = grant ? await this.acessos.findById(grant.acessoId) : null;
      this.checkGrant(grant, source);
      return this.identity(grant, row);
    } catch (error) {
      if (error instanceof DomainError && error.stage === "oauth") {
        await this.revokeGrant(row.grantId);
        return null;
      }
      throw error;
    }
  }
  async begin(
    params: Record<string, string>,
  ): Promise<{ transaction: OAuthTransaction; nonce: string; csrf: string }> {
    const binding: OAuthBinding = {
      clientId: params.client_id ?? "",
      redirectUri: params.redirect_uri ?? "",
      resource: params.resource ?? "",
      scope: params.scope ?? "",
      challenge: params.code_challenge ?? "",
    };
    if (!this.allowed(binding.clientId, binding.redirectUri))
      throw new OAuthError("invalid_client");
    if (params.response_type !== "code") throw new OAuthError("unsupported_response_type");
    if (binding.resource !== this.policy.resource) throw new OAuthError("invalid_target");
    if (binding.scope !== SCOPE) throw new OAuthError("invalid_scope");
    if (params.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(binding.challenge))
      throw new OAuthError("invalid_request");
    await this.client.validate(binding.clientId, binding.redirectUri);
    const nonce = this.crypto.randomToken(32),
      csrf = this.crypto.randomToken(32);
    const transaction: OAuthTransaction = {
      ...binding,
      id: this.crypto.randomToken(32),
      state: params.state,
      nonceHash: this.crypto.sha256Hex(nonce),
      csrfHash: this.crypto.sha256Hex(csrf),
      expiresAt: this.now() + 900_000,
      status: "pending",
    };
    await this.store.transaction(null, null, (tx) => tx.put("transaction", transaction));
    return { transaction, nonce, csrf };
  }
  private checkBrowser(
    row: OAuthTransaction | null,
    nonce: string,
    csrf: string,
    status: OAuthTransaction["status"],
  ): asserts row is OAuthTransaction {
    if (
      !row ||
      row.expiresAt <= this.now() ||
      row.status !== status ||
      row.nonceHash !== this.crypto.sha256Hex(nonce) ||
      row.csrfHash !== this.crypto.sha256Hex(csrf) ||
      !this.allowed(row.clientId, row.redirectUri)
    )
      throw new OAuthError("invalid_request");
  }
  async authenticate(
    id: string,
    nonce: string,
    csrf: string,
    token: string,
  ): Promise<{ transaction: OAuthTransaction; csrf: string; name: string }> {
    const source = await this.acessos.findByTokenHash(this.crypto.sha256Hex(token));
    if (!source || !this.validSource(source, source.tokenHash, source.usuarioId))
      throw new OAuthError("access_denied");
    const nextCsrf = this.crypto.randomToken(32);
    const row = await this.store.transaction(source.id, null, async (tx) => {
      const row = await tx.get("transaction", id);
      this.checkBrowser(row, nonce, csrf, "pending");
      if (!this.validSource(await tx.source(source.id), source.tokenHash, source.usuarioId))
        throw new OAuthError("access_denied");
      const updated: OAuthTransaction = {
        ...row,
        status: "authenticated",
        acessoId: source.id,
        usuarioId: source.usuarioId,
        sourceHash: source.tokenHash,
        csrfHash: this.crypto.sha256Hex(nextCsrf),
      };
      await tx.put("transaction", updated);
      return updated;
    });
    return { transaction: row, csrf: nextCsrf, name: source.nomePersona ?? source.nomeAmigavel };
  }
  async consent(id: string, nonce: string, csrf: string, confirmed: boolean): Promise<string> {
    const existing = await this.store.get("transaction", id);
    if (!existing) throw new OAuthError("invalid_request");
    return this.store.transaction(existing.acessoId ?? null, null, async (tx) => {
      const row = await tx.get("transaction", id);
      this.checkBrowser(row, nonce, csrf, "authenticated");
      if (
        !row.acessoId ||
        !row.usuarioId ||
        !row.sourceHash ||
        !this.validSource(await tx.source(row.acessoId), row.sourceHash, row.usuarioId)
      )
        throw new OAuthError("access_denied");
      const redirect = new URL(row.redirectUri);
      redirect.searchParams.set("iss", this.policy.issuer);
      if (row.state !== undefined) redirect.searchParams.set("state", row.state);
      if (confirmed) {
        const code = this.crypto.randomToken(32);
        await tx.put("code", {
          id: this.crypto.sha256Hex(code),
          clientId: row.clientId,
          redirectUri: row.redirectUri,
          resource: row.resource,
          scope: row.scope,
          challenge: row.challenge,
          acessoId: row.acessoId,
          usuarioId: row.usuarioId,
          sourceHash: row.sourceHash,
          expiresAt: this.now() + 60_000,
        });
        redirect.searchParams.set("code", code);
      } else redirect.searchParams.set("error", "access_denied");
      await tx.put("transaction", { ...row, status: "consumed", state: undefined });
      return redirect.toString();
    });
  }
  private async issue(
    tx: OAuthUnitOfWork,
    grant: OAuthGrant,
    oldRefresh?: OAuthToken,
  ): Promise<OAuthTokenResponse> {
    const access = this.crypto.randomToken(32),
      refresh = this.crypto.randomToken(32);
    const expiresAt = Math.min(this.now() + 900_000, grant.expiresAt);
    await tx.put("access", {
      id: this.crypto.sha256Hex(access),
      grantId: grant.id,
      acessoId: grant.acessoId,
      expiresAt,
    });
    const refreshHash = this.crypto.sha256Hex(refresh);
    await tx.put("refresh", {
      id: refreshHash,
      grantId: grant.id,
      acessoId: grant.acessoId,
      expiresAt: grant.expiresAt,
    });
    if (oldRefresh)
      await tx.put("refresh", {
        ...oldRefresh,
        consumedAt: this.now(),
        successorHash: refreshHash,
      });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: Math.max(0, Math.floor((expiresAt - this.now()) / 1000)),
      scope: grant.scope,
    };
  }
  async exchange(params: Record<string, string>): Promise<OAuthTokenResponse> {
    const existing = await this.store.get("code", this.crypto.sha256Hex(params.code ?? ""));
    if (!existing) throw new OAuthError("invalid_grant");
    const outcome = await this.store.transaction(
      existing.acessoId,
      existing.grantId ?? null,
      async (tx) => {
        const row = await tx.get("code", existing.id);
        const verifier = params.code_verifier ?? "";
        if (
          !row ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
          this.challenge(verifier) !== row.challenge ||
          params.client_id !== row.clientId ||
          params.redirect_uri !== row.redirectUri ||
          params.resource !== row.resource ||
          !this.allowed(row.clientId, row.redirectUri)
        )
          throw new OAuthError("invalid_grant");
        if (row.consumedAt !== undefined) {
          if (row.grantId) {
            const grant = await tx.get("grant", row.grantId);
            if (grant) await tx.put("grant", { ...grant, revokedAt: this.now() });
          }
          return { replay: row.grantId } as const;
        }
        const source = await tx.source(row.acessoId);
        if (row.expiresAt <= this.now() || !this.validSource(source, row.sourceHash, row.usuarioId))
          throw new OAuthError("invalid_grant");
        const grant: OAuthGrant = {
          id: this.crypto.randomId(),
          acessoId: row.acessoId,
          usuarioId: row.usuarioId,
          sourceHash: row.sourceHash,
          clientId: row.clientId,
          redirectUri: row.redirectUri,
          resource: row.resource,
          scope: row.scope,
          createdAt: this.now(),
          expiresAt: Math.min(this.now() + 30 * DAY, source.tokenExpiresAt?.getTime() ?? Infinity),
        };
        await tx.put("grant", grant);
        await tx.put("code", { ...row, consumedAt: this.now(), grantId: grant.id });
        return { tokens: await this.issue(tx, grant) } as const;
      },
    );
    if ("replay" in outcome) {
      if (outcome.replay) this.notify(outcome.replay);
      throw new OAuthError("invalid_grant");
    }
    return outcome.tokens;
  }
  async refresh(params: Record<string, string>): Promise<OAuthTokenResponse> {
    const existing = await this.store.get(
      "refresh",
      this.crypto.sha256Hex(params.refresh_token ?? ""),
    );
    if (!existing) throw new OAuthError("invalid_grant");
    const outcome = await this.store.transaction(
      existing.acessoId,
      existing.grantId,
      async (tx) => {
        const row = await tx.get("refresh", existing.id),
          grant = await tx.get("grant", existing.grantId);
        if (
          !row ||
          !grant ||
          params.client_id !== grant.clientId ||
          (params.resource !== undefined && params.resource !== grant.resource) ||
          (params.scope !== undefined && params.scope !== grant.scope)
        )
          throw new OAuthError("invalid_grant");
        try {
          this.checkGrant(grant, await tx.source(grant.acessoId));
        } catch (error) {
          if (!(error instanceof DomainError && error.stage === "oauth")) throw error;
          await tx.put("grant", { ...grant, revokedAt: this.now() });
          return { replay: true } as const;
        }
        if (row.consumedAt !== undefined) {
          await tx.put("grant", { ...grant, revokedAt: this.now() });
          return { replay: true } as const;
        }
        if (row.expiresAt <= this.now()) throw new OAuthError("invalid_grant");
        return { tokens: await this.issue(tx, grant, row) } as const;
      },
    );
    if ("replay" in outcome) {
      this.notify(existing.grantId);
      throw new OAuthError("invalid_grant");
    }
    return outcome.tokens;
  }
  async revokeGrant(id: string): Promise<void> {
    const existing = await this.store.get("grant", id);
    if (!existing) return;
    await this.store.transaction(existing.acessoId, id, async (tx) => {
      const row = await tx.get("grant", id);
      if (row) await tx.put("grant", { ...row, revokedAt: this.now() });
    });
    this.notify(id);
  }
  async revoke(token: string, clientId: string): Promise<void> {
    if (!Object.hasOwn(this.policy.clients, clientId)) throw new OAuthError("invalid_client");
    const hash = this.crypto.sha256Hex(token);
    const row = (await this.store.get("access", hash)) ?? (await this.store.get("refresh", hash));
    if (!row) return;
    const grant = await this.store.get("grant", row.grantId);
    if (grant?.clientId === clientId) await this.revokeGrant(grant.id);
  }
  /** Persistência impede que retirar/reinserir uma allowlist ressuscite concessões. */
  async reconcile(): Promise<void> {
    for (const grant of await this.store.list("grant")) {
      if (grant.revokedAt !== undefined) continue;
      const source = await this.acessos.findById(grant.acessoId);
      try {
        this.checkGrant(grant, source);
      } catch {
        await this.revokeGrant(grant.id);
      }
    }
    for (const kind of ["code", "transaction"] as const)
      for (const row of await this.store.list(kind)) {
        const source = row.acessoId ? await this.acessos.findById(row.acessoId) : null;
        const invalid =
          !this.allowed(row.clientId, row.redirectUri) ||
          (row.acessoId &&
            (!row.sourceHash ||
              !row.usuarioId ||
              !this.validSource(source, row.sourceHash, row.usuarioId)));
        if (invalid)
          await this.store.transaction(row.acessoId ?? null, null, async (tx) => {
            const current = await tx.get(kind, row.id);
            if (current) await tx.put(kind, { ...current, expiresAt: 0 });
          });
      }
  }
}
