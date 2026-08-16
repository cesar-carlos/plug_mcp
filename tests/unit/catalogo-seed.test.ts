import { describe, expect, it } from "vitest";
import { InMemoryCatalogoRepository } from "../../src/infrastructure/persistence/memory/memory-repos.js";
import { catalogoSeed } from "../../src/infrastructure/persistence/seed/catalogo.seed.js";

describe("aplicarSeed", () => {
  it("é idempotente: segunda execução não duplica filhos", async () => {
    const catalogo = new InMemoryCatalogoRepository();
    const first = await catalogo.aplicarSeed();
    expect(first.criadas).toBe(catalogoSeed.length);
    const variantCount = catalogo.variants.length;
    const second = await catalogo.aplicarSeed();
    expect(second.criadas).toBe(0);
    expect(second.atualizadas).toBe(catalogoSeed.length);
    expect(catalogo.variants).toHaveLength(variantCount);
    expect(catalogo.fontes.filter((f) => f.slug === "vendas")).toHaveLength(1);
  });

  it("restaura nome e SQL a partir do seed", async () => {
    const catalogo = new InMemoryCatalogoRepository();
    await catalogo.aplicarSeed();
    const vendas = catalogo.fontes.find((f) => f.slug === "vendas");
    expect(vendas).toBeTruthy();
    catalogo.fontes = catalogo.fontes.map((f) =>
      f.slug === "vendas" ? { ...f, nome: "alterado" } : f,
    );
    await catalogo.aplicarSeed();
    expect(catalogo.fontes.find((f) => f.slug === "vendas")?.nome).toBe("Vendas");
  });

  it("desativa fontes que saíram do seed", async () => {
    const catalogo = new InMemoryCatalogoRepository();
    await catalogo.aplicarSeed();
    catalogo.fontes.push({
      id: crypto.randomUUID(),
      slug: "legado",
      nome: "Legado",
      descricao: "fora do seed",
      ativo: true,
      mcpAccountId: null,
      agentId: null,
    });
    const result = await catalogo.aplicarSeed();
    expect(result.desativadas).toBe(1);
    expect(catalogo.fontes.find((f) => f.slug === "legado")?.ativo).toBe(false);
    const ativas = await catalogo.listFontesAtivas({
      mcpAccountId: "11111111-1111-4111-8111-111111111111",
      agentId: "3183a9f2-429b-46d6-a339-3580e5e5cb31",
    });
    expect(ativas.map((f) => f.slug).sort()).toEqual(["clientes", "produtos", "vendas"]);
  });

  it("não desativa fontes de usuário", async () => {
    const catalogo = new InMemoryCatalogoRepository();
    await catalogo.aplicarSeed();
    catalogo.fontes.push({
      id: crypto.randomUUID(),
      slug: "contas_pagar",
      nome: "Contas a pagar",
      descricao: "títulos do usuário",
      ativo: true,
      mcpAccountId: "11111111-1111-4111-8111-111111111111",
      agentId: "3183a9f2-429b-46d6-a339-3580e5e5cb31",
    });
    const result = await catalogo.aplicarSeed();
    expect(result.desativadas).toBe(0);
    expect(catalogo.fontes.find((f) => f.slug === "contas_pagar")?.ativo).toBe(true);
  });
});
