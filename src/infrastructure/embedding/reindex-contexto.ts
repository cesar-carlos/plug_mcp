import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { loadConfig } from "../../config/env.js";
import * as schema from "../persistence/schema.js";
import {
  DrizzleIndiceContexto,
  DrizzleIndicePgvector,
} from "../persistence/drizzle/drizzle-contexto.js";
import { HttpEmbeddingAdapter } from "./http-embedding.adapter.js";

const run = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to reindex embeddings");
  }
  if (config.EMBEDDING_API_URL.length === 0) {
    console.warn("EMBEDDING_API_URL is empty; skipping reindex.");
    return;
  }

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const embedding = new HttpEmbeddingAdapter(
    config.EMBEDDING_API_URL,
    config.EMBEDDING_API_KEY,
    config.EMBEDDING_MODEL,
    config.EMBEDDING_DIMENSIONS,
  );
  const indice = new DrizzleIndicePgvector(db, embedding, new DrizzleIndiceContexto(db));

  try {
    const notas = await db
      .select({
        id: schema.fonteAnotacao.id,
        mcpAccountId: schema.fonteAnotacao.mcpAccountId,
        agentId: schema.fonteAnotacao.agentId,
        titulo: schema.fonteAnotacao.titulo,
        texto: schema.fonteAnotacao.texto,
      })
      .from(schema.fonteAnotacao)
      .where(sql`embedding is null`);
    const consultas = await db
      .select({
        id: schema.consultaMemoria.id,
        mcpAccountId: schema.consultaMemoria.mcpAccountId,
        agentId: schema.consultaMemoria.agentId,
        pergunta: schema.consultaMemoria.pergunta,
        observacao: schema.consultaMemoria.observacao,
      })
      .from(schema.consultaMemoria)
      .where(sql`embedding is null`);

    let indexadas = 0;
    for (const nota of notas) {
      await indice.indexar(
        { mcpAccountId: nota.mcpAccountId, agentId: nota.agentId },
        { tipo: "anotacao", id: nota.id, texto: `${nota.titulo} ${nota.texto}` },
      );
      indexadas += 1;
    }
    for (const consulta of consultas) {
      await indice.indexar(
        { mcpAccountId: consulta.mcpAccountId, agentId: consulta.agentId },
        { tipo: "consulta", id: consulta.id, texto: `${consulta.pergunta} ${consulta.observacao}` },
      );
      indexadas += 1;
    }
    console.log("embedding reindex ok", {
      notas: notas.length,
      consultas: consultas.length,
      indexadas,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/embedding|vector|42703/i.test(message)) {
      console.warn(
        "Coluna embedding ausente ou pgvector indisponível. Rode drizzle/optional/0007_pgvector.sql e tente de novo.",
        message,
      );
      return;
    }
    throw error;
  } finally {
    await pool.end();
  }
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
