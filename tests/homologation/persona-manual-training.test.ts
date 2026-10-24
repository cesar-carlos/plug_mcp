import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";
import { readChainManifest } from "../../scripts/homologation/chain-manifest.js";
import { FixtureProcesses } from "../../scripts/homologation/fixture-processes.js";
import { fixtureEnvironment } from "../../scripts/homologation/fixture-environment.js";
import { exerciseChainBrowser } from "../helpers/persona-chain-browser.js";
import { exerciseManualPublication } from "../helpers/persona-manual-publication.js";
import { manualSecretsSchema } from "../../scripts/homologation/manual-session-contract.js";
import { fixtureTablesSchema } from "../../src/domain/persona-v2/publication-fixture.js";
import { randomUUID } from "node:crypto";
const publicationJourney = process.env.PERSONA_CHAIN_MANUAL_PUBLICATION === "1";

it(
  publicationJourney
    ? "sessão de publicação registra casos pelo navegador e exige runner real nos três motores"
    : "sessão manual inicia vazia, treina pelo navegador nos três motores e encerra servidor/worker",
  async () => {
    const required = (name: string) => {
      const value = process.env[name];
      if (!value) throw new Error(`Fixture explícita ausente: ${name}`);
      return value;
    };
    const manifest = readChainManifest(required("PERSONA_CHAIN_MANIFEST"));
    const project = process.cwd();
    const supervisor = new FixtureProcesses(manifest.root);
    const child = supervisor.launch(
      process.execPath,
      [
        join(project, "node_modules/tsx/dist/cli.mjs"),
        join(project, "scripts/homologation/manual-training.ts"),
        "--manifest",
        required("PERSONA_CHAIN_MANIFEST"),
        "--hub",
        required("PERSONA_CHAIN_HUB_CHECKOUT"),
        "--agent",
        required("PERSONA_CHAIN_AGENT_CHECKOUT"),
        "--flutter",
        required("FLUTTER_BIN"),
        "--image",
        required("PERSONA_CHAIN_CANDIDATE_IMAGE"),
        "--minutes",
        "60",
      ],
      project,
      fixtureEnvironment(process.env),
      "manual-supervisor",
    );
    let sessionRoot: string | undefined;
    try {
      const ready = await supervisor.waitJson(
        "manual-ready.json",
        z.object({
          format: z.literal("persona-manual-ready-v1"),
          sessionRoot: z.string(),
          consoleUrl: z.url(),
          expiresAt: z.iso.datetime(),
          initialPersonas: z.literal(0),
          worker: z.literal(true),
        }),
        180000,
      );
      sessionRoot = ready.sessionRoot;
      expect(Date.parse(ready.expiresAt) - Date.now()).toBeGreaterThan(45 * 60_000);
      const access = z
        .object({
          login: z.object({ email: z.email(), password: z.string() }),
          sources: z.array(
            z.object({ dialect: z.string(), agentId: z.uuid(), clientToken: z.string() }),
          ),
        })
        .parse(JSON.parse(readFileSync(join(sessionRoot, "manual-access.json"), "utf8")));
      await exerciseChainBrowser({
        url: ready.consoleUrl.replace(/\/app$/, ""),
        client: access.login,
        sources: access.sources,
        journey: publicationJourney ? "publication" : "training",
        verifyPublicationCases: publicationJourney
          ? async (page, csrfToken) => {
              const session = JSON.parse(
                readFileSync(join(sessionRoot!, "manifest.json"), "utf8"),
              ) as {
                engines: Record<string, { publicationTables: unknown }>;
              };
              const hub = z
                .object({ hubUrl: z.url() })
                .parse(JSON.parse(readFileSync(join(sessionRoot!, "hub-ready.json"), "utf8")));
              const secrets = manualSecretsSchema.parse(
                JSON.parse(readFileSync(join(sessionRoot!, "manual-secrets.json"), "utf8")),
              );
              await exerciseManualPublication({
                page,
                dialects: access.sources.map((s) => s.dialect),
                run: async (binding) => {
                  const agent = access.sources.find((s) => s.dialect === binding.dialect);
                  if (!agent) throw new Error("Agente privado do runner ausente.");
                  const registration = await page.request.post(
                    `${ready.consoleUrl.replace(/\/app$/, "")}/api/admin/personas/${binding.personaId}/fontes`,
                    {
                      headers: {
                        Origin: new URL(ready.consoleUrl).origin,
                        "X-CSRF-Token": csrfToken,
                      },
                      data: {
                        name: `Fixture do operador ${binding.dialect}`,
                        purpose: "Exclusiva do runner isolado",
                        environment: "test",
                        agentId: agent.agentId,
                        dialect: binding.dialect,
                        email: access.login.email,
                        password: access.login.password,
                        clientToken: agent.clientToken,
                      },
                    },
                  );
                  expect(registration.status()).toBe(201);
                  const fixture = z
                    .object({ fonte: z.object({ id: z.uuid() }) })
                    .parse(await registration.json());
                  const file = join(
                    sessionRoot!,
                    `manual-publication-${binding.dialect}-${randomUUID()}.json`,
                  );
                  writeFileSync(
                    file,
                    JSON.stringify({
                      version: 1,
                      runId: manifest.runId,
                      sessionRoot,
                      hubUrl: hub.hubUrl,
                      personaId: binding.personaId,
                      skillId: binding.skillId,
                      bindings: [
                        {
                          sourceId: binding.sourceId,
                          fixtureSourceId: fixture.fonte.id,
                          tables: fixtureTablesSchema.parse(
                            session.engines[binding.dialect]!.publicationTables,
                          ),
                        },
                      ],
                    }),
                    { flag: "wx", mode: 0o600 },
                  );
                  const runner = supervisor.launch(
                    process.execPath,
                    [
                      join(project, "node_modules/tsx/dist/cli.mjs"),
                      join(
                        project,
                        "src/infrastructure/persistence/persona-v2/run-publication-cases.ts",
                      ),
                      file,
                    ],
                    project,
                    {
                      ...fixtureEnvironment(process.env),
                      NODE_ENV: "test",
                      LOG_LEVEL: "silent",
                      DATABASE_URL: manifest.controlDatabaseUrl,
                      MCP_ENCRYPTION_KEY: secrets.mcpEncryptionKey,
                      PLUG_SERVER_BASE_URL: hub.hubUrl,
                    },
                    `publication-${binding.dialect}`,
                  );
                  await supervisor.completed(runner);
                },
              });
            }
          : undefined,
      });
    } finally {
      if (!sessionRoot && existsSync(join(manifest.root, "manual-ready.json")))
        sessionRoot = (
          JSON.parse(readFileSync(join(manifest.root, "manual-ready.json"), "utf8")) as {
            sessionRoot: string;
          }
        ).sessionRoot;
      if (sessionRoot) writeFileSync(join(sessionRoot, "manual-stop"), "stop");
      await supervisor.completed(child, 90000);
    }
    const stopped = JSON.parse(
      readFileSync(join(manifest.root, "manual-stopped.json"), "utf8"),
    ) as {
      processesStopped: boolean;
      success: boolean;
    };
    expect(stopped).toMatchObject({ processesStopped: true, success: true });
  },
);
