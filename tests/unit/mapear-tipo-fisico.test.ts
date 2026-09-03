import { describe, expect, it } from "vitest";
import { InMemoryGrafoRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";

const acessoId = "11111111-1111-4111-8111-111111111111";

describe("mergeColuna corrige tipo incompatível", () => {
  it("catálogo datetime2 substitui uniqueidentifier e preserva sensibilidade confirmada", async () => {
    const grafo = new InMemoryGrafoRepository();
    const { tabela } = await grafo.mergeTabela({
      acessoId,
      nome: "ContaReceber",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    await grafo.mergeColuna({
      acessoId,
      tabelaId: tabela.id,
      nome: "DataLancamento",
      tipo: "uniqueidentifier",
      papel: "data",
      origem: "confirmado_usuario",
      autorUsuarioId: "u1",
      sensibilidade: "pessoal",
    });
    await grafo.mergeColuna({
      acessoId,
      tabelaId: tabela.id,
      nome: "DataLancamento",
      tipo: "datetime2",
      formato: "date",
      papel: "data",
      origem: "inferido",
      autorUsuarioId: "u1",
      sensibilidade: "livre",
    });
    const coluna = await grafo.findColuna(acessoId, tabela.id, "DataLancamento");
    expect(coluna?.tipo).toBe("datetime2");
    expect(coluna?.formato).toBe("date");
    expect(coluna?.sensibilidade).toBe("pessoal");
    expect(coluna?.origem).toBe("confirmado_usuario");
  });
});
