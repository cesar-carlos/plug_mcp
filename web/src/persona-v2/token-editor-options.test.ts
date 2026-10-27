import { describe, expect, it } from "vitest";
import type { GrantPublication } from "./model";
import { tokenExternalOperationOptions, tokenPublishedSkillOptions } from "./token-editor-options";

function queryPublication(): GrantPublication {
  return {
    id: "published",
    revision: 1,
    suspendedAt: null,
    hash: "hash",
    package: {
      format: "persona-query-v2",
      name: "Pedidos",
      sourceId: "source",
      requiredCapabilities: ["published-contract"],
    },
  };
}

function externalPublication(): GrantPublication {
  return {
    id: "ext-pub",
    revision: 3,
    suspendedAt: null,
    hash: "ext-hash",
    package: {
      format: "persona-external-v2",
      name: "ERP",
      requiredCapabilities: ["published-contract"],
      training: { operationId: "op-1", effect: "acao" },
    },
  };
}

describe("opções de edição de token", () => {
  it("lista operação externa publicada e conserva IDs órfãos removíveis", () => {
    expect(
      tokenExternalOperationOptions({ ext: externalPublication() }, ["op-1", "orphan"]),
    ).toEqual([
      { id: "op-1", label: "ERP · revisão 3" },
      { id: "orphan", label: "Operação sem publicação disponível (orphan)" },
    ]);
  });

  it("não adiciona operação de publicação inválida e mantém o ID já concedido", () => {
    const incomplete: GrantPublication = {
      id: "bad",
      revision: 1,
      suspendedAt: null,
      hash: "h",
      package: {
        format: "persona-external-v2",
        name: "Incompleto",
        requiredCapabilities: [],
      },
    };
    expect(tokenExternalOperationOptions({ bad: incomplete }, ["kept"])).toEqual([
      { id: "kept", label: "Operação sem publicação disponível (kept)" },
    ]);
  });

  it("ignora publicação ausente e consulta SQL sem operação externa", () => {
    expect(
      tokenExternalOperationOptions({ missing: undefined, query: queryPublication() }, []),
    ).toEqual([]);
  });

  it("marca skill já concedida e suspensa como indisponível para nova concessão", () => {
    const available = queryPublication();
    const suspended: GrantPublication = {
      ...queryPublication(),
      id: "suspended",
      revision: 2,
      suspendedAt: "2026-10-01T00:00:00.000Z",
      package: { ...queryPublication().package, name: "Suspensa" },
    };
    expect(
      tokenPublishedSkillOptions({ query: available, frozen: suspended, missing: undefined }, [
        "query",
      ]),
    ).toEqual([
      {
        id: "query",
        label: "Pedidos · revisão 1 · SELECT",
        checked: true,
        disabled: true,
      },
      {
        id: "frozen",
        label: "Suspensa · revisão 2 · Suspensa",
        checked: false,
        disabled: true,
      },
    ]);
  });
});
