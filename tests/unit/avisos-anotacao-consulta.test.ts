import { describe, expect, it } from "vitest";
import {
  anotacaoEntraNoEnvelopeConsulta,
  AVISOS_REGRA_TETO,
  coletarAvisosAnotacaoConsulta,
} from "../../src/application/use-cases/shared/avisos-anotacao-consulta.js";
import type { AnotacaoGrafo } from "../../src/domain/entities/skill.js";

const agora = new Date();

const nota = (
  patch: Partial<AnotacaoGrafo> & Pick<AnotacaoGrafo, "id" | "tipo" | "titulo">,
): AnotacaoGrafo => ({
  agentId: "agent",
  tabelaId: null,
  skillId: null,
  texto: "corpo",
  autorUsuarioId: "u1",
  createdAt: agora,
  updatedAt: agora,
  ...patch,
});

describe("coletarAvisosAnotacaoConsulta", () => {
  const pagar = "skill-pagar";
  const receber = "skill-receber";
  const tabelaReceber = "tab-receber";

  it("exclui regra de outra skill, global de processo e tabela fora do SQL", () => {
    const avisos = coletarAvisosAnotacaoConsulta({
      notas: [
        nota({
          id: "1",
          tipo: "regra",
          titulo: "PK ContaReceber",
          texto: "CodEmpresa+CodFilial",
          skillId: receber,
        }),
        nota({
          id: "2",
          tipo: "regra",
          titulo: "PK ContaPagar",
          texto: "CodContaPagar",
          skillId: pagar,
        }),
        nota({
          id: "3",
          tipo: "regra",
          titulo: "Conhecimento incremental e cruzamento",
          texto: "Amostra limitada para treinamento",
        }),
        nota({
          id: "4",
          tipo: "regra",
          titulo: "Joins 1:1 receber",
          texto: "Cliente, TipoTitulo",
          tabelaId: tabelaReceber,
        }),
        nota({
          id: "5",
          tipo: "metrica",
          titulo: "FIN-02",
          texto: "saldo a pagar",
          skillId: pagar,
        }),
      ],
      skillIds: new Set([pagar]),
      tabelasSql: new Set(["contapagar"]),
      tabelaNomePorId: new Map([[tabelaReceber, "ContaReceber"]]),
    });
    expect(avisos.map((item) => item.message)).toEqual([
      "FIN-02: saldo a pagar",
      "PK ContaPagar: CodContaPagar",
    ]);
    expect(avisos.some((item) => /ContaReceber|cruzamento|treinamento/i.test(item.message))).toBe(
      false,
    );
  });

  it("inclui anotação da tabela citada no SQL mesmo sem skillId", () => {
    expect(
      anotacaoEntraNoEnvelopeConsulta({
        nota: nota({
          id: "t",
          tipo: "regra",
          titulo: "PK",
          tabelaId: tabelaReceber,
        }),
        skillIds: new Set([pagar]),
        tabelasSql: new Set(["contareceber"]),
        tabelaNomePorId: new Map([[tabelaReceber, "ContaReceber"]]),
      }),
    ).toBe(true);
  });

  it("recusa regra da skill com tabelaId de outra tabela", () => {
    expect(
      anotacaoEntraNoEnvelopeConsulta({
        nota: nota({
          id: "x",
          tipo: "regra",
          titulo: "PK ContaReceber",
          texto: "CodContaReceber",
          skillId: pagar,
          tabelaId: tabelaReceber,
        }),
        skillIds: new Set([pagar]),
        tabelasSql: new Set(["contapagar"]),
        tabelaNomePorId: new Map([[tabelaReceber, "ContaReceber"]]),
      }),
    ).toBe(false);
  });

  it("no teto de REGRA prefere as que citam a tabela do SQL", () => {
    const avisos = coletarAvisosAnotacaoConsulta({
      notas: [
        nota({
          id: "r0",
          tipo: "regra",
          titulo: "PK ContaReceber",
          texto: "CodEmpresa+CodFilial+CodContaReceber",
          skillId: pagar,
        }),
        nota({
          id: "r1",
          tipo: "regra",
          titulo: "PK ContaPagar",
          texto: "CodEmpresa+CodFilial+CodContaPagar",
          skillId: pagar,
        }),
        nota({
          id: "r2",
          tipo: "regra",
          titulo: "Join ContaPagar",
          texto: "ContaPagar com TipoTitulo",
          skillId: pagar,
        }),
        nota({
          id: "r3",
          tipo: "regra",
          titulo: "Filtro ContaPagar",
          texto: "Situacao da ContaPagar",
          skillId: pagar,
        }),
      ],
      skillIds: new Set([pagar]),
      tabelasSql: new Set(["contapagar"]),
      tabelaNomePorId: new Map([[tabelaReceber, "ContaReceber"]]),
      aliasesSql: ["valor"],
    });
    const titulos = avisos.filter((item) => item.code === "REGRA").map((item) => item.message);
    expect(titulos).toHaveLength(AVISOS_REGRA_TETO);
    expect(titulos.every((item) => /ContaPagar/i.test(item))).toBe(true);
    expect(titulos.some((item) => /ContaReceber/i.test(item))).toBe(false);
  });

  it("capara REGRA e preserva METRICA", () => {
    const regras = Array.from({ length: AVISOS_REGRA_TETO + 2 }, (_, i) =>
      nota({
        id: `r${i}`,
        tipo: "regra",
        titulo: `Regra ${i}`,
        texto: `texto ${i}`,
        skillId: pagar,
      }),
    );
    const avisos = coletarAvisosAnotacaoConsulta({
      notas: [
        nota({
          id: "m",
          tipo: "metrica",
          titulo: "KPI",
          texto: "soma",
          skillId: pagar,
        }),
        ...regras,
      ],
      skillIds: new Set([pagar]),
      tabelasSql: new Set(["contapagar"]),
      tabelaNomePorId: new Map(),
    });
    expect(avisos.filter((item) => item.code === "METRICA")).toHaveLength(1);
    expect(avisos.filter((item) => item.code === "REGRA")).toHaveLength(AVISOS_REGRA_TETO);
  });
});
