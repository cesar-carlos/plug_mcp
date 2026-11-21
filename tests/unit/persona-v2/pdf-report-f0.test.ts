import { describe, expect, it } from "vitest";
import {
  pdfReportF0Schema,
  pdfReportJobF0Schema,
  generatedPdfF0Schema,
  pdfReportStatusF0Schema,
  syntheticMoney,
} from "../../../scripts/homologation/pdf-report-f0-contract.js";

const id = "11111111-1111-4111-8111-111111111111";
const request = {
  schemaVersion: 1,
  requestId: id,
  query: { fonteId: id, skillIds: [id] },
  scope: "integral",
  layout: { templateId: "table-v1", orientation: "portrait", columns: ["codigo", "valor"] },
};
describe("F0 PDF draft, no registered capability", () => {
  it("bounds published PDF budgets independently from JSON and binary", () => {
    const contract = {
      schemaVersion: 1,
      templates: ["table-v1"],
      columns: ["codigo", "valor"],
      maxRows: 5000,
      maxPages: 250,
      maxBytes: 8388608,
      ttlMs: 900000,
    };
    expect(generatedPdfF0Schema.safeParse(contract).success).toBe(true);
    for (const key of ["maxRows", "maxPages", "maxBytes", "ttlMs"] as const) {
      expect(
        generatedPdfF0Schema.safeParse({ ...contract, [key]: contract[key] + 1 }).success,
      ).toBe(false);
    }
  });
  it("does not expose handle while collecting or allow replay of uncertain capture", () => {
    const status = {
      jobId: id,
      workDeadline: "2026-11-20T12:01:00Z",
      artifactExpiresAt: "2026-11-20T12:15:00Z",
      replayAllowed: false,
    };
    expect(pdfReportStatusF0Schema.safeParse({ ...status, state: "collecting" }).success).toBe(
      true,
    );
    expect(
      pdfReportStatusF0Schema.safeParse({ ...status, state: "collecting", handle: "a".repeat(43) })
        .success,
    ).toBe(false);
    const uncertain = {
      ...status,
      state: "capture_unconfirmed",
      reason: "capture_unconfirmed",
      supportId: id,
    };
    expect(pdfReportStatusF0Schema.safeParse(uncertain).success).toBe(true);
    expect(pdfReportStatusF0Schema.safeParse({ ...uncertain, replayAllowed: true }).success).toBe(
      false,
    );
    expect(pdfReportStatusF0Schema.safeParse({ ...uncertain, sql: "private" }).success).toBe(false);
  });
  it("accepts bounded single-source draft and requires explicit page scope", () => {
    expect(pdfReportF0Schema.safeParse(request).success).toBe(true);
    const page = {
      ...request,
      scope: "pagina",
      query: { ...request.query, options: { page: 2, pageSize: 30 } },
    };
    expect(pdfReportF0Schema.safeParse(page).success).toBe(true);
    expect(pdfReportF0Schema.safeParse({ ...page, scope: "integral" }).success).toBe(false);
    expect(pdfReportF0Schema.safeParse({ ...request, scope: "pagina" }).success).toBe(false);
  });
  it.each(["html", "css", "svg", "url", "title", "orderBy", "formatter"])(
    "rejects untrusted layout field %s",
    (key) => {
      expect(
        pdfReportF0Schema.safeParse({
          ...request,
          layout: { ...request.layout, [key]: "untrusted" },
        }).success,
      ).toBe(false);
    },
  );
  it("rejects caller identity, multiple skills, duplicate columns and invalid options", () => {
    expect(pdfReportF0Schema.safeParse({ ...request, personaId: id }).success).toBe(false);
    expect(
      pdfReportF0Schema.safeParse({ ...request, query: { ...request.query, skillIds: [id, id] } })
        .success,
    ).toBe(false);
    expect(
      pdfReportF0Schema.safeParse({
        ...request,
        layout: { ...request.layout, columns: ["codigo", "codigo"] },
      }).success,
    ).toBe(false);
    expect(
      pdfReportF0Schema.safeParse({
        ...request,
        query: { ...request.query, options: { maxRows: 5001 } },
      }).success,
    ).toBe(false);
    expect(pdfReportJobF0Schema.safeParse({ jobId: id, token: "secret" }).success).toBe(false);
  });
  it("preserves null, negative and large exact synthetic decimals", () => {
    expect(syntheticMoney(null)).toBe("Não informado");
    expect(syntheticMoney(0n)).toBe("0,00");
    expect(syntheticMoney(-1n)).toBe("-0,01");
    expect(syntheticMoney(900719925474099312n)).toBe("9007199254740993,12");
  });
});
