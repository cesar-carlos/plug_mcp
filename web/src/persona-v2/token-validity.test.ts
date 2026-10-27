import { expect, it } from "vitest";
import { expiryFromLocalInput, localExpiryInput, tokenValidity } from "./token-validity";
it("prioriza revogação e distingue vencimento, sete dias e validade desconhecida", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  expect(tokenValidity({ revokedAt: "2026-10-25", expiresAt: null }, now)).toBe("revogado");
  expect(tokenValidity({ revokedAt: null, expiresAt: null }, now)).toBe("ativo");
  expect(tokenValidity({ revokedAt: null, expiresAt: new Date(now).toISOString() }, now)).toBe(
    "expirado",
  );
  expect(
    tokenValidity({ revokedAt: null, expiresAt: new Date(now + 7 * 86400000).toISOString() }, now),
  ).toBe("vence_em_breve");
  expect(
    tokenValidity(
      { revokedAt: null, expiresAt: new Date(now + 7 * 86400000 + 1).toISOString() },
      now,
    ),
  ).toBe("ativo");
  expect(tokenValidity({ revokedAt: null, expiresAt: "invalid" }, now)).toBe("desconhecido");
});
it("converte validade local sem inventar expiração vazia", () => {
  expect(localExpiryInput(null)).toBe("");
  expect(expiryFromLocalInput("")).toBeNull();
  const iso = "2026-10-26T15:30:00.000Z";
  expect(expiryFromLocalInput(localExpiryInput(iso))).toBe(iso);
});
