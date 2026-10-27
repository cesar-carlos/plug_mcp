import { describe, expect, it } from "vitest";
import { emptyTraining } from "./model";
import {
  queryAttachmentBytes,
  queryAttachmentMib,
  queryAttachmentMinutes,
  queryAttachmentTtlMs,
  queryColumnsForTable,
  queryDiagramNodes,
  queryExampleState,
  queryHasPendingName,
  queryResourceType,
  queryRulesFromText,
} from "./query-training";

describe("regras do formulário de consulta", () => {
  it("conserva tipo de recurso table ou view sem inferir o físico", () => {
    expect(queryResourceType("view")).toBe("view");
    expect(queryResourceType("table")).toBe("table");
    expect(queryResourceType("")).toBe("table");
  });

  it("conserva estado editorial do exemplo e usa approved só fora da lista", () => {
    expect(queryExampleState("candidate")).toBe("candidate");
    expect(queryExampleState("approved")).toBe("approved");
    expect(queryExampleState("inactive")).toBe("inactive");
    expect(queryExampleState("replaced")).toBe("replaced");
    expect(queryExampleState("unknown")).toBe("approved");
  });

  it("divide regras por linha e ignora linhas vazias sem alterar o texto", () => {
    expect(queryRulesFromText("a\n  b  \n\n\t\nc")).toEqual(["a", "  b  ", "c"]);
  });

  it("converte teto e validade de anexo JSON sem ampliar concessão", () => {
    expect(queryAttachmentMib(1048576)).toBe(1);
    expect(queryAttachmentBytes("0.25")).toBe(262144);
    expect(queryAttachmentMinutes(300000)).toBe(5);
    expect(queryAttachmentTtlMs("15")).toBe(900000);
  });

  it("marca referência pendente e recorta colunas da tabela escolhida", () => {
    const training = emptyTraining();
    training.tables.push({ name: "pedidos", meaning: "Pedidos", grain: ["id"] });
    training.columns.push(
      { table: "pedidos", name: "id", meaning: "ID", classification: "livre" },
      { table: "itens", name: "id", meaning: "Item", classification: "livre" },
    );
    expect(queryHasPendingName(["pedidos"], "itens")).toBe(true);
    expect(queryHasPendingName(["pedidos"], "pedidos")).toBe(false);
    expect(queryHasPendingName(["pedidos"], "")).toBe(false);
    expect(queryColumnsForTable(training.columns, "pedidos").map((column) => column.name)).toEqual([
      "id",
    ]);
    expect(queryDiagramNodes(training.tables)).toEqual([{ id: "pedidos", name: "pedidos" }]);
  });
});
