import { describe, expect, it } from "vitest";
import { PACOTE_VERSAO_ATUAL } from "../../src/domain/entities/escopo.js";
import { escopoFromSqlModelo } from "../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../src/application/use-cases/shared/sql-modelo.js";
import {
  associarAnotacaoASkill,
  associarConsultaASkills,
  reconstruirEscopoOuErro,
  sqlCabeNoEscopo,
} from "../../src/application/use-cases/shared/backfill-pacote.js";

describe("backfill de pacote", () => {
  it("reconstrói escopo físico e recusa SQL inválido", () => {
    const ok = reconstruirEscopoOuErro(
      "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.escopo.tabelas.map((item) => item.toLowerCase())).toContain("produto");
      expect(
        ok.escopo.colunasPorTabela.produto ?? ok.escopo.colunasPorTabela.PRODUTO,
      ).toBeDefined();
      expect(ok.escopo.pacoteVersao).toBe(PACOTE_VERSAO_ATUAL);
    }
    const bad = reconstruirEscopoOuErro("DELETE FROM produto");
    expect(bad.ok).toBe(false);
  });

  it("associa consulta à skill cujo escopo contém o SQL e inativa órfã", () => {
    const escopo = escopoFromSqlModelo(
      parseSqlModelo("SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0"),
    );
    const fit = associarConsultaASkills(
      "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 1",
      "sybase",
      [{ id: "s1", escopo }],
    );
    expect(fit.inativa).toBe(false);
    expect(fit.skillIds).toEqual(["s1"]);
    const miss = associarConsultaASkills(
      "SELECT f.valor AS valor FROM fatura f WHERE f.ano = 1",
      "sybase",
      [{ id: "s1", escopo }],
    );
    expect(miss.inativa).toBe(true);
    expect(miss.skillIds).toEqual([]);
  });

  it("associa anotação quando uma única skill tem a tabela", () => {
    const escopo = escopoFromSqlModelo(
      parseSqlModelo("SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0"),
    );
    const id = associarAnotacaoASkill(
      { id: "a1", acessoId: "ag", tabelaId: "t1", skillId: null },
      "produto",
      [{ id: "s1", escopo }],
    );
    expect(id).toBe("s1");
    expect(
      associarAnotacaoASkill({ id: "a1", acessoId: "ag", tabelaId: null, skillId: null }, null, [
        { id: "s1", escopo },
      ]),
    ).toBeNull();
  });

  it("sqlCabeNoEscopo é fail-closed", () => {
    const escopo = escopoFromSqlModelo(
      parseSqlModelo("SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0"),
    );
    expect(sqlCabeNoEscopo("SELECT p.codprod FROM produto p WHERE 1=1", "sybase", escopo)).toBe(
      true,
    );
    expect(sqlCabeNoEscopo("SELECT f.valor FROM fatura f WHERE 1=1", "sybase", escopo)).toBe(false);
  });
});
