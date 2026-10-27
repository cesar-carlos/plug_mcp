export interface TokenDates {
  revokedAt: string | null;
  expiresAt: string | null;
}
export function tokenValidity(token: TokenDates, now: number) {
  if (token.revokedAt) return "revogado";
  if (!token.expiresAt) return "ativo";
  const expiry = Date.parse(token.expiresAt);
  if (!Number.isFinite(expiry)) return "desconhecido";
  if (expiry <= now) return "expirado";
  return expiry - now <= 7 * 86400000 ? "vence_em_breve" : "ativo";
}
export const tokenValidityLabels = {
  ativo: "Ativo",
  revogado: "Revogado",
  expirado: "Expirado",
  vence_em_breve: "Vence em até 7 dias",
  desconhecido: "Validade indisponível",
};

export function localExpiryInput(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function expiryFromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
