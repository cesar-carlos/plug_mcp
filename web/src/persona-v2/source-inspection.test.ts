import { describe, expect, it } from "vitest";
import {
  appendInspectionResource,
  defaultInspectionSchema,
  emptyInspectionResource,
  inspectionComposeBody,
  inspectionHasExpired,
  inspectionNullableLabel,
  inspectionPageNumber,
  inspectionResourceName,
  isInconclusiveComposition,
  liveInspectionPages,
  replaceInspectionPage,
  sourceInspectionErrorMessage,
  sourceInspectionFingerprint,
  sourceInspectionScopeFingerprint,
} from "./source-inspection";

describe("escopo da inspeção estrutural", () => {
  it("escolhe schema padrão do motor sem inventar recurso", () => {
    expect(defaultInspectionSchema("firebird")).toBeNull();
    expect(defaultInspectionSchema("postgres")).toBe("public");
    expect(defaultInspectionSchema("sybase")).toBe("DBA");
    expect(defaultInspectionSchema("mssql")).toBe("dbo");
    expect(emptyInspectionResource("postgres")).toEqual({
      schema: "public",
      name: "",
      type: "table",
    });
    expect(appendInspectionResource([{ schema: "sales", name: "orders", type: "view" }])).toEqual({
      schema: "sales",
      name: "",
      type: "table",
    });
  });

  it("separa fingerprint de página e de escopo", () => {
    const resources = [{ schema: "public", name: "orders", type: "table" as const }];
    const scope = {
      resources,
      sourceId: "source",
      version: 1,
      active: true,
    };
    expect(sourceInspectionScopeFingerprint(scope)).toBe(
      sourceInspectionScopeFingerprint({ ...scope, resources: [...resources] }),
    );
    expect(sourceInspectionFingerprint({ ...scope, offset: 0 })).not.toBe(
      sourceInspectionFingerprint({ ...scope, offset: 4 }),
    );
  });
});

describe("páginas vigentes da inspeção", () => {
  it("conserva só evidências ainda válidas e substitui a página do mesmo offset", () => {
    const now = Date.parse("2026-10-27T12:00:00.000Z");
    expect(
      liveInspectionPages(
        [{ expiresAt: "2026-10-27T11:59:59.000Z" }, { expiresAt: "2026-10-27T12:00:01.000Z" }],
        now,
      ),
    ).toEqual([{ expiresAt: "2026-10-27T12:00:01.000Z" }]);
    expect(inspectionHasExpired("2026-10-27T12:00:00.000Z", now)).toBe(true);
    expect(inspectionHasExpired("2026-10-27T12:00:01.000Z", now)).toBe(false);
    expect(
      replaceInspectionPage(
        [
          { id: "a", evidence: { metadataPage: { offset: 0 } } },
          { id: "b", evidence: { metadataPage: { offset: 4 } } },
        ],
        { id: "c", evidence: { metadataPage: { offset: 0 } } },
        0,
      ),
    ).toEqual([
      { id: "b", evidence: { metadataPage: { offset: 4 } } },
      { id: "c", evidence: { metadataPage: { offset: 0 } } },
    ]);
    expect(inspectionComposeBody([{ id: "a" }, { id: "b" }])).toEqual({
      evidenceIds: ["a", "b"],
    });
  });

  it("recusa composição inconclusiva e formata observação sem adotar", () => {
    expect(isInconclusiveComposition({ status: "inconclusive" })).toBe(true);
    expect(isInconclusiveComposition({ status: "available" })).toBe(false);
    expect(isInconclusiveComposition("inconclusive")).toBe(false);
    expect(inspectionPageNumber(0)).toBe(1);
    expect(inspectionPageNumber(4)).toBe(2);
    expect(inspectionResourceName({ schema: "public", name: "orders" })).toBe("public.orders");
    expect(inspectionResourceName({ schema: null, name: "orders" })).toBe("orders");
    expect(inspectionNullableLabel(null)).toBe("Desconhecido");
    expect(inspectionNullableLabel(true)).toBe("Sim");
    expect(inspectionNullableLabel(false)).toBe("Não");
    expect(sourceInspectionErrorMessage(new Error("escopo"), "Revise o escopo.")).toBe("escopo");
    expect(sourceInspectionErrorMessage("x", "Revise o escopo.")).toBe("Revise o escopo.");
  });
});
