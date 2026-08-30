import { describe, expect, it } from "vitest";
import {
  agregarTelemetriaBusca,
  formatarTagsTelemetriaBusca,
  parseTagsTelemetriaBusca,
  type TelemetriaBusca,
} from "../../src/application/use-cases/shared/telemetria-busca.js";

const sample: TelemetriaBusca = {
  conhecimentos: 3,
  slotNarrativa: true,
  cobertura: "parcial",
  consultaPermitida: false,
  gap: "SKILL_GAP",
  listarSkills: true,
};

describe("telemetria de buscar_contexto", () => {
  it("formata e parseia tags sem texto livre", () => {
    const tags = formatarTagsTelemetriaBusca(sample);
    expect(tags).toBe(
      "conhecimentos=3;slotNarrativa=1;cobertura=parcial;permitida=0;gap=SKILL_GAP;listarSkills=1",
    );
    expect(parseTagsTelemetriaBusca(tags)).toEqual(sample);
  });

  it("recusa payload que não é telemetria", () => {
    expect(parseTagsTelemetriaBusca("SELECT * FROM receber")).toBeNull();
    expect(parseTagsTelemetriaBusca(null)).toBeNull();
  });

  it("agrega só linhas de buscar_contexto", () => {
    const tags = formatarTagsTelemetriaBusca(sample);
    const permitido = formatarTagsTelemetriaBusca({
      ...sample,
      consultaPermitida: true,
      cobertura: "completa",
      gap: "none",
      slotNarrativa: false,
    });
    const agregado = agregarTelemetriaBusca([
      { tool: "consultar_dados", sqlEnviado: "SELECT 1" },
      { tool: "buscar_contexto", sqlEnviado: tags },
      { tool: "buscar_contexto", sqlEnviado: permitido },
    ]);
    expect(agregado).toEqual({
      total: 2,
      consultaPermitida: 1,
      skillGap: 1,
      slotNarrativa: 1,
    });
  });
});
