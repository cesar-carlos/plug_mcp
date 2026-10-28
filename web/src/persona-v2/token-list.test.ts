import { expect, it } from "vitest";
import { groupedFieldLabels, tokenSourceGroup } from "./token-list";
import type { GrantPublication } from "./model";

it("agrupa usos do mesmo campo sem misturar fontes ou mudar capabilities", () => {
  const capabilities = [
    "field-use:a:dbo.cliente.nome:projecao",
    "field-use:a:dbo.cliente.nome:filtro",
    "field-use:b:dbo.cliente.nome:ordenacao",
    "field-use:unknown",
    "consultar",
  ];
  const original = [...capabilities];
  expect(groupedFieldLabels(capabilities)).toEqual([
    "dbo.cliente.nome (a) · exibir · filtrar",
    "dbo.cliente.nome (b) · ordenar",
    "field-use:unknown",
  ]);
  expect(capabilities).toEqual(original);
});
it("agrupa por identidade da base e separa cruzamentos/integrações", () => {
  const publication: GrantPublication = {
    id: "p",
    revision: 1,
    hash: "h",
    suspendedAt: null,
    package: {
      format: "persona-query-v2",
      sourceId: "a",
      name: "Consulta",
      requiredCapabilities: [],
    },
  };
  expect(tokenSourceGroup(publication, []).key).toBe("source:a");
  expect(
    tokenSourceGroup({ ...publication, package: { ...publication.package, sourceId: "b" } }, [])
      .key,
  ).toBe("source:b");
  expect(
    tokenSourceGroup(
      { ...publication, package: { ...publication.package, format: "persona-federation-v2" } },
      [],
    ).key,
  ).toBe("federation");
  expect(
    tokenSourceGroup(
      { ...publication, package: { ...publication.package, format: "persona-external-v2" } },
      [],
    ).key,
  ).toBe("external");
});
