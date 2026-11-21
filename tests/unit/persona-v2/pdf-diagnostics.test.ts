import { expect, it } from "vitest";
import { pdfFailureDiagnosticSchema } from "../../../src/domain/persona-v2/pdf-renderer-failure.js";

it("accepts only known diagnostic codes and renderer reasons, never arbitrary content", () => {
  expect(pdfFailureDiagnosticSchema.safeParse({ errorCode: "INVALID_SQL" }).success).toBe(true);
  expect(pdfFailureDiagnosticSchema.safeParse({ errorCode: "INVALID_PLAN" }).success).toBe(true);
  expect(
    pdfFailureDiagnosticSchema.safeParse({
      errorCode: "CAPABILITY_UNAVAILABLE",
      renderReason: "PDF_RENDER_TIMEOUT",
    }).success,
  ).toBe(true);
  for (const raw of [
    { errorCode: "password=private" },
    { errorCode: "INVALID_SQL", sql: "SELECT secret" },
    { errorCode: "INVALID_SQL", message: "private values" },
    { errorCode: "CAPABILITY_UNAVAILABLE", renderReason: "native secret" },
  ])
    expect(pdfFailureDiagnosticSchema.safeParse(raw).success).toBe(false);
});
