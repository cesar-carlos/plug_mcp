import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import pg from "pg";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { externalProviderFixture } from "./external-provider.js";
import { PersonaNotificationHttps } from "../../src/infrastructure/persona-v2/notification-transport.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { testConfig } from "../../src/config/env.js";
import type { PlugServerGatewayPort } from "../../src/domain/ports/plug-server-gateway.port.js";

// The hub is synthetic; all SQL and persistence use dedicated real PostgreSQL databases.
const base = new URL(personaV2TestDatabaseUrl());
const urlFor = (name: string) => {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
};
const admin = new pg.Pool({ connectionString: urlFor("postgres") });
const run = randomUUID().replaceAll("-", "");
// Only the owned control-database name, never credentials. The separate test process
// runs the real runner; no HTTP route can submit or approve a report.
const statePath = "node_modules/.cache/persona-v2-browser-state.json";
const names = [
  `persona_browser_${run}_test`,
  `persona_data_a_${run}_test`,
  `persona_data_b_${run}_test`,
];
const owned: string[] = [];
const pools: pg.Pool[] = [];
let runtime: Awaited<ReturnType<typeof composePersonaV2>> | undefined;
let discoveryFixture: Awaited<ReturnType<typeof externalProviderFixture>> | undefined;
async function cleanup() {
  await runtime?.close();
  await discoveryFixture?.close();
  await Promise.all(pools.map((p) => p.end()));
  for (const name of owned) {
    if (!/^persona_(browser|data_[ab])_[a-f0-9]{32}_test$/.test(name)) {
      throw new Error("Alvo de limpeza inválido.");
    }
    await admin.query(`DROP DATABASE "${name}"`);
  }
  await admin.end();
  const state = JSON.parse(await readFile(statePath, "utf8").catch(() => "{}")) as { run?: string };
  if (state.run === run) await unlink(statePath);
}
export default async function startBrowserFixture(): Promise<() => Promise<void>> {
  try {
    for (const name of names) {
      await admin.query(`CREATE DATABASE "${name}"`);
      owned.push(name);
    }
    await applyPersonaMigrations(urlFor(names[0]!));
    for (const [index, name] of names.slice(1).entries()) {
      const pool = new pg.Pool({ connectionString: urlFor(name) });
      pools.push(pool);
      await pool.query("CREATE TABLE orders(id integer PRIMARY KEY, amount numeric(12,2))");
      await pool.query("CREATE VIEW orders_view AS SELECT id, amount FROM orders");
      await pool.query("CREATE TABLE documents(id integer PRIMARY KEY, document bytea)");
      await pool.query("INSERT INTO documents VALUES(1,$1)", [
        Buffer.from("%PDF-1.4\n% Browser fixture\n%%EOF\n"),
      ]);
      await pool.query("INSERT INTO orders VALUES (1,$1)", [index === 0 ? "10.25" : "100.75"]);
      await pool.query("INSERT INTO orders SELECT id, id * 0.01 FROM generate_series(2,30) id");
    }
    const account = (token: string) => {
      if (!["fixture-a", "fixture-b", "fixture-view"].includes(token)) {
        throw new Error("Fonte sintética inválida.");
      }
      return token === "fixture-b" ? 1 : 0;
    };
    const hub: PlugServerGatewayPort = {
      login: async (email, password) => {
        if (
          !["a@fixture.test", "b@fixture.test", "view@fixture.test"].includes(email) ||
          password !== "fixture-password"
        ) {
          throw new Error("Credencial sintética inválida.");
        }
        const token =
          email === "view@fixture.test"
            ? "fixture-view"
            : email === "a@fixture.test"
              ? "fixture-a"
              : "fixture-b";
        return { accessToken: token, refreshToken: token };
      },
      refresh: async () => {
        throw new Error("Refresh não utilizado no harness.");
      },
      requestAgentAccess: async () => {
        throw new Error("Cadastro upstream não permitido no harness.");
      },
      putClientToken: async () => {
        throw new Error("Mudança upstream não permitida no harness.");
      },
      getAgentAccessStatus: async (_jwt, agentId) => ({
        agentId,
        state: "approved",
        sourceIdentity: 1,
        sourceSchema: 1,
        sourceConstraints: 1,
        hasClientToken: true,
        isHubConnected: true,
      }),
      getClientTokenPolicy: async ({ clientToken }) => ({
        allTables: clientToken !== "fixture-view",
        tables: [],
        fullPolicy: {
          database: names[account(clientToken) + 1]!,
          allViews: clientToken === "fixture-view",
          allPermissions: false,
          revoked: false,
          globalPermissions: { read: true, update: false, delete: false, ddl: false },
          rules: [],
        },
      }),
      describeSource: async ({ database, clientToken }) => {
        const index = account(clientToken);
        if (database !== names[index + 1]) throw new Error("Base sintética divergente.");
        const metadata = await pools[index]!.query(
          "SELECT c.system_identifier::text AS cluster, d.oid::text AS oid FROM pg_control_system() c CROSS JOIN pg_database d WHERE d.datname=current_database()",
        );
        const { createHash } = await import("node:crypto");
        return {
          contractVersion: 1,
          database,
          dialect: "postgres",
          identityHash: createHash("sha256").update(JSON.stringify(metadata.rows[0])).digest("hex"),
          identityKind: "native",
          engineVersion: "postgres-fixture",
          verifiedAt: new Date().toISOString(),
        };
      },
      describeSchema: async (input) => {
        const index = account(input.clientToken);
        if (input.database !== names[index + 1] || input.accessToken !== input.clientToken)
          throw new Error("Isolamento da inspeção inválido.");
        const identity = await hub.describeSource!(input);
        const resources = [];
        const scope = input.inspection.resources.slice(
          input.inspection.offset,
          input.inspection.offset + input.inspection.pageSize,
        );
        for (const resource of scope) {
          // Fixed metadata SQL, restricted to the databases created by this browser harness.
          const columns = await pools[index]!.query<{
            name: string;
            nativeType: string;
            ordinal: number;
            nullable: boolean;
            size: number | null;
            scale: number | null;
          }>(
            `SELECT column_name AS name, udt_name AS "nativeType", ordinal_position AS ordinal, is_nullable='YES' AS nullable, coalesce(character_maximum_length,numeric_precision) AS size,numeric_scale AS scale FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
            [resource.schema, resource.name],
          );
          const available = resource.type === "table" && columns.rows.length > 0;
          resources.push({
            resource,
            status: available ? "available" : "not_found",
            columns: available ? columns.rows : [],
            primaryKeys:
              available && resource.name === "orders"
                ? [{ name: "orders_pkey", columns: ["id"], status: "enabled" }]
                : [],
            uniqueKeys: [],
            foreignKeys: [],
            coverage: {
              columns: true,
              primaryKeys: true,
              uniqueKeys: true,
              foreignKeys: true,
              constraintStatus: true,
            },
            limitations: [],
          });
        }
        return {
          contractVersion: 1,
          identity,
          observedAt: new Date().toISOString(),
          resources,
          metadataPage: {
            offset: input.inspection.offset,
            pageSize: input.inspection.pageSize,
            nextOffset:
              input.inspection.offset + resources.length < input.inspection.resources.length
                ? input.inspection.offset + resources.length
                : null,
          },
        };
      },
      executeSql: async (input) => {
        const index = account(input.clientToken ?? "");
        if (input.database !== names[index + 1] || input.accessToken !== input.clientToken) {
          throw new Error("Isolamento de fonte inválido.");
        }
        const values: unknown[] = [];
        const sql = input.sql.replace(/:([a-z_][a-z0-9_]*)/g, (_match, name: string) => {
          values.push(input.params?.[name]);
          return `$${values.length}`;
        });
        const result = await pools[index]!.query(sql, values);
        const max = input.options?.maxRows ?? 5000;
        const page = input.options?.page,
          pageSize = input.options?.pageSize;
        const offset = page && pageSize ? (page - 1) * pageSize : 0;
        const limit = Math.min(max, pageSize ?? max);
        return {
          columns: result.fields.map((f) => f.name),
          ...(result.fields.some((f) => f.dataTypeID === 17)
            ? {
                columnsMetadata: result.fields
                  .filter((f) => f.dataTypeID === 17)
                  .map((f) => ({ name: f.name, odbcType: -4 })),
              }
            : {}),
          rows: result.rows
            .slice(offset, offset + limit)
            .map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                  key,
                  Buffer.isBuffer(value) ? value.toString("base64") : value,
                ]),
              ),
            ),
          truncated: pageSize ? false : result.rows.length > max,
          ...(page && pageSize
            ? {
                pagination: {
                  page,
                  pageSize,
                  hasNextPage: result.rows.length > offset + limit,
                  hasPreviousPage: page > 1,
                },
              }
            : {}),
        };
      },
    };
    discoveryFixture = await externalProviderFixture("mcp_http");
    runtime = await composePersonaV2(
      testConfig({
        DATABASE_URL: urlFor(names[0]!),
        PUBLIC_BASE_URL: "http://127.0.0.1:5188",
        PORT: 5188,
        LOG_LEVEL: "silent",
      }),
      {
        hub,
        externalDiscovery: discoveryFixture.discovery,
        notificationTransport: new PersonaNotificationHttps(undefined, () =>
          Promise.resolve([{ address: "93.184.216.34", family: 4 }]),
        ),
        ownerAuth: {
          hubOrigin: "http://hub.fixture.test",
          login: async (email, password) => {
            if (email !== "owner@fixture.test" || password !== "fixture-password") {
              throw new Error("Login sintético inválido.");
            }
            return { accessToken: "owner-fixture" };
          },
          profile: async () => ({ clientId: "owner-fixture", active: true }),
        },
      },
    );
    await mkdir("node_modules/.cache", { recursive: true });
    await writeFile(statePath, JSON.stringify({ run, databaseName: names[0] }), "utf8");
    const server = runtime.app.listen(5188, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    // Playwright owns this lifecycle in-process, including on test failure.
    // No HTTP shutdown route or platform-specific process-tree termination.
    return async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await cleanup();
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
