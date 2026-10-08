import { describe, expect, it } from "vitest";
import { governancaPayload, type GovernancaForm } from "./governanca";
describe("edição de governança", () => {
  const original: GovernancaForm = {
    vigenteDe: "2026-10-08",
    vigenteAte: "",
    revisarEm: "2026-11-01",
    fonteTipo: "documento",
    fonteReferencia: "Manual",
    responsavel: "Equipe",
    status: "vigente",
    periodoRevisaoDias: "30",
  };
  it("omite campos não alterados e não converte datas civis", () => {
    expect(governancaPayload({ ...original }, original, true)).toEqual({});
    expect(governancaPayload({ ...original, vigenteDe: "2026-10-09" }, original, true)).toEqual({
      vigenteDe: "2026-10-09",
    });
  });
  it("limpeza explícita envia null sem apagar outros campos", () => {
    expect(
      governancaPayload(
        { ...original, revisarEm: "", periodoRevisaoDias: "", responsavel: "" },
        original,
        true,
      ),
    ).toEqual({ revisarEm: null, periodoRevisaoDias: null, responsavel: null });
  });
});
