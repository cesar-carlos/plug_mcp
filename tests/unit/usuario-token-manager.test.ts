import { describe, expect, it } from "vitest";
import { withHubAuth } from "../../src/application/use-cases/shared/hub-auth.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import type { PlugHubTokens } from "../../src/domain/ports/plug-server-gateway.port.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { InMemoryUsuarioRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { UsuarioTokenManager } from "../../src/infrastructure/plug-server/usuario-token-manager.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

const jwtWithExp = (secondsFromNow: number): string => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
};

const expiredAuth = (): DomainError =>
  new DomainError({
    code: ERROR_CODES.USER_AUTH_EXPIRED,
    message: "JWT recusado",
    hint: "relogue",
  });

class CountingPlug extends FakePlugServer {
  logins = 0;
  refreshes = 0;
  loginShouldFail = false;
  refreshShouldFail = false;
  refreshTokens: PlugHubTokens = {
    accessToken: jwtWithExp(3600),
    refreshToken: "rt-refreshed",
  };

  override async login(email: string, password: string): Promise<PlugHubTokens> {
    this.logins += 1;
    if (this.loginShouldFail) {
      throw expiredAuth();
    }
    return super.login(email, password);
  }

  override async refresh(_refreshToken: string): Promise<PlugHubTokens> {
    this.refreshes += 1;
    if (this.refreshShouldFail) {
      throw expiredAuth();
    }
    return this.refreshTokens;
  }
}

const seedUsuario = async (usuarios: InMemoryUsuarioRepository) => {
  const email = "client@example.com";
  return usuarios.create({
    emailEnc: crypto.encrypt(email),
    emailHash: crypto.sha256Hex(email),
    senhaEnc: crypto.encrypt("secret-pass"),
    tokenHash: crypto.sha256Hex("mcp-token"),
    tokenExpiresAt: null,
  });
};

describe("UsuarioTokenManager", () => {
  it("refresh ok não chama login", async () => {
    const plug = new CountingPlug();
    const usuarios = new InMemoryUsuarioRepository();
    const usuario = await seedUsuario(usuarios);
    const manager = new UsuarioTokenManager(usuarios, crypto, plug, new SilentTestLogger());
    manager.remember(usuario.id, {
      accessToken: jwtWithExp(10),
      refreshToken: "rt-old",
    });
    const token = await manager.getAccessToken(usuario.id);
    expect(token).toBe(plug.refreshTokens.accessToken);
    expect(plug.refreshes).toBe(1);
    expect(plug.logins).toBe(0);
  });

  it("refresh falha → login com senha do cofre", async () => {
    const plug = new CountingPlug();
    plug.refreshShouldFail = true;
    plug.loginImpl = async () => ({
      accessToken: jwtWithExp(3600),
      refreshToken: "rt-login",
    });
    const usuarios = new InMemoryUsuarioRepository();
    const usuario = await seedUsuario(usuarios);
    const manager = new UsuarioTokenManager(usuarios, crypto, plug, new SilentTestLogger());
    manager.remember(usuario.id, {
      accessToken: jwtWithExp(10),
      refreshToken: "rt-old",
    });
    const token = await manager.getAccessToken(usuario.id);
    expect(token).toMatch(/^eyJ/);
    expect(plug.refreshes).toBe(1);
    expect(plug.logins).toBe(1);
  });

  it("login recusado → CREDENTIAL_STALE", async () => {
    const plug = new CountingPlug();
    plug.loginShouldFail = true;
    const usuarios = new InMemoryUsuarioRepository();
    const usuario = await seedUsuario(usuarios);
    const manager = new UsuarioTokenManager(usuarios, crypto, plug, new SilentTestLogger());
    await expect(manager.getAccessToken(usuario.id)).rejects.toMatchObject({
      code: ERROR_CODES.CREDENTIAL_STALE,
    });
    expect(plug.logins).toBe(1);
  });

  it("remember evita login extra", async () => {
    const plug = new CountingPlug();
    const usuarios = new InMemoryUsuarioRepository();
    const usuario = await seedUsuario(usuarios);
    const manager = new UsuarioTokenManager(usuarios, crypto, plug, new SilentTestLogger());
    const cached = jwtWithExp(3600);
    manager.remember(usuario.id, { accessToken: cached, refreshToken: "rt" });
    await expect(manager.getAccessToken(usuario.id)).resolves.toBe(cached);
    await expect(manager.getAccessToken(usuario.id)).resolves.toBe(cached);
    expect(plug.logins).toBe(0);
    expect(plug.refreshes).toBe(0);
  });
});

describe("withHubAuth", () => {
  it("401 uma vez → invalidate + novo token + sucesso", async () => {
    let tokens = 0;
    let invalidated = 0;
    const sessions = {
      getAccessToken: async () => {
        tokens += 1;
        return `t${tokens}`;
      },
      invalidate: () => {
        invalidated += 1;
      },
      remember: () => undefined,
    };
    let calls = 0;
    const result = await withHubAuth(sessions, "u1", async (accessToken) => {
      calls += 1;
      if (calls === 1) {
        throw expiredAuth();
      }
      return accessToken;
    });
    expect(result).toBe("t2");
    expect(calls).toBe(2);
    expect(invalidated).toBe(1);
    expect(tokens).toBe(2);
  });

  it("401 duas vezes → USER_AUTH_EXPIRED", async () => {
    const sessions = {
      getAccessToken: async () => "t",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    await expect(
      withHubAuth(sessions, "u1", async () => Promise.reject(expiredAuth())),
    ).rejects.toMatchObject({
      code: ERROR_CODES.USER_AUTH_EXPIRED,
    });
  });
});
