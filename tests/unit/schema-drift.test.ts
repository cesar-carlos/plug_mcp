import { describe, expect, it } from "vitest";
import {
  aplicarDerivaEsquema,
  aplicarDerivaTabelaNoGrafo,
  assinaturaTabela,
  derivaQuebraPacote,
} from "../../src/application/use-cases/shared/schema-drift.js";
import {
  InMemoryGrafoRepository,
  InMemorySkillRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { MemoryQueryResultCache } from "../../src/infrastructure/cache/query-result-cache.js";

const acessoId = "11111111-1111-4111-8111-111111111111";

describe("deriva de esquema", () => {
  it("rebaixa só skills da tabela e invalida cache", async () => {
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const cache = new MemoryQueryResultCache();
    await cache.set(`mcp:query:acesso:${acessoId}:abc`, "{}", 60_000);
    await cache.set("mcp:query:acesso:other-acesso:xyz", "{}", 60_000);
    const receber = await skills.create({
      acessoId: acessoId,
      slug: "receber",
      nome: "Receber",
      descricao: "t",
      sqlModelo: "SELECT r.valor FROM receber r WHERE r.valor > 0",
      escopo: {
        tabelas: ["receber"],
        colunasPorTabela: { receber: ["valor"] },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: ["valor"],
        metricasSaida: [],
        pacoteVersao: 2,
      },
      autorUsuarioId: null,
    });
    await skills.setStatus(receber.id, "publicada");
    const outra = await skills.create({
      acessoId: acessoId,
      slug: "produto",
      nome: "Produto",
      descricao: "t",
      sqlModelo: "SELECT p.codprod FROM produto p WHERE p.codprod > 0",
      escopo: {
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["codprod"] },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: ["codprod"],
        metricasSaida: [],
        pacoteVersao: 2,
      },
      autorUsuarioId: null,
    });
    await skills.setStatus(outra.id, "publicada");
    const primeira = assinaturaTabela({
      colunas: [{ nome: "valor", tipo: "numeric", nullable: false }],
      relacionamentos: [],
    });
    await aplicarDerivaEsquema({
      grafo,
      skills,
      cache,
      acessoId: acessoId,
      tabelaNome: "receber",
      assinatura: primeira,
    });
    expect((await skills.findById(receber.id))?.status).toBe("publicada");
    const segunda = assinaturaTabela({
      colunas: [{ nome: "valor", tipo: "varchar", nullable: false }],
      relacionamentos: [],
    });
    const result = await aplicarDerivaEsquema({
      grafo,
      skills,
      cache,
      acessoId: acessoId,
      tabelaNome: "receber",
      assinatura: segunda,
    });
    expect(result.drifted).toBe(true);
    expect((await skills.findById(receber.id))?.status).toBe("rascunho_revalidacao");
    expect((await skills.findById(outra.id))?.status).toBe("publicada");
    expect(await cache.get(`mcp:query:acesso:${acessoId}:abc`)).toBeNull();
    expect(await cache.get("mcp:query:acesso:other-acesso:xyz")).not.toBeNull();
  });

  it("tipo uuid→date com papel data não quebra o pacote; remoção sim", () => {
    const anterior = assinaturaTabela({
      colunas: [
        { nome: "DataLancamento", tipo: "uniqueidentifier", nullable: true },
        { nome: "lixo", tipo: "varchar", nullable: true },
      ],
      relacionamentos: [],
    });
    const atual = assinaturaTabela({
      colunas: [{ nome: "DataLancamento", tipo: "date", nullable: true }],
      relacionamentos: [],
    });
    expect(
      derivaQuebraPacote({
        anterior,
        atual,
        colunasPacote: [{ nome: "DataLancamento", tipo: "date", papel: "data" }],
      }),
    ).toBe(false);
    const semColuna = assinaturaTabela({
      colunas: [{ nome: "outra", tipo: "int", nullable: false }],
      relacionamentos: [],
    });
    expect(
      derivaQuebraPacote({
        anterior,
        atual: semColuna,
        colunasPacote: [{ nome: "DataLancamento", tipo: "date", papel: "data" }],
      }),
    ).toBe(true);
  });

  it("remap de tipo de data no grafo não rebaixa skill validada", async () => {
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const { tabela } = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "ContaReceber",
      origem: "validado_execucao",
      autorUsuarioId: null,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: tabela.id,
      nome: "DataLancamento",
      tipo: "uniqueidentifier",
      papel: "data",
      origem: "validado_execucao",
      autorUsuarioId: null,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: tabela.id,
      nome: "CatalogoLargo",
      tipo: "varchar",
      origem: "validado_execucao",
      autorUsuarioId: null,
    });
    const skill = await skills.create({
      acessoId: acessoId,
      slug: "receber",
      nome: "Receber",
      descricao: "t",
      sqlModelo: "SELECT r.DataLancamento FROM ContaReceber r WHERE r.DataLancamento IS NOT NULL",
      escopo: {
        tabelas: ["ContaReceber"],
        colunasPorTabela: { ContaReceber: ["DataLancamento"] },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: ["DataLancamento"],
        metricasSaida: [],
        pacoteVersao: 2,
      },
      autorUsuarioId: null,
    });
    await skills.setStatus(skill.id, "validada");
    await aplicarDerivaTabelaNoGrafo({ grafo, skills, acessoId: acessoId, tabelaNome: "ContaReceber" });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: tabela.id,
      nome: "DataLancamento",
      tipo: "date",
      papel: "data",
      origem: "validado_execucao",
      autorUsuarioId: null,
    });
    const result = await aplicarDerivaTabelaNoGrafo({
      grafo,
      skills,
      acessoId: acessoId,
      tabelaNome: "ContaReceber",
    });
    expect(result.drifted).toBe(false);
    expect((await skills.findById(skill.id))?.status).toBe("validada");
  });
});
