import type { Permissions } from "./model.js";
export interface PersonaOAuthConnection {
  id: string;
  tokenId: string;
  tokenName: string;
  clientId: string;
  createdAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  state: "vigente_localmente" | "revogada" | "expirada" | "bloqueada";
  permissions: Permissions;
  fingerprint: string;
}
export interface PersonaOAuthConnectionPage {
  items: readonly PersonaOAuthConnection[];
  nextCursor: string | null;
  remoteAuthority: "nao_verificado";
}
export interface PersonaOAuthConnectionTransaction {
  list(personaId: string, after?: string): Promise<PersonaOAuthConnectionPage>;
  find(personaId: string, id: string): Promise<PersonaOAuthConnection | null>;
  revoke(
    personaId: string,
    id: string,
    fingerprint: string,
  ): Promise<{ id: string; status: "revoked"; revokedAt: string }>;
}
