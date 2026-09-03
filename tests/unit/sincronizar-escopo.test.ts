import { describe, expect, it } from "vitest";
import {
  PACOTE_VERSAO_ATUAL,
  parseEscopoSkill,
  uniaoEscopos,
} from "../../src/domain/entities/escopo.js";
import { overlayCardinalidadeDoGrafo } from "../../src/application/use-cases/shared/sincronizar-escopo.js";
import type { RelacionamentoGrafo } from "../../src/domain/entities/grafo.js";

const baseRel = {
  tabelaOrigem: "receber",
  colunaOrigem: "codcli",
  tabelaDestino: "cliente",
  colunaDestino: "codcli",
  pares: [{ colunaOrigem: "codcli", colunaDestino: "codcli" }],
  tipoJoin: "inner",
};

describe("uniaoEscopos e overlay de cardinalidade", () => {
  it("não apaga cardinalidade quando o JOIN novo vem sem ela", () => {
    const comCard = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: { receber: ["codcli"], cliente: ["codcli"] },
      relacionamentos: [{ ...baseRel, cardinalidade: "N:1" }],
      pacoteVersao: PACOTE_VERSAO_ATUAL,
    });
    const semCard = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: { receber: ["codcli"], cliente: ["codcli"] },
      relacionamentos: [baseRel],
      pacoteVersao: PACOTE_VERSAO_ATUAL,
    });
    const uniao = uniaoEscopos([comCard, semCard]);
    expect(uniao.relacionamentos[0]?.cardinalidade).toBe("N:1");
  });

  it("copia cardinalidade do grafo para o pacote", () => {
    const escopo = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: { receber: ["codcli"], cliente: ["codcli"] },
      relacionamentos: [baseRel],
    });
    const grafoRels: RelacionamentoGrafo[] = [
      {
        id: "r1",
        acessoId: "a",
        tabelaOrigemId: "t1",
        colunaOrigem: "codcli",
        tabelaDestinoId: "t2",
        colunaDestino: "codcli",
        pares: [{ colunaOrigem: "codcli", colunaDestino: "codcli" }],
        paresFingerprint: "codcli=codcli",
        tipoJoin: "inner",
        cardinalidade: "N:1",
        descricao: null,
        escopoValidacao: null,
        origem: "validado_execucao",
        status: "vigente",
        autorUsuarioId: null,
      },
    ];
    const nomeById = new Map([
      ["t1", "receber"],
      ["t2", "cliente"],
    ]);
    const overlay = overlayCardinalidadeDoGrafo(escopo, grafoRels, nomeById);
    expect(overlay.relacionamentos[0]?.cardinalidade).toBe("N:1");
  });
});
