import { describe, expect, it } from "vitest";
import type { GrantPublication } from "./model";
import {
  applyTokenSkillGrant,
  buildNewTokenPermissions,
  emptyTokenPermissions,
  selectTokenSkill,
} from "./token-permissions";

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

describe("concessões do novo token", () => {
  it("não concede skill ausente nem integração sem gestão administrativa", () => {
    expect(
      buildNewTokenPermissions({
        selectedSkillIds: ["missing"],
        publications: {},
        limits: { queryLimits: { maxRows: 10 } },
        skillLimits: {},
        administrative: ["treinar"],
        administrativeSources: ["admin-source"],
        managedIntegrations: ["ignored"],
      }),
    ).toEqual({
      ...emptyTokenPermissions(),
      queryLimits: { maxRows: 10 },
      administrative: ["treinar"],
      managedIntegrationIds: [],
      sourceIds: ["admin-source"],
    });
  });
  it("une fonte da publicação, limites da skill e operação externa só com gestão", () => {
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
    const permissions = buildNewTokenPermissions({
      selectedSkillIds: ["query", "cross"],
      publications: { query: queryPublication("query-source"), cross: crossing },
      limits: {},
      skillLimits: { query: { queryLimits: { maxRows: 5 } } },
      administrative: ["gerenciar_integracoes"],
      administrativeSources: [],
      managedIntegrations: ["integration-1"],
    });
    expect(permissions.sourceIds).toEqual(["query-source", "dep-source"]);
    expect(permissions.managedIntegrationIds).toEqual(["integration-1"]);
    expect(permissions.skills).toEqual([
      {
        queryLimits: { maxRows: 5 },
        skillId: "query",
        capabilities: ["published-contract"],
        effects: ["select"],
        requireHumanApproval: false,
      },
      {
        skillId: "cross",
        capabilities: ["published-contract"],
        effects: ["select"],
        requireHumanApproval: false,
      },
    ]);
  });
  it("recusa publicação suspensa sem fabricar concessão", () => {
    const published = queryPublication();
    published.suspendedAt = new Date().toISOString();
    expect(() =>
      buildNewTokenPermissions({
        selectedSkillIds: ["query"],
        publications: { query: published },
        limits: {},
        skillLimits: {},
        administrative: [],
        administrativeSources: [],
        managedIntegrations: [],
      }),
    ).toThrow("suspensa");
  });
  it("atualiza a seleção de skill sem reordenar as demais", () => {
    expect(selectTokenSkill(["a", "b"], { a: {}, b: {} }, "b", false)).toEqual({
      selected: ["a"],
      skillLimits: { a: {} },
    });
    expect(selectTokenSkill(["a"], { a: {} }, "c", true)).toEqual({
      selected: ["a", "c"],
      skillLimits: { a: {}, c: {} },
    });
  });
  it("adiciona concessão publicada sem apagar operações externas já escolhidas", () => {
    const current = {
      ...emptyTokenPermissions(),
      externalOperationIds: ["kept"],
      skills: [
        {
          skillId: "other",
          capabilities: ["published-contract"],
          effects: ["select" as const],
          requireHumanApproval: false,
        },
      ],
    };
    const next = applyTokenSkillGrant(current, "query", true, queryPublication());
    expect(next.skills.map((grant) => grant.skillId)).toEqual(["other", "query"]);
    expect(next.externalOperationIds).toEqual(["kept"]);
  });
  it("remove só a skill escolhida e preserva operações externas", () => {
    const current = {
      ...emptyTokenPermissions(),
      externalOperationIds: ["op-1"],
      skills: [
        {
          skillId: "query",
          capabilities: ["published-contract"],
          effects: ["select" as const],
          requireHumanApproval: false,
        },
      ],
    };
    expect(applyTokenSkillGrant(current, "query", false, undefined)).toEqual({
      ...current,
      skills: [],
    });
  });
  it("recusa publicação ausente sem fabricar concessão", () => {
    expect(() => applyTokenSkillGrant(emptyTokenPermissions(), "query", true, undefined)).toThrow(
      "Publicação indisponível",
    );
  });
});
