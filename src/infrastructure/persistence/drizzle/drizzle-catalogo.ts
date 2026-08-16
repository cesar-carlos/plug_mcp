import { eq, and, inArray, or, isNull } from "drizzle-orm";
import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type {
  EscopoCatalogo,
  Fonte,
  FonteDetalhe,
  FonteRelacionamento,
  NovaFonteInput,
  NovaFonteRelacionamentoInput,
} from "../../../domain/entities/fonte.js";
import {
  escolherFonteComPrecedencia,
  dedupeFontesComPrecedencia,
} from "../../../domain/entities/fonte.js";
import type {
  CatalogoRepositoryPort,
  SeedApplyResult,
} from "../../../domain/ports/catalogo-repository.port.js";
import * as schema from "../schema.js";
import { catalogoSeed, orientacoesBase } from "../seed/catalogo.seed.js";
import type { Db } from "./db.js";

const mapFonte = (row: typeof schema.fonte.$inferSelect): Fonte => ({
  id: row.id,
  slug: row.slug,
  nome: row.nome,
  descricao: row.descricao,
  ativo: row.ativo,
  mcpAccountId: row.mcpAccountId,
  agentId: row.agentId,
});

const mapRelacionamento = (
  row: typeof schema.fonteRelacionamento.$inferSelect,
  slugById: Map<string, string>,
): FonteRelacionamento => {
  if (row.fonteDestinoId) {
    return {
      id: row.id,
      fonteOrigemId: row.fonteOrigemId,
      colunaOrigem: row.colunaOrigem,
      destino: {
        tipo: "fonte",
        id: row.fonteDestinoId,
        slug: slugById.get(row.fonteDestinoId) ?? "",
      },
      colunaDestino: row.colunaDestino,
      tipoJoin: row.tipoJoin,
      descricao: row.descricao,
    };
  }
  return {
    id: row.id,
    fonteOrigemId: row.fonteOrigemId,
    colunaOrigem: row.colunaOrigem,
    destino: { tipo: "tabela", nome: row.tabelaDestino ?? "" },
    colunaDestino: row.colunaDestino,
    tipoJoin: row.tipoJoin,
    descricao: row.descricao,
  };
};

const valoresRelacionamento = (rel: NovaFonteRelacionamentoInput) => ({
  colunaOrigem: rel.colunaOrigem,
  fonteDestinoId: rel.destino.tipo === "fonte" ? rel.destino.fonteDestinoId : null,
  tabelaDestino: rel.destino.tipo === "tabela" ? rel.destino.tabelaDestino : null,
  colunaDestino: rel.colunaDestino,
  tipoJoin: rel.tipoJoin,
  descricao: rel.descricao,
});

const visivelNoEscopo = (escopo: EscopoCatalogo) =>
  or(
    isNull(schema.fonte.mcpAccountId),
    and(
      eq(schema.fonte.mcpAccountId, escopo.mcpAccountId),
      eq(schema.fonte.agentId, escopo.agentId),
    ),
  )!;

const persistirFilhos = async (db: Db, fonteId: string, input: NovaFonteInput): Promise<void> => {
  await db.delete(schema.fonteSqlVariant).where(eq(schema.fonteSqlVariant.fonteId, fonteId));
  await db.delete(schema.fonteColuna).where(eq(schema.fonteColuna.fonteId, fonteId));
  await db.delete(schema.regraNegocio).where(eq(schema.regraNegocio.fonteId, fonteId));
  await db.delete(schema.sinonimo).where(eq(schema.sinonimo.fonteId, fonteId));
  await db
    .delete(schema.fonteRelacionamento)
    .where(eq(schema.fonteRelacionamento.fonteOrigemId, fonteId));
  await db.insert(schema.fonteSqlVariant).values({
    fonteId,
    dialeto: input.dialeto,
    sqlBase: input.sqlBase,
    observacoesDialeto: input.observacoesDialeto,
  });
  for (const col of input.colunas) {
    await db.insert(schema.fonteColuna).values({
      fonteId,
      nome: col.nome,
      tipo: col.tipo,
      descricao: col.descricao,
      regraNegocio: col.regraNegocio,
      ordem: col.ordem,
    });
  }
  for (const regra of input.regras) {
    await db.insert(schema.regraNegocio).values({
      fonteId,
      nome: regra.nome,
      descricao: regra.descricao,
      expressao: regra.expressao,
    });
  }
  for (const sin of input.sinonimos) {
    await db.insert(schema.sinonimo).values({
      fonteId,
      termo: sin.termo,
      descricao: sin.descricao,
    });
  }
  for (const rel of input.relacionamentos) {
    await db.insert(schema.fonteRelacionamento).values({
      fonteOrigemId: fonteId,
      ...valoresRelacionamento(rel),
    });
  }
};

export class DrizzleCatalogoRepository implements CatalogoRepositoryPort {
  constructor(private readonly db: Db) {}

  async seedIfEmpty(): Promise<void> {
    const existing = await this.db
      .select({ id: schema.fonte.id })
      .from(schema.fonte)
      .where(isNull(schema.fonte.mcpAccountId))
      .limit(1);
    if (existing.length > 0) {
      return;
    }
    await this.aplicarSeed();
  }

  async aplicarSeed(): Promise<SeedApplyResult> {
    return this.db.transaction(async (tx) => {
      const existingBefore = await tx
        .select({ id: schema.fonte.id, slug: schema.fonte.slug, ativo: schema.fonte.ativo })
        .from(schema.fonte)
        .where(isNull(schema.fonte.mcpAccountId));
      const existingBySlug = new Map(existingBefore.map((row) => [row.slug, row]));
      const seedSlugs = new Set(catalogoSeed.map((seed) => seed.slug));
      const slugToId = new Map<string, string>();
      let criadas = 0;
      let atualizadas = 0;

      for (const seed of catalogoSeed) {
        const upserted = await tx
          .insert(schema.fonte)
          .values({ slug: seed.slug, nome: seed.nome, descricao: seed.descricao, ativo: true })
          .onConflictDoUpdate({
            target: schema.fonte.slug,
            targetWhere: isNull(schema.fonte.mcpAccountId),
            set: { nome: seed.nome, descricao: seed.descricao, ativo: true },
          })
          .returning();
        const fonteId = upserted[0]!.id;
        slugToId.set(seed.slug, fonteId);
        if (existingBySlug.has(seed.slug)) {
          atualizadas += 1;
        } else {
          criadas += 1;
        }

        await tx.delete(schema.fonteSqlVariant).where(eq(schema.fonteSqlVariant.fonteId, fonteId));
        await tx.delete(schema.fonteColuna).where(eq(schema.fonteColuna.fonteId, fonteId));
        await tx.delete(schema.regraNegocio).where(eq(schema.regraNegocio.fonteId, fonteId));
        await tx.delete(schema.sinonimo).where(eq(schema.sinonimo.fonteId, fonteId));

        for (const [dialeto, sql] of Object.entries(seed.sql) as [
          Dialeto,
          { sqlBase: string; observacoes: string },
        ][]) {
          await tx.insert(schema.fonteSqlVariant).values({
            fonteId,
            dialeto,
            sqlBase: sql.sqlBase,
            observacoesDialeto: sql.observacoes,
          });
        }
        for (const col of seed.colunas) {
          await tx.insert(schema.fonteColuna).values({
            fonteId,
            nome: col.nome,
            tipo: col.tipo,
            descricao: col.descricao,
            regraNegocio: col.regraNegocio,
            ordem: col.ordem,
          });
        }
        for (const regra of seed.regras) {
          await tx.insert(schema.regraNegocio).values({
            fonteId,
            nome: regra.nome,
            descricao: regra.descricao,
            expressao: regra.expressao,
          });
        }
        for (const sin of seed.sinonimos) {
          await tx.insert(schema.sinonimo).values({
            fonteId,
            termo: sin.termo,
            descricao: sin.descricao,
          });
        }
      }

      let desativadas = 0;
      for (const row of existingBefore) {
        if (!seedSlugs.has(row.slug) && row.ativo) {
          await tx.update(schema.fonte).set({ ativo: false }).where(eq(schema.fonte.id, row.id));
          desativadas += 1;
        }
      }

      const seedIds = [...slugToId.values()];
      if (seedIds.length > 0) {
        await tx
          .delete(schema.fonteRelacionamento)
          .where(inArray(schema.fonteRelacionamento.fonteOrigemId, seedIds));
      }
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
          await tx.insert(schema.fonteRelacionamento).values({
            fonteOrigemId: origemId,
            colunaOrigem: rel.colunaOrigem,
            fonteDestinoId: destinoId,
            colunaDestino: rel.colunaDestino,
            tipoJoin: rel.tipoJoin,
            descricao: rel.descricao,
          });
        }
      }

      return { criadas, atualizadas, desativadas };
    });
  }

  async listFontesAtivas(escopo: EscopoCatalogo): Promise<readonly Fonte[]> {
    const rows = await this.db
      .select()
      .from(schema.fonte)
      .where(and(eq(schema.fonte.ativo, true), visivelNoEscopo(escopo)));
    return dedupeFontesComPrecedencia(rows.map(mapFonte));
  }

  async findFonteBySlug(slug: string, escopo: EscopoCatalogo): Promise<Fonte | null> {
    const rows = await this.db
      .select()
      .from(schema.fonte)
      .where(and(eq(schema.fonte.slug, slug), visivelNoEscopo(escopo)));
    return escolherFonteComPrecedencia(rows.map(mapFonte));
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
    const variants = await this.db
      .select()
      .from(schema.fonteSqlVariant)
      .where(
        and(
          eq(schema.fonteSqlVariant.fonteId, fonte.id),
          eq(schema.fonteSqlVariant.dialeto, dialeto),
        ),
      );
    const variant = variants[0];
    if (!variant) {
      return null;
    }
    const colunas = await this.db
      .select()
      .from(schema.fonteColuna)
      .where(eq(schema.fonteColuna.fonteId, fonte.id));
    const rels = await this.db
      .select()
      .from(schema.fonteRelacionamento)
      .where(eq(schema.fonteRelacionamento.fonteOrigemId, fonte.id));
    const destIds = [
      ...new Set(rels.map((r) => r.fonteDestinoId).filter((id): id is string => id !== null)),
    ];
    const destinos =
      destIds.length > 0
        ? await this.db
            .select({ id: schema.fonte.id, slug: schema.fonte.slug })
            .from(schema.fonte)
            .where(inArray(schema.fonte.id, destIds))
        : [];
    const slugById = new Map(destinos.map((f) => [f.id, f.slug]));
    const regras = await this.db
      .select()
      .from(schema.regraNegocio)
      .where(eq(schema.regraNegocio.fonteId, fonte.id));
    const sinonimos = await this.db
      .select()
      .from(schema.sinonimo)
      .where(eq(schema.sinonimo.fonteId, fonte.id));
    return {
      fonte,
      dialeto,
      sqlBase: variant.sqlBase,
      observacoesDialeto: variant.observacoesDialeto,
      colunas: colunas.sort((a, b) => a.ordem - b.ordem),
      relacionamentos: rels.map((r) => mapRelacionamento(r, slugById)),
      regras,
      sinonimos,
      orientacoesIa: orientacoesBase(dialeto, variant.observacoesDialeto),
    };
  }

  async criarFonte(input: NovaFonteInput): Promise<Fonte> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.fonte)
        .values({
          slug: input.slug,
          nome: input.nome,
          descricao: input.descricao,
          ativo: true,
          mcpAccountId: input.escopo.mcpAccountId,
          agentId: input.escopo.agentId,
        })
        .returning();
      const row = inserted[0]!;
      await persistirFilhos(tx, row.id, input);
      return mapFonte(row);
    });
  }

  async substituirFonte(input: NovaFonteInput): Promise<Fonte | null> {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(schema.fonte)
        .where(
          and(
            eq(schema.fonte.slug, input.slug),
            eq(schema.fonte.mcpAccountId, input.escopo.mcpAccountId),
            eq(schema.fonte.agentId, input.escopo.agentId),
          ),
        );
      const row = existing[0];
      if (!row) {
        return null;
      }
      const updated = await tx
        .update(schema.fonte)
        .set({
          nome: input.nome,
          descricao: input.descricao,
          ativo: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.fonte.id, row.id))
        .returning();
      await persistirFilhos(tx, row.id, input);
      return mapFonte(updated[0]!);
    });
  }

  async adicionarRelacionamento(
    fonteId: string,
    relacionamento: NovaFonteRelacionamentoInput,
  ): Promise<void> {
    await this.db.insert(schema.fonteRelacionamento).values({
      fonteOrigemId: fonteId,
      ...valoresRelacionamento(relacionamento),
    });
  }

  async removerFonte(slug: string, escopo: EscopoCatalogo): Promise<boolean> {
    const deleted = await this.db
      .delete(schema.fonte)
      .where(
        and(
          eq(schema.fonte.slug, slug),
          eq(schema.fonte.mcpAccountId, escopo.mcpAccountId),
          eq(schema.fonte.agentId, escopo.agentId),
        ),
      )
      .returning({ id: schema.fonte.id });
    return deleted.length > 0;
  }
}
