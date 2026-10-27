import { describe, expect, it } from "vitest";
import { emptyTokenPermissions, type ManagedToken } from "./token-permissions";
import {
  cloneManagedToken,
  isManagedTokenDirty,
  matchesTokenList,
  TOKEN_LIST_DEFAULT_FILTER,
  tokenExpiryHelp,
  tokenListHidesRevoked,
  tokenListStatus,
  tokenMutationBody,
  tokenMutationMessage,
  tokenMutationPath,
  tokenRevokePrompt,
  tokenRotatePrompt,
} from "./token-manager";

function token(overrides: Partial<ManagedToken> = {}): ManagedToken {
  return {
    id: "token-1",
    name: "Operação",
    expiresAt: null,
    revokedAt: null,
    authorizationVersion: 3,
    permissions: emptyTokenPermissions(),
    delegation: emptyTokenPermissions(),
    ...overrides,
  };
}

describe("lista de tokens", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");

  it("filtra busca e situação sem alterar o cadastro", () => {
    const active = token({ name: "Ativo" });
    const revoked = token({ id: "r", name: "Revogado", revokedAt: "2026-10-01" });
    const expired = token({
      id: "e",
      name: "Expirado",
      expiresAt: new Date(now).toISOString(),
    });
    expect(matchesTokenList(active, "", TOKEN_LIST_DEFAULT_FILTER, now)).toBe(true);
    expect(matchesTokenList(revoked, "", TOKEN_LIST_DEFAULT_FILTER, now)).toBe(false);
    expect(matchesTokenList(revoked, "", "revogados", now)).toBe(true);
    expect(matchesTokenList(expired, "", "expirado", now)).toBe(true);
    expect(matchesTokenList(active, "ops", "todos", now)).toBe(false);
    expect(matchesTokenList(active, "ativ", "todos", now)).toBe(true);
    expect(tokenListHidesRevoked(TOKEN_LIST_DEFAULT_FILTER, [active, revoked])).toBe(true);
    expect(tokenListHidesRevoked("todos", [revoked])).toBe(false);
  });

  it("rotula validade e expiração sem recuperar segredo", () => {
    expect(tokenListStatus(token({ revokedAt: "2026-10-01" }), now)).toBe("Revogado");
    expect(tokenExpiryHelp(null)).toBe("Sem expiração");
    expect(tokenExpiryHelp("2026-10-26T12:00:00.000Z")).toMatch(/^Validade:/);
  });
});

describe("edição de token cadastrado", () => {
  it("clona o cadastro e detecta sujeira só com alteração local", () => {
    const original = token({ name: "Original" });
    const copy = cloneManagedToken(original);
    expect(copy).toEqual(original);
    copy.name = "Novo";
    expect(original.name).toBe("Original");
    expect(isManagedTokenDirty(undefined, original)).toBe(false);
    expect(isManagedTokenDirty(original, original)).toBe(false);
    expect(isManagedTokenDirty(copy, original)).toBe(true);
  });

  it("monta caminho e corpo da mutação sem emitir bearer", () => {
    const current = token({
      permissions: { ...emptyTokenPermissions(), skills: [] },
      delegation: emptyTokenPermissions(),
    });
    expect(tokenMutationPath("/api/personas/p1", current.id, false)).toBe(
      "/api/personas/p1/tokens/token-1/editar",
    );
    expect(tokenMutationPath("/api/personas/p1", current.id, true)).toBe(
      "/api/personas/p1/tokens/token-1/rotacionar",
    );
    expect(tokenMutationBody(current, 7)).toEqual({
      expectedVersion: 7,
      name: current.name,
      expiresAt: null,
      permissions: current.permissions,
      delegation: current.delegation,
    });
  });

  it("preserva avisos de rotação e revogação sem desfazer efeitos", () => {
    expect(tokenMutationMessage(false)).toContain("Acessos derivados anteriores");
    expect(tokenMutationMessage(true)).toContain("o anterior foi invalidado");
    expect(tokenRotatePrompt().description).toContain("não poderá ser recuperado");
    expect(tokenRotatePrompt().confirmLabel).toBe("Gerar e invalidar o anterior");
    const prompt = tokenRevokePrompt({
      name: "Ops",
      permissions: { skills: [{}, {}] },
    });
    expect(prompt.title).toBe("Revogar Ops?");
    expect(prompt.description).toContain("2 skills concedidas");
    expect(prompt.description).toContain("não serão desfeitos");
  });
});
