import { describe, expect, it } from "vitest";
import { parseGovernancaConhecimento } from "../../src/application/use-cases/skills.js";
import { InMemoryAnotacaoGrafoRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";

describe("governança de conhecimento", () => {
  it("aceita origem, responsável e intervalo inclusivo", () => {
    expect(
      parseGovernancaConhecimento({
        fonteTipo: "documento",
        fonteReferencia: "manual-erp-v3",
        responsavel: "time-financeiro",
        validadoEm: "2026-09-01",
        vigenteDe: "2026-09-01",
        vigenteAte: "2026-12-31",
        revisarEm: "2026-09-15",
        periodoRevisaoDias: 30,
        status: "vigente",
      }),
    ).toEqual({
      fonteTipo: "documento",
      fonteReferencia: "manual-erp-v3",
      responsavel: "time-financeiro",
      validadoEm: new Date("2026-09-01"),
      vigenteDe: "2026-09-01",
      vigenteAte: "2026-12-31",
      revisarEm: "2026-09-15",
      periodoRevisaoDias: 30,
      status: "vigente",
    });
  });

  it("recusa intervalo invertido e texto com aparência de segredo", () => {
    expect(() =>
      parseGovernancaConhecimento({ vigenteDe: "2026-12-31", vigenteAte: "2026-01-01" }),
    ).toThrow();
    expect(() =>
      parseGovernancaConhecimento({ fonteReferencia: "client_token=super-secret-value" }),
    ).toThrow();
    expect(() => parseGovernancaConhecimento({ periodoRevisaoDias: 0 })).toThrow();
  });

  it("mantém legado ativo e exclui obsoleto/futuro/expirado no filtro temporal", async () => {
    const repo = new InMemoryAnotacaoGrafoRepository();
    await repo.create({
      acessoId: "acesso-1",
      tabelaId: null,
      tipo: "uso",
      titulo: "legado",
      texto: "regra antiga sem governança",
      autorUsuarioId: null,
    });
    await repo.create({
      acessoId: "acesso-1",
      tabelaId: null,
      tipo: "uso",
      titulo: "obsoleta",
      texto: "não orientar",
      autorUsuarioId: null,
      governanca: { status: "obsoleta" },
    });
    await repo.create({
      acessoId: "acesso-1",
      tabelaId: null,
      tipo: "uso",
      titulo: "futura",
      texto: "ainda não vigente",
      autorUsuarioId: null,
      governanca: { vigenteDe: "2099-01-01" },
    });
    await repo.create({
      acessoId: "acesso-1",
      tabelaId: null,
      tipo: "uso",
      titulo: "expirada",
      texto: "já expirou",
      autorUsuarioId: null,
      governanca: { vigenteAte: "2000-01-01" },
    });

    const ativas = await repo.list("acesso-1", undefined, undefined, {
      ativasEm: new Date("2026-09-07T12:00:00Z"),
    });
    expect(ativas.map((item) => item.titulo)).toEqual(["legado"]);
  });
});
