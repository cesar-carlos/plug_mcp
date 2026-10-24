import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Source } from "../src/domain/persona-v2/model.js";
import type { OperationTraining } from "../src/domain/persona-v2/operation-training.js";
import {
  compileOperationCommand,
  compileOperationTraining,
} from "../src/application/persona-v2/operation-training.js";
import { NodeCryptoAdapter } from "../src/infrastructure/crypto/node-crypto.adapter.js";

// Only compiles synthetic commands. Never reads .env or opens a connection.
const fixtureSchema = z.object({
  runId: z.string().regex(/^se7e_persona_[a-f0-9]{12}_test$/),
  root: z.string(),
  engines: z.object({
    postgres: z.object({ database: z.string() }),
    mssql: z.object({ database: z.string() }),
    sybase: z.object({ database: z.string() }),
  }),
});
const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Informe o manifesto das três fixtures descartáveis.");
const fixture = fixtureSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
const root = realpathSync(fixture.root);
if (basename(root) !== fixture.runId) throw new Error("Diretório da fixture divergente.");
const crypto = new NodeCryptoAdapter("a".repeat(64)); // Synthetic fingerprinting only; no secrets.
const commands = Object.fromEntries(
  (["postgres", "mssql", "sybase"] as const).map((dialect) => {
    const database = fixture.engines[dialect].database;
    if (database !== fixture.runId) throw new Error(`Base de fixture divergente: ${dialect}`);
    const source: Source = {
      id: randomUUID(),
      personaId: randomUUID(),
      physicalSourceId: randomUUID(),
      credentialId: randomUUID(),
      agentId: randomUUID(),
      credentialVersion: 1,
      authorizationVersion: 1,
      active: true,
      name: "Fixture ODBC",
      purpose: "Homologação",
      environment: "test",
      database,
      dialect,
    };
    const columns = [
      { name: "marker", type: "string" as const },
      { name: "amount", type: "decimal" as const },
      { name: "revision", type: "integer" as const },
    ];
    const field = (column: string, name = column) => ({
      column,
      binding: { kind: "input" as const, name },
    });
    const training: OperationTraining = {
      sourceId: source.id,
      dialect,
      purpose: "INSERT/UPDATE/DELETE sintéticos na mesma transação",
      mode: "somente_parametros",
      approval: "human",
      maxAffectedRows: 3,
      timeoutMs: 30000,
      parameters: [...columns, { name: "expected_revision", type: "integer" as const }].map(
        (c) => ({
          ...c,
          nullable: false,
          meaning: `Campo sintético ${c.name}`,
        }),
      ),
      tables: [
        {
          name: "operation_fixture",
          meaning: "Fixture descartável",
          identity: ["id"],
          concurrency: ["revision"],
          uniqueKeys: [["marker"]],
          columns: [
            { name: "id", type: "integer", writable: false, meaning: "ID gerado" },
            ...columns.map((c) => ({ ...c, writable: true, meaning: c.name })),
          ],
        },
      ],
      steps: [
        {
          id: "insert_row",
          effect: "insert",
          table: "operation_fixture",
          values: columns.map((c) => field(c.name)),
          where: [],
          outputs: [{ column: "id", type: "integer" }],
          rows: { min: 1, max: 1 },
        },
        {
          id: "update_row",
          effect: "update",
          table: "operation_fixture",
          values: [field("amount")],
          where: [
            { column: "id", binding: { kind: "step_output", stepId: "insert_row", output: "id" } },
            field("revision", "expected_revision"),
          ],
          outputs: [{ column: "revision", type: "integer" }],
          rows: { min: 1, max: 1 },
        },
        {
          id: "delete_row",
          effect: "delete",
          table: "operation_fixture",
          values: [],
          where: [
            { column: "id", binding: { kind: "step_output", stepId: "insert_row", output: "id" } },
            {
              column: "revision",
              binding: { kind: "step_output", stepId: "update_row", output: "revision" },
            },
          ],
          outputs: [],
          rows: { min: 1, max: 1 },
        },
      ],
      rules: ["Toda condição é obrigatória."],
      indirectEffects: "Sem triggers/cascatas.",
      reconciliation: "Não reenviar resultado desconhecido.",
    };
    const pkg = compileOperationTraining(training, source, crypto, "Fixture de lançamentos");
    const input = {
      marker: { type: "string", value: "compiled" },
      amount: { type: "decimal", value: "12.34" },
      revision: { type: "integer", value: "1" },
      expected_revision: { type: "integer", value: "1" },
    };
    const transport = {
      contractVersion: 1,
      sourcePhysicalId: crypto.sha256Hex(canonicalSource(source)),
    };
    const reads: unknown[] = [];
    return [
      dialect,
      {
        reads,
        success: {
          ...compileOperationCommand(pkg, source, randomUUID(), input, crypto),
          ...transport,
        },
        stale: {
          ...compileOperationCommand(
            pkg,
            source,
            randomUUID(),
            {
              ...input,
              expected_revision: { type: "integer", value: "999" },
            },
            crypto,
          ),
          ...transport,
        },
      },
    ];
  }),
);
writeFileSync(join(root, "compiled-commands.json"), JSON.stringify(commands, null, 2) + "\n");
console.log("Comandos sintéticos dos três dialetos compilados; nenhuma conexão executada.");

function canonicalSource(source: Source): string {
  return JSON.stringify(["https://fixture.invalid", source.agentId, source.database]);
}
