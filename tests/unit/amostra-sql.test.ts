import { describe, expect, it } from "vitest";
import {
  analisarAmostraSql,
  inferirTipoAmostra,
  montarHintTestarSql,
} from "../../src/application/use-cases/shared/amostra-sql.js";

describe("análise da amostra de testar_sql", () => {
  it("marca Status de uma letra como código e não marca id nem valor monetário", () => {
    const { estrutura, colunasCodigo } = analisarAmostraSql(
      ["CodCliente", "NomeCliente", "Status", "Valor"],
      [
        { CodCliente: 42, NomeCliente: "Acme Ltda", Status: "A", Valor: 1500.5 },
        { CodCliente: 7, NomeCliente: "Beta SA", Status: "P", Valor: 10 },
      ],
    );
    expect(estrutura.find((col) => col.nome === "Status")?.pareceCodigo).toBe(true);
    expect(estrutura.find((col) => col.nome === "Status")?.tipoInferido).toBe("char");
    expect(estrutura.find((col) => col.nome === "CodCliente")?.pareceCodigo).toBe(false);
    expect(estrutura.find((col) => col.nome === "Valor")?.pareceCodigo).toBe(false);
    expect(estrutura.find((col) => col.nome === "NomeCliente")?.pareceCodigo).toBe(false);
    expect(colunasCodigo).toEqual([{ coluna: "Status", valoresVistos: ["A", "P"] }]);
  });

  it("não trata identificador numérico pequeno (CodEmpresa=1) como código", () => {
    const { colunasCodigo } = analisarAmostraSql(
      ["CodEmpresa", "Status"],
      [{ CodEmpresa: 1, Status: "A" }],
    );
    expect(colunasCodigo).toEqual([{ coluna: "Status", valoresVistos: ["A"] }]);
  });

  it("marca flag 0/1 e boolean como código", () => {
    const { colunasCodigo } = analisarAmostraSql(
      ["Ativo", "Cancelado"],
      [
        { Ativo: 1, Cancelado: false },
        { Ativo: 0, Cancelado: true },
      ],
    );
    expect(colunasCodigo.map((col) => col.coluna).sort()).toEqual(["Ativo", "Cancelado"]);
  });

  it("infere tipos a partir dos valores", () => {
    expect(inferirTipoAmostra(["A", "P"])).toBe("char");
    expect(inferirTipoAmostra([1, 2])).toBe("integer");
    expect(inferirTipoAmostra([10.5])).toBe("decimal");
    expect(inferirTipoAmostra(["2026-01-15"])).toBe("datetime");
    expect(inferirTipoAmostra([null, undefined])).toBe("unknown");
  });

  it("hint de código pede dicionário e proíbe chute", () => {
    const hint = montarHintTestarSql({
      rowCount: 2,
      colunasCodigo: [{ coluna: "Status", valoresVistos: ["A"] }],
    });
    expect(hint).toContain("Status=A");
    expect(hint).toContain("Nunca chute");
    expect(hint).toContain("SELECT DISTINCT");
  });
});
