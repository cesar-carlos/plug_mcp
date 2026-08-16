import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { FonteAnotacao, NovaAnotacaoInput } from "../../../domain/entities/anotacao.js";
import type {
  ConsultaMemoria,
  NovaConsultaMemoriaInput,
} from "../../../domain/entities/consulta-memoria.js";
import type { EscopoCatalogo } from "../../../domain/entities/fonte.js";
import type { AnotacaoRepositoryPort } from "../../../domain/ports/anotacao-repository.port.js";
import type { EmbeddingPort } from "../../../domain/ports/embedding.port.js";
import type {
  HitContexto,
  IndiceContextoPort,
  ItemIndexavel,
} from "../../../domain/ports/indice-contexto.port.js";
import type { MemoriaConsultaRepositoryPort } from "../../../domain/ports/memoria-consulta-repository.port.js";
import * as schema from "../schema.js";
import type { Db } from "./db.js";

const mapAnotacao = (row: typeof schema.fonteAnotacao.$inferSelect): FonteAnotacao => ({
  id: row.id,
  mcpAccountId: row.mcpAccountId,
  agentId: row.agentId,
  fonteId: row.fonteId,
  tipo: row.tipo as FonteAnotacao["tipo"],
  titulo: row.titulo,
  texto: row.texto,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapMemoria = (row: typeof schema.consultaMemoria.$inferSelect): ConsultaMemoria => ({
  id: row.id,
  mcpAccountId: row.mcpAccountId,
  agentId: row.agentId,
  pergunta: row.pergunta,
  sqlExecutado: row.sqlExecutado,
  fonteSlug: row.fonteSlug,
  observacao: row.observacao,
  aprovadoEm: row.aprovadoEm,
});

export class DrizzleAnotacaoRepository implements AnotacaoRepositoryPort {
  constructor(private readonly db: Db) {}

  async listar(escopo: EscopoCatalogo, fonteId: string | null): Promise<readonly FonteAnotacao[]> {
    const fonteFiltro =
      fonteId === null
        ? isNull(schema.fonteAnotacao.fonteId)
        : eq(schema.fonteAnotacao.fonteId, fonteId);
    const rows = await this.db
      .select()
      .from(schema.fonteAnotacao)
      .where(
        and(
          eq(schema.fonteAnotacao.mcpAccountId, escopo.mcpAccountId),
          eq(schema.fonteAnotacao.agentId, escopo.agentId),
          fonteFiltro,
        ),
      )
      .orderBy(desc(schema.fonteAnotacao.updatedAt));
    return rows.map(mapAnotacao);
  }

  async listarTudo(escopo: EscopoCatalogo, limite: number): Promise<readonly FonteAnotacao[]> {
    const rows = await this.db
      .select()
      .from(schema.fonteAnotacao)
      .where(
        and(
          eq(schema.fonteAnotacao.mcpAccountId, escopo.mcpAccountId),
          eq(schema.fonteAnotacao.agentId, escopo.agentId),
        ),
      )
      .orderBy(desc(schema.fonteAnotacao.updatedAt))
      .limit(limite);
    return rows.map(mapAnotacao);
  }

  async criar(input: NovaAnotacaoInput): Promise<FonteAnotacao> {
    const inserted = await this.db
      .insert(schema.fonteAnotacao)
      .values({
        mcpAccountId: input.escopo.mcpAccountId,
        agentId: input.escopo.agentId,
        fonteId: input.fonteId,
        tipo: input.tipo,
        titulo: input.titulo,
        texto: input.texto,
      })
      .returning();
    return mapAnotacao(inserted[0]!);
  }

  async remover(anotacaoId: string, escopo: EscopoCatalogo): Promise<boolean> {
    const deleted = await this.db
      .delete(schema.fonteAnotacao)
      .where(
        and(
          eq(schema.fonteAnotacao.id, anotacaoId),
          eq(schema.fonteAnotacao.mcpAccountId, escopo.mcpAccountId),
          eq(schema.fonteAnotacao.agentId, escopo.agentId),
        ),
      )
      .returning({ id: schema.fonteAnotacao.id });
    return deleted.length > 0;
  }
}

export class DrizzleMemoriaConsultaRepository implements MemoriaConsultaRepositoryPort {
  constructor(private readonly db: Db) {}

  async criar(input: NovaConsultaMemoriaInput): Promise<ConsultaMemoria> {
    const inserted = await this.db
      .insert(schema.consultaMemoria)
      .values({
        mcpAccountId: input.escopo.mcpAccountId,
        agentId: input.escopo.agentId,
        pergunta: input.pergunta,
        sqlExecutado: input.sqlExecutado,
        fonteSlug: input.fonteSlug,
        observacao: input.observacao,
      })
      .returning();
    return mapMemoria(inserted[0]!);
  }

  async listar(escopo: EscopoCatalogo, limite: number): Promise<readonly ConsultaMemoria[]> {
    const rows = await this.db
      .select()
      .from(schema.consultaMemoria)
      .where(
        and(
          eq(schema.consultaMemoria.mcpAccountId, escopo.mcpAccountId),
          eq(schema.consultaMemoria.agentId, escopo.agentId),
        ),
      )
      .orderBy(desc(schema.consultaMemoria.aprovadoEm))
      .limit(limite);
    return rows.map(mapMemoria);
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(schema.consultaMemoria)
      .where(lt(schema.consultaMemoria.aprovadoEm, cutoff))
      .returning({ id: schema.consultaMemoria.id });
    return rows.length;
  }
}

export class DrizzleIndiceContexto implements IndiceContextoPort {
  constructor(private readonly db: Db) {}

  async buscar(
    escopo: EscopoCatalogo,
    texto: string,
    limite: number,
  ): Promise<readonly HitContexto[]> {
    const query = texto.trim();
    if (query.length < 2) {
      return [];
    }
    const like = `%${query}%`;
    const fontes = await this.db.execute<{
      id: string;
      slug: string;
      trecho: string;
      score: number;
    }>(sql`
      SELECT id, slug, descricao AS trecho,
        ts_rank(tsv, plainto_tsquery('simple', ${query})) AS score
      FROM fonte
      WHERE ativo = true
        AND (mcp_account_id IS NULL OR (mcp_account_id = ${escopo.mcpAccountId} AND agent_id = ${escopo.agentId}))
        AND (tsv @@ plainto_tsquery('simple', ${query}) OR nome ILIKE ${like})
      ORDER BY score DESC
      LIMIT ${limite}
    `);
    const notas = await this.db.execute<{
      id: string;
      trecho: string;
      score: number;
    }>(sql`
      SELECT id, left(texto, 240) AS trecho,
        ts_rank(tsv, plainto_tsquery('simple', ${query})) AS score
      FROM fonte_anotacao
      WHERE mcp_account_id = ${escopo.mcpAccountId}
        AND agent_id = ${escopo.agentId}
        AND tsv @@ plainto_tsquery('simple', ${query})
      ORDER BY score DESC
      LIMIT ${limite}
    `);
    const consultas = await this.db.execute<{
      id: string;
      slug: string | null;
      trecho: string;
      score: number;
    }>(sql`
      SELECT id, fonte_slug AS slug, pergunta AS trecho,
        ts_rank(tsv, plainto_tsquery('simple', ${query})) AS score
      FROM consulta_memoria
      WHERE mcp_account_id = ${escopo.mcpAccountId}
        AND agent_id = ${escopo.agentId}
        AND tsv @@ plainto_tsquery('simple', ${query})
      ORDER BY score DESC
      LIMIT ${limite}
    `);
    const hits: HitContexto[] = [
      ...fontes.rows.map((row) => ({
        tipo: "fonte" as const,
        id: row.id,
        slug: row.slug,
        trecho: row.trecho,
        score: Number(row.score),
      })),
      ...notas.rows.map((row) => ({
        tipo: "anotacao" as const,
        id: row.id,
        slug: null,
        trecho: row.trecho,
        score: Number(row.score),
      })),
      ...consultas.rows.map((row) => ({
        tipo: "consulta" as const,
        id: row.id,
        slug: row.slug,
        trecho: row.trecho,
        score: Number(row.score),
      })),
    ];
    return hits.sort((a, b) => b.score - a.score).slice(0, limite);
  }

  indexar(_escopo: EscopoCatalogo, _item: ItemIndexavel): Promise<void> {
    return Promise.resolve();
  }
}

const vectorLiteral = (values: readonly number[]): string => `[${values.join(",")}]`;

export class DrizzleIndicePgvector implements IndiceContextoPort {
  constructor(
    private readonly db: Db,
    private readonly embedding: EmbeddingPort,
    private readonly fts: IndiceContextoPort,
  ) {}

  async buscar(
    escopo: EscopoCatalogo,
    texto: string,
    limite: number,
  ): Promise<readonly HitContexto[]> {
    const query = texto.trim();
    if (query.length < 2) {
      return [];
    }
    try {
      const vector = await this.embedding.embed(query);
      const literal = vectorLiteral(vector);
      const notas = await this.db.execute<{
        id: string;
        trecho: string;
        score: number;
      }>(sql`
        SELECT id, left(texto, 240) AS trecho,
          1 - (embedding <=> ${literal}::vector) AS score
        FROM fonte_anotacao
        WHERE mcp_account_id = ${escopo.mcpAccountId}
          AND agent_id = ${escopo.agentId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${limite}
      `);
      const consultas = await this.db.execute<{
        id: string;
        trecho: string;
        slug: string | null;
        score: number;
      }>(sql`
        SELECT id, pergunta AS trecho, fonte_slug AS slug,
          1 - (embedding <=> ${literal}::vector) AS score
        FROM consulta_memoria
        WHERE mcp_account_id = ${escopo.mcpAccountId}
          AND agent_id = ${escopo.agentId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${limite}
      `);
      const hits: HitContexto[] = [
        ...notas.rows.map((row) => ({
          tipo: "anotacao" as const,
          id: row.id,
          slug: null,
          trecho: row.trecho,
          score: Number(row.score),
        })),
        ...consultas.rows.map((row) => ({
          tipo: "consulta" as const,
          id: row.id,
          slug: row.slug,
          trecho: row.trecho,
          score: Number(row.score),
        })),
      ];
      if (hits.length === 0) {
        return this.fts.buscar(escopo, texto, limite);
      }
      const ftsHits = await this.fts.buscar(escopo, texto, limite);
      const byKey = new Map<string, HitContexto>();
      for (const hit of [...hits, ...ftsHits]) {
        const key = `${hit.tipo}:${hit.id}`;
        const current = byKey.get(key);
        if (!current || hit.score > current.score) {
          byKey.set(key, hit);
        }
      }
      return [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, limite);
    } catch {
      return this.fts.buscar(escopo, texto, limite);
    }
  }

  async indexar(escopo: EscopoCatalogo, item: ItemIndexavel): Promise<void> {
    const vector = await this.embedding.embed(item.texto);
    const literal = vectorLiteral(vector);
    if (item.tipo === "anotacao") {
      await this.db.execute(sql`
        UPDATE fonte_anotacao
        SET embedding = ${literal}::vector
        WHERE id = ${item.id}
          AND mcp_account_id = ${escopo.mcpAccountId}
          AND agent_id = ${escopo.agentId}
      `);
      return;
    }
    if (item.tipo === "consulta") {
      await this.db.execute(sql`
        UPDATE consulta_memoria
        SET embedding = ${literal}::vector
        WHERE id = ${item.id}
          AND mcp_account_id = ${escopo.mcpAccountId}
          AND agent_id = ${escopo.agentId}
      `);
    }
  }
}
