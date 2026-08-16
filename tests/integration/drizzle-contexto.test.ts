import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  DrizzleAnotacaoRepository,
  DrizzleIndiceContexto,
  DrizzleMemoriaConsultaRepository,
} from "../../src/infrastructure/persistence/drizzle/drizzle-contexto.js";
import * as schema from "../../src/infrastructure/persistence/schema.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("drizzle contexto FTS (Postgres real)", () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  const accountId = randomUUID();
  const agentId = randomUUID();
  const escopo = { mcpAccountId: accountId, agentId };

  afterAll(async () => {
    await db.delete(schema.mcpAccount).where(eq(schema.mcpAccount.id, accountId));
    await pool.end();
  });

  it("buscar_contexto encontra anotação e consulta via FTS neste agentId", async () => {
    await db.insert(schema.mcpAccount).values({
      id: accountId,
      email: `fts-${accountId}@test.local`,
      passwordHash: "not-a-real-hash",
    });
    const anotacoes = new DrizzleAnotacaoRepository(db);
    const memoria = new DrizzleMemoriaConsultaRepository(db);
    const indice = new DrizzleIndiceContexto(db);

    await anotacoes.criar({
      escopo,
      fonteId: null,
      tipo: "glossario",
      titulo: "VIP",
      texto: "Código X significa cliente VIP só neste ERP de teste FTS.",
    });
    await memoria.criar({
      escopo,
      pergunta: "qual o total a receber de clientes VIP",
      sqlExecutado: "SELECT SUM(Valor) AS Total FROM ContaReceber WHERE Status = 'X'",
      fonteSlug: null,
      observacao: "",
    });

    const hits = await indice.buscar(escopo, "cliente VIP receber", 10);
    expect(hits.some((hit) => hit.tipo === "anotacao")).toBe(true);
    expect(hits.some((hit) => hit.tipo === "consulta")).toBe(true);

    const outroAgente = await indice.buscar(
      { mcpAccountId: accountId, agentId: randomUUID() },
      "cliente VIP receber",
      10,
    );
    expect(outroAgente.some((hit) => hit.tipo === "anotacao")).toBe(false);
    expect(outroAgente.some((hit) => hit.tipo === "consulta")).toBe(false);
  });
});
