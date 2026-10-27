import { matchesSearch } from "./list-search";
import type { ManagedToken, TokenPermissions } from "./token-permissions";
import { tokenValidity, tokenValidityLabels, type TokenDates } from "./token-validity";

export const TOKEN_LIST_DEFAULT_FILTER = "nao_revogados";

export const TOKEN_LIST_CLOCK_MS = 60_000;

export type TokenListState = "idle" | "loading" | "loaded" | "error";

export type TokenListFilter =
  "todos" | "nao_revogados" | "revogados" | keyof typeof tokenValidityLabels;

export interface TokenMutationBody {
  expectedVersion: number;
  name: string;
  expiresAt: string | null;
  permissions: TokenPermissions;
  delegation: TokenPermissions;
}

export function cloneManagedToken(token: ManagedToken): ManagedToken {
  return JSON.parse(JSON.stringify(token)) as ManagedToken;
}

export function isManagedTokenDirty(
  edited: ManagedToken | undefined,
  editing: ManagedToken | undefined,
): boolean {
  return !!edited && JSON.stringify(edited) !== JSON.stringify(editing);
}

export function matchesTokenList(
  token: TokenDates & { name: string },
  search: string,
  filter: string,
  now: number,
): boolean {
  if (!matchesSearch(search, token.name)) {
    return false;
  }
  if (filter === "todos") {
    return true;
  }
  if (filter === "nao_revogados") {
    return !token.revokedAt;
  }
  if (filter === "revogados") {
    return !!token.revokedAt;
  }
  return filter === tokenValidity(token, now);
}

export function tokenListHidesRevoked(
  filter: string,
  tokens: readonly { revokedAt: string | null }[],
): boolean {
  return filter === TOKEN_LIST_DEFAULT_FILTER && tokens.some((token) => !!token.revokedAt);
}

export function tokenListStatus(token: TokenDates, now: number): string {
  return tokenValidityLabels[tokenValidity(token, now)];
}

export function tokenExpiryHelp(expiresAt: string | null): string {
  return expiresAt ? `Validade: ${new Date(expiresAt).toLocaleString()}` : "Sem expiração";
}

export function tokenMutationPath(base: string, tokenId: string, rotate: boolean): string {
  return `${base}/tokens/${tokenId}/${rotate ? "rotacionar" : "editar"}`;
}

export function tokenMutationBody(token: ManagedToken, expectedVersion: number): TokenMutationBody {
  return {
    expectedVersion,
    name: token.name,
    expiresAt: token.expiresAt,
    permissions: token.permissions,
    delegation: token.delegation,
  };
}

export function tokenMutationMessage(rotate: boolean): string {
  return rotate
    ? "Token rotacionado. Copie o novo valor; o anterior foi invalidado."
    : "Token atualizado. Acessos derivados anteriores foram invalidados.";
}

export function tokenRotatePrompt(): {
  title: string;
  description: string;
  confirmLabel: string;
} {
  return {
    title: "Gerar novo token?",
    description:
      "O token anterior e seus acessos derivados serão invalidados imediatamente. As alterações deste formulário também serão salvas. Copie o novo valor após confirmar; ele não poderá ser recuperado depois.",
    confirmLabel: "Gerar e invalidar o anterior",
  };
}

export function tokenRevokePrompt(token: {
  name: string;
  permissions: { skills: readonly unknown[] };
}): {
  title: string;
  description: string;
  confirmLabel: string;
} {
  return {
    title: `Revogar ${token.name}?`,
    description: `Este token e suas conexões OAuth derivadas perderão acesso às ${token.permissions.skills.length} skills concedidas. Outros tokens permanecem válidos. Efeitos já executados não serão desfeitos.`,
    confirmLabel: "Confirmar revogação",
  };
}
