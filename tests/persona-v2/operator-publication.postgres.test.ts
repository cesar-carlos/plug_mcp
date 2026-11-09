import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";
import { expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { OperatorChannel } from "../../src/infrastructure/persistence/persona-v2/operator-channel.js";
import { LocalOperatorFixture } from "../../src/infrastructure/persistence/persona-v2/operator-fixture-bridge.js";
import {
  operatorFixtureSchema,
  operatorExpectationSchema,
} from "../../src/infrastructure/persistence/persona-v2/operator-contract.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { trainingSource, queryTraining } from "../helpers/persona-v2-training.js";
import { z } from "zod";
import { fixtureEnvironment } from "../../scripts/homologation/fixture-environment.js";

it("processo operador grava só no catálogo original com controle PostgreSQL isolado e transporte sintético", async () => {
  const adminUrl = new URL(personaV2TestDatabaseUrl());
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  const name = `persona_operator_${randomUUID().replaceAll("-", "")}_test`;
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const pool = new pg.Pool({ connectionString: url.toString() });
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const personaId = randomUUID(),
    skillId = randomUUID(),
    caseId = randomUUID(),
    ownerId = randomUUID();
  const source = {
    ...trainingSource,
    id: randomUUID(),
    personaId,
    dialect: "mssql" as const,
    credentialId: randomUUID(),
    rowRestrictions: [],
  };
  const repository = new PostgresPersonaRepository(pool);
  try {
    await applyPersonaMigrations(url.toString());
    await pool.query(
      "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://fixture.invalid','fixture')",
      [ownerId],
    );
    await repository.transaction({ personaIds: [personaId], tokenIds: [] }, async (tx) => {
      await tx.createPersona({
        id: personaId,
        ownerId,
        name: "Synthetic operator",
        specialty: "fixture",
        instructions: "",
        active: true,
        authorizationVersion: 1,
      });
      source.physicalSourceId = await tx.physicalSource(source.identityHash!);
      await tx.addSource(source, {
        emailEnc: crypto.encrypt("fixture@test.invalid"),
        passwordEnc: crypto.encrypt("synthetic-unused"),
        clientTokenEnc: crypto.encrypt("synthetic-unused"),
      });
      await tx.catalog.create({
        id: skillId,
        personaId,
        slug: "operator-query",
        kind: "consulta",
        name: "Synthetic query",
        revision: 1,
        activePublicationId: null,
        training: {
          ...queryTraining(source.id),
          dialect: "mssql",
          sqlModel: "SELECT p.id FROM orders p WHERE p.id > :minimum ORDER BY p.id",
        },
      });
      await tx.catalog.saveCase(personaId, skillId, {
        id: caseId,
        required: true,
        content: {
          name: "Synthetic empty",
          input: {
            params: { minimum: 0 },
            fixtures: [{ table: "orders", generated: [], rows: [] }],
          },
          expected: { columns: [{ name: "id", type: "integer" }], rows: [], ordered: true },
        },
      });
    });
    const descriptor = operatorFixtureSchema.parse({
      runId: "se7e_persona_abcdef123456_test",
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      tables: [
        {
          table: "orders",
          columns: [
            { name: "id", type: "integer" },
            { name: "amount", type: "decimal" },
          ],
          primaryKey: ["id"],
        },
      ],
      source: {
        ...source,
        id: randomUUID(),
        personaId: randomUUID(),
        name: "Operator fixture",
        purpose: "Synthetic publication cases",
        environment: "test",
        database: "se7e_persona_abcdef123456_test",
      },
    });
    let executed = 0,
      cleared = 0;
    const handler = new LocalOperatorFixture(
      descriptor,
      {
        authorize: async () => ({
          execute: async () => {
            executed++;
            return { columns: ["id"], rows: [], truncated: false };
          },
          revalidate: async () => undefined,
        }),
      },
      {
        prepare: async () => undefined,
        clear: async () => {
          cleared++;
        },
      },
    );
    const revision = "a".repeat(40);
    const invoke = async (request: object, expectedExit = 0): Promise<unknown> => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "src/infrastructure/persistence/persona-v2/run-ssh-publication.ts"],
        {
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          env: {
            ...fixtureEnvironment(process.env),
            NODE_ENV: "production",
            DATABASE_URL: url.toString(),
            PUBLIC_BASE_URL: "https://operator.fixture.invalid",
            PLUG_SERVER_BASE_URL: "http://127.0.0.1:1",
            MCP_ENCRYPTION_KEY: "a".repeat(64),
            MCP_ENCRYPTION_KEY_ID: "primary",
            MCP_ENCRYPTION_PREVIOUS_KEYS: "{}",
            MCP_ENCRYPTION_LEGACY_KEY: "a".repeat(64),
            PERSONA_V2_DEPLOYMENT: "test-server",
            GIT_SHA: revision,
          },
        },
      );
      child.stderr.resume();
      const channel = new OperatorChannel(child.stdout, child.stdin);
      const exit = new Promise<number | null>((resolve) => {
        child.once("exit", resolve);
        child.once("error", () => resolve(-1));
      });
      try {
        await channel.send(request);
        for (;;) {
          const message = await channel.read();
          if (
            message &&
            typeof message === "object" &&
            "kind" in message &&
            message.kind === "request"
          )
            await channel.send(await handler.handle(message));
          else {
            child.stdin.end();
            expect(await exit, JSON.stringify(message)).toBe(expectedExit);
            return message;
          }
        }
      } finally {
        channel.close();
        child.kill();
      }
    };
    const inspected = z
      .object({
        report: operatorExpectationSchema.extend({
          approved: z.literal(false),
          results: z.array(z.unknown()).length(0),
        }),
      })
      .parse(await invoke({ mode: "inspect", revision, personaId, skillId }));
    expect(
      await repository.transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
        tx.catalog.reports(personaId, skillId),
      ),
    ).toHaveLength(0);
    expect(executed).toBe(0);
    const { approved: _approved, results: _results, ...expected } = inspected.report;
    expect(
      await invoke({ mode: "run", revision, personaId, skillId, expected, fixture: descriptor }),
    ).toMatchObject({
      kind: "result",
      report: { approved: true, results: [{ id: caseId, passed: true }] },
    });
    expect(executed).toBe(1);
    expect(cleared).toBe(1);
    const reports = await repository.transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
      tx.catalog.reports(personaId, skillId),
    );
    expect(reports.some((r) => r.approved)).toBe(true);
    expect(JSON.stringify(reports)).not.toContain("synthetic-unused");
    await pool.query("UPDATE skill_v2 SET revisao=revisao+1 WHERE persona_id=$1 AND id=$2", [
      personaId,
      skillId,
    ]);
    expect(
      await invoke({ mode: "run", revision, personaId, skillId, expected, fixture: descriptor }, 1),
    ).toMatchObject({ kind: "failure", code: "STALE_AUTHORIZATION", approved: false });
    expect(executed).toBe(1);
    expect(
      await repository.transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
        tx.catalog.reports(personaId, skillId),
      ),
    ).toEqual(reports);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}, 30000);
