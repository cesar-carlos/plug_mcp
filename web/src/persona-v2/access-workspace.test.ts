import { describe, expect, it } from "vitest";
import type { GrantPublication } from "./model";
import {
  ACCESS_TOKEN_TAB_SECTIONS,
  ACCESS_TOKEN_TABS,
  assertIssuanceSelection,
  chosenIssuanceSkills,
  clearUncertainIssuance,
  issuanceExpiresAt,
  listedIssuanceTokens,
  markUncertainIssuance,
} from "./access-workspace";

function queryPublication(sourceId = "source"): GrantPublication {
  return {
    id: "published",
    revision: 1,
    suspendedAt: null,
    hash: "hash",
    package: {
      format: "persona-query-v2",
      name: "Pedidos",
      sourceId,
      requiredCapabilities: ["published-contract"],
    },
  };
}

describe("abas de acesso", () => {
  it("preserva a ordem e os destinos de foco das seções", () => {
    expect([...ACCESS_TOKEN_TABS]).toEqual(["list", "new", "connect", "chatgpt", "connections"]);
    expect(ACCESS_TOKEN_TAB_SECTIONS).toEqual({
      list: "access-token-list",
      new: "access-new-token",
      connect: "access-connect",
      chatgpt: "access-chatgpt",
      connections: "access-connections",
    });
  });
});

describe("emissão de token", () => {
  it("ignora skill sem publicação e recusa seleção vazia sem administração", () => {
    expect(chosenIssuanceSkills(["missing"], {})).toEqual([]);
    expect(() => assertIssuanceSelection([], [])).toThrow("capacidade publicada");
    expect(() => assertIssuanceSelection([], ["treinar"])).not.toThrow();
  });

  it("exige dependências do cruzamento na publicação e no hash exatos", () => {
    const query = queryPublication("dep-source");
    const crossing: GrantPublication = {
      id: "cross-pub",
      revision: 2,
      suspendedAt: null,
      hash: "cross-hash",
      package: {
        format: "persona-federation-v2",
        name: "Cruzamento",
        requiredCapabilities: ["published-contract"],
        dependencies: [
          { skillId: "query", publicationId: "published", hash: "hash", sourceId: "dep-source" },
        ],
      },
    };
    const chosen = chosenIssuanceSkills(["query", "cross"], { query, cross: crossing });
    expect(() => assertIssuanceSelection(chosen, [])).not.toThrow();
    expect(() =>
      assertIssuanceSelection(chosenIssuanceSkills(["cross"], { cross: crossing }), []),
    ).toThrow("consultas dependentes");
    const stale = queryPublication();
    stale.id = "other-pub";
    expect(() =>
      assertIssuanceSelection(
        chosenIssuanceSkills(["query", "cross"], { query: stale, cross: crossing }),
        [],
      ),
    ).toThrow("consultas dependentes");
  });

  it("calcula validade sem inventar prazo quando o token não expira", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    expect(issuanceExpiresAt(true, 30, now)).toBeNull();
    expect(issuanceExpiresAt(false, 2, now)).toBe(new Date(now + 2 * 86400000).toISOString());
  });

  it("marca e limpa emissão incerta sem misturar outras personas", () => {
    const current = { other: { checked: true, tokens: [{ id: "a", name: "A", revokedAt: null }] } };
    const marked = markUncertainIssuance(current, "persona-1");
    expect(marked["persona-1"]).toEqual({ checked: false, tokens: [] });
    expect(marked.other).toEqual(current.other);
    expect(clearUncertainIssuance(marked, "persona-1")).toEqual(current);
  });

  it("lista só identificadores da conferência, sem segredo", () => {
    expect(listedIssuanceTokens([{ id: "t1", name: "Ops", revokedAt: "2026-10-01" }])).toEqual([
      { id: "t1", name: "Ops", revokedAt: "2026-10-01" },
    ]);
  });
});
