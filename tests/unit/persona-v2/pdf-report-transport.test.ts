import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { createPersonaV2McpHandler } from "../../../src/infrastructure/mcp/persona-v2-http.js";
import type { PersonaConsumerCatalog } from "../../../src/application/persona-v2/consumer-catalog.js";
import type { PersonaSourceQueries } from "../../../src/application/persona-v2/source-query.js";
import type { PersonaAttachments } from "../../../src/application/persona-v2/attachments.js";
import type { PersonaPdfReports } from "../../../src/application/persona-v2/pdf-reports.js";
import type { PersonaOAuth } from "../../../src/application/persona-v2/oauth.js";
import { trainingTopic } from "../../../src/application/persona-v2/training-topics.js";
import { parseMcpPayload } from "../../helpers/mcp-rpc.js";

it.each(["bearer", "oauth"])(
  "PDF tools are opt-in and preserve authenticated identity (%s)",
  async (mode) => {
    const identity = { personaId: "persona", tokenId: "token", tokenVersion: 1, personaVersion: 1 };
    const authenticate = vi.fn(async () => identity);
    const consumer = { authenticate } as unknown as PersonaConsumerCatalog;
    const queries = {
      capabilities: () => ({ localQuery: { fieldUses: {} } }),
    } as unknown as PersonaSourceQueries;
    const attachments = {
      capabilities: () => ({ formats: ["json", "binary"] }),
    } as unknown as PersonaAttachments;
    const pdf = {
      validate: vi.fn(async () => ({ contractValid: true, sqlExecuted: false })),
      locate: vi.fn(async () => ({ state: "captured" })),
      list: vi.fn(async () => ({ items: [] })),
      create: vi.fn(async () => ({ state: "captured" })),
      status: vi.fn(async () => ({ state: "ready" })),
      cancel: vi.fn(async () => ({ state: "cancelled" })),
    };
    for (const enabled of [false, true]) {
      const app = express();
      app.use(express.json());
      app.post(
        "/mcp",
        createPersonaV2McpHandler(
          consumer,
          "http://fixture.test",
          queries,
          undefined,
          undefined,
          mode === "oauth" ? ({ resolve: authenticate } as unknown as PersonaOAuth) : undefined,
          undefined,
          undefined,
          attachments,
          undefined,
          undefined,
          enabled ? (pdf as unknown as PersonaPdfReports) : undefined,
        ),
      );
      const rpc = async (method: string, params: unknown) =>
        parseMcpPayload(
          await request(app)
            .post("/mcp")
            .set("Host", "fixture.test")
            .set("Authorization", "Bearer fixture")
            .set("Accept", "application/json, text/event-stream")
            .send({ jsonrpc: "2.0", id: 1, method, params }),
        );
      const listed = (await rpc("tools/list", {})).result as { tools: { name: string }[] };
      expect(listed.tools.some((tool) => tool.name === "criar_relatorio_pdf")).toBe(enabled);
      for (const name of ["validar_relatorio_pdf", "localizar_relatorio", "listar_relatorios"])
        expect(listed.tools.some((tool) => tool.name === name)).toBe(enabled);
      if (!enabled) continue;
      const jobId = "11111111-1111-4111-8111-111111111111";
      for (const [name, method, args] of [
        ["localizar_relatorio", "locate", { requestId: jobId }],
        ["listar_relatorios", "list", { page: 1, pageSize: 10 }],
      ] as const) {
        const response = await rpc("tools/call", { name, arguments: args });
        expect(response.result).not.toHaveProperty("isError", true);
        expect(pdf[method]).toHaveBeenLastCalledWith(identity, args);
        await rpc("tools/call", { name, arguments: { ...args, sql: "SELECT private" } });
        expect(pdf[method]).toHaveBeenCalledTimes(1);
      }
      const result = await rpc("tools/call", {
        name: "obter_status_relatorio",
        arguments: { jobId },
      });
      expect(result.result).not.toHaveProperty("isError", true);
      expect(pdf.status).toHaveBeenLastCalledWith(identity, { jobId });
      await rpc("tools/call", {
        name: "obter_status_relatorio",
        arguments: { jobId, sql: "SELECT private" },
      });
      expect(pdf.status).toHaveBeenCalledTimes(1);
    }
  },
);

it.each([undefined, "sql"] as const)(
  "PDF guidance distinguishes availability, snapshot and uncertain capture (%s)",
  (topic) => {
    if (topic === "sql")
      expect(trainingTopic(topic).pdfReports).toContain(
        "pdfReports em obter_treinamento_base sem topic",
      );
    const guide = trainingTopic().pdfReports as Record<string, string>;
    expect(guide.availability).toContain("JSON/BLOB não autorizam PDF");
    expect(guide.request).toContain("não crie outra tentativa nem repita SQL");
    expect(guide.completeness).toContain("consistency=not_asserted");
    expect(guide.lifecycle).toContain("polling não renova validade");
    expect(guide.diagnostics).toContain("diagnosticPersisted=false");
    expect(guide.diagnostics).toContain("sem repetir SQL");
    expect(guide.limits).toContain("Coleta em lotes e snapshot forte não estão disponíveis");
    expect(guide.sections).toContain("consistency=successive_reads");
    expect(guide.sections).toContain("simultaneidade ou conciliação garantida, não use esse modo");
    expect(guide.sections).toContain("Falha interrompe as próximas seções");
  },
);
