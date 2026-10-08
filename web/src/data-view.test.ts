import { describe, expect, it } from "vitest";
import { presentPayload } from "./data-view";

describe("presentPayload", () => {
  it("apresenta todos os itens e colunas recebidos sem corte silencioso", () => {
    const linhas = Array.from({ length: 75 }, (_, i) =>
      Object.fromEntries(Array.from({ length: 12 }, (_, col) => [`c${col}`, `${i}:${col}`])),
    );
    const view = presentPayload({ linhas });
    expect(view.tables[0]?.rows).toHaveLength(75);
    expect(view.tables[0]?.columns).toHaveLength(12);
    expect(view.tables[0]?.rows[74]?.[11]).toBe("74:11");
  });
  it("lista tabelas e deixa o recorte num fato", () => {
    const view = presentPayload({
      success: true,
      dialeto: "mssql",
      tabelas: [{ schema: "dbo", table_name: "cliente", object_type: "table" }],
      fluxoTreino: { passoAtual: "treinar_sql" },
    });
    expect(view.facts).toEqual([{ label: "Dialeto", value: "mssql" }]);
    expect(view.tables[0]?.title).toBe("Tabelas");
    expect(view.tables[0]?.rows).toEqual([["dbo", "cliente", "table"]]);
  });

  it("transforma mapa de métricas em tabela", () => {
    const view = presentPayload({
      porTool: { consultar_dados: { total: 2, erros: 0 } },
    });
    expect(view.tables[0]?.title).toBe("Por tool");
    expect(view.tables[0]?.rows[0]?.[0]).toBe("consultar_dados");
  });

  it("lista vazia continua uma tabela sem linhas", () => {
    const view = presentPayload({ conflitos: [] });
    expect(view.tables[0]?.rows).toEqual([]);
  });
});
