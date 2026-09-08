import { describe, expect, it } from "vitest";
import { compilarConsultaSemantica } from "../../src/application/use-cases/shared/compilar-consulta-semantica.js";
import { parseConsultaSemantica } from "../../src/domain/entities/consulta-semantica.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { CONSULTA_INTELIGENTE_FIXTURE } from "../fixtures/consulta-inteligente.fixture.js";

const escopo = parseEscopoSkill(CONSULTA_INTELIGENTE_FIXTURE.escopo);

const next = (seed: number): number => (seed * 1_664_525 + 1_013_904_223) >>> 0;

describe("propriedades determinísticas da consulta semântica", () => {
  it("preserva as invariantes de modo sob combinações geradas", () => {
    let seed = 17;
    for (let index = 0; index < 256; index += 1) {
      seed = next(seed);
      const injectaMetrica = (seed & 1) === 1;
      const injectaHaving = (seed & 2) === 2;
      const dimensoes = (seed & 4) === 4 ? ["empresa"] : [];
      const parsed = parseConsultaSemantica({
        versao: 2,
        modo: "listagem",
        dimensoes,
        ...(injectaMetrica ? { metricas: ["total"] } : {}),
        ...(injectaHaving ? { having: [{ metrica: "total", op: ">", param: "piso" }] } : {}),
      });

      if (injectaMetrica || injectaHaving || dimensoes.length === 0) {
        expect(parsed).toBeNull();
      } else {
        expect(parsed).toMatchObject({ versao: 2, modo: "listagem", dimensoes: ["empresa"] });
      }
    }
  });

  it("compila apenas a superfície certificada e recusa mutações de aliases", () => {
    let seed = 41;
    for (let index = 0; index < 512; index += 1) {
      seed = next(seed);
      const invalidaMetrica = (seed & 1) === 1;
      const invalidaDimensao = (seed & 2) === 2;
      const consulta = parseConsultaSemantica({
        versao: 2,
        modo: "agregacao",
        metricas: [invalidaMetrica ? `m_${seed}` : "total"],
        dimensoes: [invalidaDimensao ? `d_${seed}` : "empresa"],
      });
      expect(consulta).not.toBeNull();
      if (invalidaMetrica || invalidaDimensao) {
        expect(() => compilarConsultaSemantica(consulta!, escopo)).toThrow(
          expect.objectContaining({ code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO }),
        );
      } else {
        for (const dialeto of ["postgres", "mssql", "firebird", "sybase"] as const) {
          const compiled = compilarConsultaSemantica(consulta!, escopo, undefined, { dialeto });
          expect(compiled.sql).toMatch(/^SELECT /i);
          expect(compiled.sql).not.toMatch(/m_\d+|d_\d+/i);
          expect(compiled.sql).not.toMatch(/\bUNION\b|SELECT\s+\*/i);
        }
      }
    }
  });

  it("mantém os exemplos sintéticos compiláveis sem dados de ERP", () => {
    for (const consulta of [
      CONSULTA_INTELIGENTE_FIXTURE.agregacaoV2,
      CONSULTA_INTELIGENTE_FIXTURE.listagemV2,
    ]) {
      const parsed = parseConsultaSemantica(consulta);
      expect(parsed).not.toBeNull();
      expect(
        compilarConsultaSemantica(parsed!, escopo, undefined, { dialeto: "postgres" }).sql,
      ).toMatch(/^SELECT /i);
    }
  });
});
