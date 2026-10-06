import type {
  SetupOperationRepositoryPort,
  SetupPurpose,
} from "../../domain/ports/setup-operation.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { UsuarioRepositoryPort } from "../../domain/ports/usuario-repository.port.js";
import type {
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import {
  sessionContext,
  currentConsumerAuth,
  assertConsumerAuthorized,
} from "../session-context.js";
import type { ConsumerAuth } from "../../domain/entities/consumer-auth.js";
import type { ConsumerAuthorizationPort } from "../../domain/ports/oauth.port.js";
import { requireAcesso, requireUsuario } from "./shared/guards.js";

export interface SetupCompletion {
  readonly token?: string;
  readonly acessoId?: string;
}
export class SetupOperations {
  private readonly invalidationListeners = new Set<(acessoId: string) => void>();
  onInvalidation(listener: (acessoId: string) => void): () => void {
    this.invalidationListeners.add(listener);
    return () => {
      this.invalidationListeners.delete(listener);
    };
  }
  constructor(
    private readonly store: SetupOperationRepositoryPort,
    private readonly crypto: CryptoPort,
    private readonly acessos: AcessoRepositoryPort,
    private readonly usuarios: UsuarioRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly baseUrl: string,
    private readonly completeOperation: (
      purpose: SetupPurpose,
      usuarioId: string | undefined,
      form: Record<string, string>,
    ) => Promise<SetupCompletion>,
    private readonly invalidate: (acessoId: string) => Promise<void> = () => Promise.resolve(),
    private readonly authorization?: ConsumerAuthorizationPort,
  ) {}

  async begin(
    purpose: SetupPurpose,
    usuarioId?: string,
  ): Promise<{ success: true; setupUrl: string; expiresAt: string }> {
    const acesso =
      purpose === "registrar"
        ? null
        : await requireAcesso(this.acessos, undefined, requireUsuario(usuarioId));
    const code = this.crypto.randomToken(32);
    await assertConsumerAuthorized();
    const auth = currentConsumerAuth();
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.store.purgeExpired(new Date());
    await this.store.create({
      codeHash: this.crypto.sha256Hex(code),
      purpose,
      usuarioId: acesso?.usuarioId ?? null,
      acessoId: acesso?.id ?? null,
      bearerHash: acesso?.tokenHash ?? null,
      expiresAt,
      csrfHash: null,
      claimedAt: null,
      oauthGrantId: auth?.kind === "oauth" ? auth.grantId : null,
    });
    return {
      success: true,
      setupUrl: `${this.baseUrl}/setup/${code}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async form(code: string): Promise<{ purpose: SetupPurpose; csrf: string } | null> {
    const hash = this.crypto.sha256Hex(code);
    const operation = await this.store.find(hash);
    if (!operation || operation.claimedAt || operation.expiresAt <= new Date()) {
      return null;
    }
    let auth: ConsumerAuth | undefined;
    if (operation.oauthGrantId) {
      try {
        if (!this.authorization) return null;
        auth = await this.authorization.assertGrant(operation.oauthGrantId);
      } catch {
        return null;
      }
    }
    const csrf = this.crypto.randomToken(32);
    if (
      !(await sessionContext.run({ auth }, () =>
        this.store.setCsrf(hash, this.crypto.sha256Hex(csrf), new Date()),
      ))
    ) {
      return null;
    }
    return { purpose: operation.purpose, csrf };
  }

  async complete(code: string, form: Record<string, string>): Promise<SetupCompletion> {
    if (form.confirmado !== "sim" || !form.csrf) {
      throw this.invalid();
    }
    const csrf = form.csrf;
    const pending = await this.store.find(this.crypto.sha256Hex(code));
    if (!pending) throw this.invalid();
    const auth = pending.oauthGrantId
      ? await this.authorization?.assertGrant(pending.oauthGrantId)
      : undefined;
    if (pending.oauthGrantId && !auth) throw this.invalid();
    const operation = await sessionContext.run({ auth }, () =>
      this.store.claim(this.crypto.sha256Hex(code), this.crypto.sha256Hex(csrf), new Date()),
    );
    if (!operation || operation.oauthGrantId !== pending.oauthGrantId) throw this.invalid();
    if (operation.usuarioId) {
      const acesso = operation.acessoId ? await this.acessos.findById(operation.acessoId) : null;
      const usuario = await this.usuarios.findById(operation.usuarioId);
      if (
        acesso?.usuarioId !== operation.usuarioId ||
        acesso.tokenHash !== operation.bearerHash ||
        acesso.statusAcesso === "revoked" ||
        usuario?.emailHash !== this.crypto.sha256Hex((form.email ?? "").trim().toLowerCase())
      ) {
        throw this.invalid();
      }
      // Reautenticação no hub, sem sessão de navegador ou autenticação própria.
      const tokens = await sessionContext.run(
        {
          auth,
          authorize:
            auth && this.authorization ? () => this.authorization!.assert(auth) : undefined,
        },
        async () => {
          const tokens = await this.plug.login(form.email!, form.senha ?? "");
          const status = await this.plug.getAgentAccessStatus(tokens.accessToken, acesso.agentId);
          if (status.state === "revoked") throw this.invalid();
          await assertConsumerAuthorized();
          return tokens;
        },
      );
      this.sessions.remember(operation.usuarioId, tokens);
    }
    const result = await sessionContext.run(
      {
        usuarioId: operation.usuarioId ?? undefined,
        acessoId: operation.acessoId ?? undefined,
        auth,
        authorize: auth && this.authorization ? () => this.authorization!.assert(auth) : undefined,
      },
      () =>
        this.completeOperation(operation.purpose, operation.usuarioId ?? undefined, {
          ...form,
          expectedBearerHash: operation.bearerHash ?? "",
        }),
    );
    const rotatedId =
      operation.purpose === "rotacionar"
        ? operation.acessoId
        : operation.purpose === "registrar" && form.recuperar === "sim"
          ? result.acessoId
          : null;
    if (rotatedId) {
      for (const listener of this.invalidationListeners) {
        listener(rotatedId);
      }
      await this.invalidate(rotatedId);
      if (operation.usuarioId) {
        this.sessions.invalidate(operation.usuarioId);
      }
    }
    return result;
  }

  private invalid(): DomainError {
    return new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Operação inválida, expirada ou não autorizada.",
      hint: "Gere uma nova URL de operação e confirme no navegador.",
    });
  }
}
