import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type {
  EscopoCatalogo,
  Fonte,
  FonteColuna,
  FonteDetalhe,
  FonteRelacionamento,
  FonteSqlVariant,
  NovaFonteInput,
  RegraNegocio,
  Sinonimo,
} from "../../../domain/entities/fonte.js";
import {
  escolherFonteComPrecedencia,
  dedupeFontesComPrecedencia,
} from "../../../domain/entities/fonte.js";
import type {
  CatalogoRepositoryPort,
  SeedApplyResult,
} from "../../../domain/ports/catalogo-repository.port.js";
import { catalogoSeed, orientacoesBase } from "../seed/catalogo.seed.js";
import { id, visivel } from "./memory-util.js";

export class InMemoryCatalogoRepository implements CatalogoRepositoryPort {
  fontes: Fonte[] = [];
  variants: FonteSqlVariant[] = [];
  colunas: FonteColuna[] = [];
  rels: FonteRelacionamento[] = [];
  regras: RegraNegocio[] = [];
  sinonimos: Sinonimo[] = [];

  async seedIfEmpty(): Promise<void> {
    if (this.fontes.some((fonte) => fonte.mcpAccountId === null)) {
      return;
    }
    await this.aplicarSeed();
  }

  async aplicarSeed(): Promise<SeedApplyResult> {
    const seedSlugs = new Set(catalogoSeed.map((seed) => seed.slug));
    const globais = this.fontes.filter((fonte) => fonte.mcpAccountId === null);
    const existingBySlug = new Map(globais.map((fonte) => [fonte.slug, fonte]));
    let criadas = 0;
    let atualizadas = 0;
    const slugToId = new Map<string, string>();

    for (const seed of catalogoSeed) {
      const existing = existingBySlug.get(seed.slug);
      let fonte: Fonte;
      if (existing) {
        fonte = {
          ...existing,
          nome: seed.nome,
          descricao: seed.descricao,
          ativo: true,
        };
        this.fontes = this.fontes.map((row) => (row.id === existing.id ? fonte : row));
        atualizadas += 1;
      } else {
        fonte = {
          id: id(),
          slug: seed.slug,
          nome: seed.nome,
          descricao: seed.descricao,
          ativo: true,
          mcpAccountId: null,
          agentId: null,
        };
        this.fontes.push(fonte);
        criadas += 1;
      }
      slugToId.set(seed.slug, fonte.id);

      this.variants = this.variants.filter((row) => row.fonteId !== fonte.id);
      this.colunas = this.colunas.filter((row) => row.fonteId !== fonte.id);
      this.regras = this.regras.filter((row) => row.fonteId !== fonte.id);
      this.sinonimos = this.sinonimos.filter((row) => row.fonteId !== fonte.id);

      for (const [dialeto, sql] of Object.entries(seed.sql) as [
        Dialeto,
        { sqlBase: string; observacoes: string },
      ][]) {
        this.variants.push({
          id: id(),
          fonteId: fonte.id,
          dialeto,
          sqlBase: sql.sqlBase,
          observacoesDialeto: sql.observacoes,
        });
      }
      for (const col of seed.colunas) {
        this.colunas.push({
          id: id(),
          fonteId: fonte.id,
          nome: col.nome,
          tipo: col.tipo,
          descricao: col.descricao,
          regraNegocio: col.regraNegocio ?? null,
          ordem: col.ordem,
        });
      }
      for (const regra of seed.regras) {
        this.regras.push({
          id: id(),
          fonteId: fonte.id,
          nome: regra.nome,
          descricao: regra.descricao,
          expressao: regra.expressao ?? null,
        });
      }
      for (const sin of seed.sinonimos) {
        this.sinonimos.push({
          id: id(),
          fonteId: fonte.id,
          termo: sin.termo,
          descricao: sin.descricao,
        });
      }
    }

    let desativadas = 0;
    this.fontes = this.fontes.map((fonte) => {
      if (fonte.mcpAccountId !== null || seedSlugs.has(fonte.slug) || !fonte.ativo) {
        return fonte;
      }
      desativadas += 1;
      return { ...fonte, ativo: false };
    });

    const seedIds = new Set(slugToId.values());
    this.rels = this.rels.filter((rel) => !seedIds.has(rel.fonteOrigemId));
    for (const seed of catalogoSeed) {
      const origemId = slugToId.get(seed.slug);
      if (!origemId) {
        continue;
      }
      for (const rel of seed.relacionamentos) {
        const destinoId = slugToId.get(rel.fonteDestinoSlug);
        if (!destinoId) {
          continue;
        }
        this.rels.push({
          id: id(),
          fonteOrigemId: origemId,
          colunaOrigem: rel.colunaOrigem,
          destino: {
            tipo: "fonte",
            id: destinoId,
            slug: rel.fonteDestinoSlug,
          },
          colunaDestino: rel.colunaDestino,
          tipoJoin: rel.tipoJoin,
          descricao: rel.descricao,
        });
      }
    }

    return { criadas, atualizadas, desativadas };
  }

  async listFontesAtivas(escopo: EscopoCatalogo): Promise<readonly Fonte[]> {
    return dedupeFontesComPrecedencia(
      this.fontes.filter((fonte) => fonte.ativo && visivel(fonte, escopo)),
    );
  }

  async findFonteBySlug(slug: string, escopo: EscopoCatalogo): Promise<Fonte | null> {
    return escolherFonteComPrecedencia(
      this.fontes.filter((fonte) => fonte.slug === slug && visivel(fonte, escopo)),
    );
  }

  async obterDetalhe(
    slug: string,
    dialeto: Dialeto,
    escopo: EscopoCatalogo,
  ): Promise<FonteDetalhe | null> {
    const fonte = await this.findFonteBySlug(slug, escopo);
    if (!fonte?.ativo) {
      return null;
    }
    const variant = this.variants.find((v) => v.fonteId === fonte.id && v.dialeto === dialeto);
    if (!variant) {
      return null;
    }
    return {
      fonte,
      dialeto,
      sqlBase: variant.sqlBase,
      observacoesDialeto: variant.observacoesDialeto,
      colunas: this.colunas.filter((c) => c.fonteId === fonte.id).sort((a, b) => a.ordem - b.ordem),
      relacionamentos: this.rels.filter((r) => r.fonteOrigemId === fonte.id),
      regras: this.regras.filter((r) => r.fonteId === fonte.id),
      sinonimos: this.sinonimos.filter((s) => s.fonteId === fonte.id),
      orientacoesIa: orientacoesBase(dialeto, variant.observacoesDialeto),
    };
  }

  async criarFonte(input: NovaFonteInput): Promise<Fonte> {
    const fonte: Fonte = {
      id: id(),
      slug: input.slug,
      nome: input.nome,
      descricao: input.descricao,
      ativo: true,
      mcpAccountId: input.escopo.mcpAccountId,
      agentId: input.escopo.agentId,
    };
    this.fontes.push(fonte);
    this.persistirFilhos(fonte.id, input);
    return fonte;
  }

  async substituirFonte(input: NovaFonteInput): Promise<Fonte | null> {
    const existing = this.fontes.find(
      (fonte) =>
        fonte.slug === input.slug &&
        fonte.mcpAccountId === input.escopo.mcpAccountId &&
        fonte.agentId === input.escopo.agentId,
    );
    if (!existing) {
      return null;
    }
    const next: Fonte = {
      ...existing,
      nome: input.nome,
      descricao: input.descricao,
      ativo: true,
    };
    this.fontes = this.fontes.map((row) => (row.id === existing.id ? next : row));
    this.persistirFilhos(existing.id, input);
    return next;
  }

  async adicionarRelacionamento(
    fonteId: string,
    relacionamento: NovaFonteInput["relacionamentos"][number],
  ): Promise<void> {
    this.rels.push({
      id: id(),
      fonteOrigemId: fonteId,
      colunaOrigem: relacionamento.colunaOrigem,
      destino:
        relacionamento.destino.tipo === "fonte"
          ? {
              tipo: "fonte",
              id: relacionamento.destino.fonteDestinoId,
              slug: relacionamento.destino.fonteDestinoSlug,
            }
          : { tipo: "tabela", nome: relacionamento.destino.tabelaDestino },
      colunaDestino: relacionamento.colunaDestino,
      tipoJoin: relacionamento.tipoJoin,
      descricao: relacionamento.descricao,
    });
  }

  async removerFonte(slug: string, escopo: EscopoCatalogo): Promise<boolean> {
    const existing = this.fontes.find(
      (fonte) =>
        fonte.slug === slug &&
        fonte.mcpAccountId === escopo.mcpAccountId &&
        fonte.agentId === escopo.agentId,
    );
    if (!existing) {
      return false;
    }
    this.fontes = this.fontes.filter((fonte) => fonte.id !== existing.id);
    this.variants = this.variants.filter((row) => row.fonteId !== existing.id);
    this.colunas = this.colunas.filter((row) => row.fonteId !== existing.id);
    this.regras = this.regras.filter((row) => row.fonteId !== existing.id);
    this.sinonimos = this.sinonimos.filter((row) => row.fonteId !== existing.id);
    this.rels = this.rels.filter((rel) => {
      if (rel.fonteOrigemId === existing.id) {
        return false;
      }
      return rel.destino.tipo !== "fonte" || rel.destino.id !== existing.id;
    });
    return true;
  }

  private persistirFilhos(fonteId: string, input: NovaFonteInput): void {
    this.variants = this.variants.filter((row) => row.fonteId !== fonteId);
    this.colunas = this.colunas.filter((row) => row.fonteId !== fonteId);
    this.regras = this.regras.filter((row) => row.fonteId !== fonteId);
    this.sinonimos = this.sinonimos.filter((row) => row.fonteId !== fonteId);
    this.rels = this.rels.filter((rel) => rel.fonteOrigemId !== fonteId);
    this.variants.push({
      id: id(),
      fonteId,
      dialeto: input.dialeto,
      sqlBase: input.sqlBase,
      observacoesDialeto: input.observacoesDialeto,
    });
    for (const col of input.colunas) {
      this.colunas.push({
        id: id(),
        fonteId,
        nome: col.nome,
        tipo: col.tipo,
        descricao: col.descricao,
        regraNegocio: col.regraNegocio,
        ordem: col.ordem,
      });
    }
    for (const regra of input.regras) {
      this.regras.push({
        id: id(),
        fonteId,
        nome: regra.nome,
        descricao: regra.descricao,
        expressao: regra.expressao,
      });
    }
    for (const sin of input.sinonimos) {
      this.sinonimos.push({
        id: id(),
        fonteId,
        termo: sin.termo,
        descricao: sin.descricao,
      });
    }
    for (const rel of input.relacionamentos) {
      this.rels.push({
        id: id(),
        fonteOrigemId: fonteId,
        colunaOrigem: rel.colunaOrigem,
        destino:
          rel.destino.tipo === "fonte"
            ? {
                tipo: "fonte",
                id: rel.destino.fonteDestinoId,
                slug: rel.destino.fonteDestinoSlug,
              }
            : { tipo: "tabela", nome: rel.destino.tabelaDestino },
        colunaDestino: rel.colunaDestino,
        tipoJoin: rel.tipoJoin,
        descricao: rel.descricao,
      });
    }
  }
}
