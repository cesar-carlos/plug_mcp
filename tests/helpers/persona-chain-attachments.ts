import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import request, { type Response } from "supertest";
import { expect } from "vitest";
import type { Source } from "../../src/domain/persona-v2/model.js";
import type { AttachmentDescriptor } from "../../src/domain/persona-v2/attachments.js";
import { parseMcpPayload } from "./mcp-rpc.js";

/** Must match the closed native fixture; signature samples are not rendered documents. */
const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n% Se7e fixture\n"), Buffer.from([0, 128, 255])]);
export const chainBinarySamples = [
  { id: 1, mime: "application/pdf", bytes: pdf },
  { id: 2, mime: "image/png", bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]) },
  { id: 3, mime: "image/jpeg", bytes: Buffer.from([255, 216, 255, 0, 128, 255]) },
  {
    id: 4,
    mime: "image/webp",
    bytes: Buffer.concat([Buffer.from("RIFF0000WEBP"), Buffer.from([0, 255])]),
  },
  {
    id: 5,
    mime: "application/octet-stream",
    bytes: Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  },
  {
    id: 9,
    mime: "application/pdf",
    bytes: Buffer.concat([
      pdf,
      Buffer.from(Array.from({ length: 80 * 1024 }, (_, i) => (i * 31 + 17) % 256)),
    ]),
  },
];

interface Context {
  source: Source;
  personaId: string;
  url: string;
  post(path: string, body: unknown): PromiseLike<Response>;
  tool(name: string, args: unknown, bearer: string): Promise<{ isError: boolean; value: unknown }>;
  publish(skillId: string): Promise<{ publicationId: string; capabilities: string[] }>;
  sqlCalls(): number;
  authorityCalls(): number;
}
export interface ChainBinaryConsumer {
  bearer: string;
  handle: string;
  create(): Promise<{ isError: boolean; value: unknown }>;
  download(url: string, handle?: string): PromiseLike<Response>;
  downloadRevoked(url: string): PromiseLike<Response>;
}

/** Real composition only: training and business reads use HTTP/MCP/hub/agent. */
export async function exerciseChainBinaryAttachments(c: Context): Promise<ChainBinaryConsumer> {
  const table = `${c.source.dialect === "postgres" ? "public" : c.source.dialect === "mssql" ? "dbo" : "dba"}.binary_fixture`;
  const draft = await c.post(`/api/admin/personas/${c.personaId}/skills`, {
    slug: `binary-${c.source.dialect}`,
    name: `Arquivos da fixture ${c.source.dialect}`,
    kind: "consulta",
    training: {
      sourceId: c.source.id,
      dialect: c.source.dialect,
      purpose: "Download explícito de bytes sintéticos da base concedida",
      sqlModel: `SELECT p.document AS attachment FROM ${table} p WHERE p.id >= :minimum AND p.id <= :maximum ORDER BY p.id`,
      tables: [{ name: table, meaning: "Arquivo sintético por ID", grain: ["id"] }],
      columns: [
        {
          table,
          name: "id",
          meaning: "Identificador sintético",
          classification: "livre",
          uses: ["filtro", "ordenacao"],
        },
        {
          table,
          name: "document",
          meaning: "Bytes sintéticos",
          classification: "pessoal",
          uses: ["projecao", "exportacao"],
          usePurpose: "Download explícito autorizado na homologação isolada",
        },
      ],
      relationships: [],
      rules: ["Não inferir arquivo de texto; baixar somente um registro completo"],
      parameters: ["minimum", "maximum"].map((name) => ({
        name,
        type: "number",
        required: true,
        meaning: "Faixa explícita de identificadores",
      })),
      binaryAttachments: {
        table,
        column: "document",
        mimeTypes: [...new Set(chainBinarySamples.map((s) => s.mime))],
        maxBytes: 1048576,
        ttlMs: 900000,
      },
    },
  });
  expect(draft.status, JSON.stringify(draft.body)).toBe(201);
  const skillId = draft.body.skill.id as string;
  const publication = await c.publish(skillId);
  const emit = async (capabilities = publication.capabilities, personaId = c.personaId) => {
    const token = await c.post(`/api/admin/personas/${personaId}/tokens`, {
      name: "Consumidor binário de fixture",
      expiresAt: null,
      delegation: { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] },
      permissions: {
        sourceIds: personaId === c.personaId ? [c.source.id] : [],
        skills:
          personaId === c.personaId
            ? [{ skillId, capabilities, effects: ["select"], requireHumanApproval: false }]
            : [],
        externalOperationIds: [],
        administrative: [],
      },
    });
    expect(token.status, JSON.stringify(token.body)).toBe(201);
    return { bearer: token.body.bearer as string, tokenId: token.body.tokenId as string };
  };
  const token = await emit();
  const create = (minimum = 1, maximum = minimum, bearer = token.bearer, options?: object) =>
    c.tool(
      "criar_anexo_consulta",
      {
        format: "binary",
        query: {
          fonteId: c.source.id,
          skillIds: [skillId],
          params: { minimum, maximum },
          ...(options ? { options } : {}),
        },
      },
      bearer,
    );
  const download = (url: string, handle: string, bearer = token.bearer) =>
    request(url)
      .get(`/api/consumer/bearer/attachments/${handle}`)
      .set("Host", new URL(url).host)
      .set("Authorization", `Bearer ${bearer}`);
  let held!: AttachmentDescriptor;
  for (const sample of chainBinarySamples) {
    const created = await create(sample.id);
    expect(created.isError, JSON.stringify(created.value)).toBe(false);
    const file = created.value as AttachmentDescriptor;
    expect(file).toMatchObject({
      format: "binary",
      mimeType: sample.mime,
      bytes: sample.bytes.length,
      complete: true,
      rows: 1,
      sourceId: c.source.id,
      provenance: {
        sourceId: c.source.id,
        dialect: c.source.dialect,
        publications: [{ id: publication.publicationId }],
      },
    });
    expect(file.filename).not.toContain(file.handle);
    const before = c.sqlCalls();
    const authorityBefore = c.authorityCalls();
    const reply = await download(c.url, file.handle);
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(reply.headers["content-type"]).toBe(sample.mime);
    expect(reply.headers["cache-control"]).toContain("no-store");
    expect(reply.headers["content-disposition"]).toMatch(
      /^attachment; filename="consulta-[a-f0-9-]+\.(pdf|png|jpg|webp|bin)"$/,
    );
    expect(Buffer.from(reply.body)).toEqual(sample.bytes);
    const resource = await request(c.url)
      .post("/mcp")
      .set("Host", new URL(c.url).host)
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${token.bearer}`)
      .send({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "resources/read",
        params: { uri: file.uri },
      });
    expect(resource.status).toBe(200);
    const contents = (
      parseMcpPayload(resource).result as { contents: { mimeType: string; blob: string }[] }
    ).contents;
    expect(contents[0]!.mimeType).toBe(sample.mime);
    expect(Buffer.from(contents[0]!.blob, "base64")).toEqual(sample.bytes);
    const toolRead = await c.tool("obter_anexo", { handle: file.handle }, token.bearer);
    expect(toolRead.isError, JSON.stringify(toolRead.value)).toBe(false);
    expect(c.sqlCalls()).toBe(before);
    expect(c.authorityCalls()).toBeGreaterThan(authorityBefore);
    held = file;
  }
  for (const [minimum, maximum] of [
    [6, 6],
    [7, 7],
    [999, 999],
    [1, 8],
  ]) {
    const invalid = await create(minimum, maximum);
    expect(invalid.isError, JSON.stringify(invalid.value)).toBe(true);
    expect(invalid.value).not.toHaveProperty("handle");
  }
  const before = c.sqlCalls();
  for (const options of [{ maxRows: 1 }, { page: 2, pageSize: 1 }]) {
    expect((await create(1, 1, token.bearer, options)).isError).toBe(true);
  }
  const normal = await c.tool(
    "consultar_dados",
    { fonteId: c.source.id, skillIds: [skillId], params: { minimum: 1, maximum: 1 } },
    token.bearer,
  );
  expect(normal.isError).toBe(true);
  expect(normal.value).not.toHaveProperty("rows");
  const limited = await emit(
    publication.capabilities.filter((cap) => !cap.startsWith("binary-attachment-contract:")),
  );
  expect((await create(1, 1, limited.bearer)).isError).toBe(true);
  const other = await emit();
  expect((await download(c.url, held.handle, other.bearer)).status).toBe(404);
  const persona = await c.post("/api/admin/personas", {
    name: "Outra persona de fixture",
    specialty: "Isolamento",
    instructions: "Sem acesso ao arquivo da outra persona",
  });
  expect(persona.status).toBe(201);
  const otherPersona = await emit([], persona.body.persona.id as string);
  expect((await download(c.url, held.handle, otherPersona.bearer)).status).toBe(404);
  expect(c.sqlCalls()).toBe(before);
  const revoked = await c.post(
    `/api/admin/personas/${c.personaId}/tokens/${token.tokenId}/revogar`,
    {},
  );
  expect(revoked.status).toBe(204);
  expect((await download(c.url, held.handle)).status).toBe(401);
  expect(c.sqlCalls()).toBe(before);
  const live = await create(1, 1, other.bearer);
  expect(live.isError, JSON.stringify(live.value)).toBe(false);
  const heldHandle = (live.value as AttachmentDescriptor).handle;
  return {
    bearer: other.bearer,
    handle: heldHandle,
    create: () => create(1, 1, other.bearer),
    download: (url, handle = heldHandle) => download(url, handle, other.bearer),
    downloadRevoked: (url) => download(url, held.handle, token.bearer),
  };
}
