import type pg from "pg";
import { setTimeout as delay } from "node:timers/promises";

export async function dropKnowledgeContextDatabase(admin: pg.Pool, name: string): Promise<void> {
  if (!/^knowledge_context_[a-f0-9]{32}_test$/.test(name)) {
    throw new Error("Invalid knowledge-context fixture name");
  }
  const deadline = performance.now() + 5000;
  const observation: pg.QueryConfig & { query_timeout: number } = {
    text: "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = $1) AS active",
    values: [name],
    query_timeout: 1000,
  };
  for (;;) {
    const result = await admin.query<{ active: boolean }>(observation);
    if (performance.now() >= deadline) {
      throw new Error("Fixture connections did not close before cleanup deadline");
    }
    if (!result.rows[0] || typeof result.rows[0].active !== "boolean") {
      throw new Error("Fixture connection state unavailable");
    }
    if (!result.rows[0].active) break;
    await delay(10);
  }
  await admin.query(`DROP DATABASE "${name}"`);
}
