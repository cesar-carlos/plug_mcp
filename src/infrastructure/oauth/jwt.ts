import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AppConfig } from "../../config/env.js";

export type AccessClaims = JWTPayload & {
  sub: string;
  client_id?: string;
};

const encoder = new TextEncoder();

export class McpJwtService {
  private readonly secret: Uint8Array;

  constructor(private readonly config: AppConfig) {
    this.secret = encoder.encode(config.MCP_JWT_SECRET);
  }

  async issueAccessToken(accountId: string, clientId: string): Promise<string> {
    return new SignJWT({ client_id: clientId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(accountId)
      .setIssuer(this.config.MCP_JWT_ISSUER)
      .setAudience(this.config.mcpResourceUrl)
      .setIssuedAt()
      .setExpirationTime(`${this.config.MCP_JWT_ACCESS_TTL_SECONDS}s`)
      .setJti(randomUUID())
      .sign(this.secret);
  }

  issueRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }

  async verifyAccessToken(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: this.config.MCP_JWT_ISSUER,
      audience: this.config.mcpResourceUrl,
    });
    if (!payload.sub) {
      throw new Error("missing sub");
    }
    return payload as AccessClaims;
  }
}

export const signSession = (secret: string, accountId: string): string => {
  const body = Buffer.from(
    JSON.stringify({ sub: accountId, exp: Date.now() + 8 * 3600_000 }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
};

export const readSession = (secret: string, cookie: string | undefined): string | null => {
  if (!cookie) return null;
  const [body, sig] = cookie.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
    };
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.sub;
  } catch {
    return null;
  }
};

/** RFC 7636: BASE64URL(SHA256(ascii verifier)). */
export const pkceChallengeFromVerifier = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");
