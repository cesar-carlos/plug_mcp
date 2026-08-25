import { describe, expect, it } from "vitest";
import { formatAsOf } from "../../src/application/use-cases/shared/format-as-of.js";

describe("formatAsOf", () => {
  it("UTC sem timezone", () => {
    const date = new Date("2026-08-25T15:00:00.000Z");
    expect(formatAsOf(date, null).asOf).toBe("2026-08-25T15:00:00.000Z");
  });

  it("formata no fuso do acesso", () => {
    const date = new Date("2026-08-25T15:00:00.000Z");
    const result = formatAsOf(date, "America/Cuiaba");
    expect(result.asOf).toMatch(/2026-08-25T11:00:00-04:00\[America\/Cuiaba\]/);
    expect(result.aviso).toBeUndefined();
  });

  it("timezone inválido cai em UTC com aviso", () => {
    const date = new Date("2026-08-25T15:00:00.000Z");
    const result = formatAsOf(date, "Not/AZone");
    expect(result.asOf).toBe("2026-08-25T15:00:00.000Z");
    expect(result.aviso).toMatch(/UTC/);
  });
});
