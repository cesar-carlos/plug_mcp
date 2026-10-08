import { describe, expect, it } from "vitest";
import { novoExemplo, parseConsulta, previewConsulta } from "./consultas";
describe("curadoria do console", () => {
  const consulta = {
    id: "synthetic",
    pergunta: "Total",
    sql: "SELECT SUM(valor) FROM fato",
    skillIds: ["first", "second"],
    status: "candidata",
  };
  it("copia todos os vínculos para novo exemplo sem substituir o ID anterior", () => {
    const copia = novoExemplo(parseConsulta(consulta));
    expect(copia.skillIds).toEqual(["first", "second"]);
    expect(copia).not.toHaveProperty("consultaAprendidaId");
    expect(copia).not.toHaveProperty("id");
    copia.skillIds.pop();
    expect(consulta.skillIds).toHaveLength(2);
  });
  it("confirma o conteúdo retornado pelo servidor e valida o preview", () => {
    expect(previewConsulta({ consulta, confirmacaoHash: "canonical-hash" })).toEqual({
      consulta,
      hash: "canonical-hash",
    });
    expect(() => previewConsulta({ consulta, confirmacaoHash: null })).toThrow();
    expect(() => parseConsulta({ ...consulta, skillIds: [42] })).toThrow();
  });
});
