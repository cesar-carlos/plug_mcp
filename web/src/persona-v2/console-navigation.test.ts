import { describe, expect, it } from "vitest";
import { consoleRouteAfterAreaChange, shouldBlockConsoleNavigation } from "./console-navigation";

describe("guarda de navegação do console", () => {
  it("bloqueia troca de área enquanto processa ou confirma descarte", () => {
    expect(shouldBlockConsoleNavigation(true, false)).toBe(true);
    expect(shouldBlockConsoleNavigation(false, true)).toBe(true);
    expect(shouldBlockConsoleNavigation(false, false)).toBe(false);
  });

  it("encaminha para personas na ausência de seleção, salvo catálogo", () => {
    expect(
      consoleRouteAfterAreaChange("sources", {
        logged: true,
        personaId: "",
        personaActive: undefined,
      }),
    ).toEqual({ name: "personas" });
    expect(
      consoleRouteAfterAreaChange("catalog", {
        logged: true,
        personaId: "",
        personaActive: undefined,
      }),
    ).toBe(true);
    expect(
      consoleRouteAfterAreaChange("personas", {
        logged: true,
        personaId: "",
        personaActive: undefined,
      }),
    ).toBe(true);
  });

  it("encaminha persona suspensa para a visão geral, salvo áreas permitidas", () => {
    expect(
      consoleRouteAfterAreaChange("training", {
        logged: true,
        personaId: "p1",
        personaActive: false,
      }),
    ).toEqual({ name: "overview" });
    expect(
      consoleRouteAfterAreaChange("history", {
        logged: true,
        personaId: "p1",
        personaActive: false,
      }),
    ).toBe(true);
    expect(
      consoleRouteAfterAreaChange("training", {
        logged: true,
        personaId: "p1",
        personaActive: true,
      }),
    ).toBe(true);
  });
});
