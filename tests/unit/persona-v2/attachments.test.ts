import { afterEach, expect, it, vi } from "vitest";
import { PersonaMemoryAttachments } from "../../../src/infrastructure/persona-v2/attachment-store.js";
import { PersonaAttachments } from "../../../src/application/persona-v2/attachments.js";
import type { PersonaConsumerCatalog } from "../../../src/application/persona-v2/consumer-catalog.js";
import { PersonaSourceQueries } from "../../../src/application/persona-v2/source-query.js";
import {
  PersonaQueryReuse,
  PersonaMemoryQueryStore,
} from "../../../src/infrastructure/persona-v2/query-reuse.js";
import {
  compileQueryTraining,
  sourceFingerprint,
} from "../../../src/application/persona-v2/query-training.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { attachmentBinding } from "../../../src/domain/persona-v2/attachments.js";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import { queryLimits } from "../../../src/domain/persona-v2/execution-limits.js";
import {
  attachmentTraining,
  binaryTraining,
  queryTraining,
  trainingSource,
} from "../../helpers/persona-v2-training.js";
import type { SourceQueryLease } from "../../../src/domain/ports/source-query.port.js";
import { verifyAttachmentStructure } from "../../../src/application/persona-v2/attachment-structure.js";
import type {
  ExpectedStructure,
  SourceSchemaEvidence,
} from "../../../src/domain/persona-v2/source-schema.js";
import { sourceProof } from "../../helpers/persona-v2-training.js";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { assertBinaryProjection } from "../../../src/application/persona-v2/binary-attachment.js";
import {
  decodeBinaryCell,
  isBinaryColumn,
  binaryMedia,
} from "../../../src/application/persona-v2/binary-attachment.js";
import type { SqlExecuteResult } from "../../../src/domain/ports/plug-server-gateway.port.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
const identity = {
  personaId: trainingSource.personaId,
  tokenId: "token",
  tokenVersion: 1,
  personaVersion: 1,
};
const stores: PersonaMemoryAttachments[] = [];
const store = (now?: () => number) => {
  const value = new PersonaMemoryAttachments(crypto, now);
  stores.push(value);
  return value;
};
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  vi.restoreAllMocks();
});
const fixture = () => {
  const pkg = compileQueryTraining(attachmentTraining(), trainingSource, crypto);
  const evidence = {
    source: trainingSource,
    cacheFence: { revision: "1", writePending: false },
    executionLimits: queryLimits(),
    publications: [
      {
        id: "publication",
        personaId: identity.personaId,
        skillId: "skill",
        revision: 1,
        package: pkg,
        hash: crypto.sha256Hex(canonicalJson(pkg)),
        sourceVersion: 1,
        sourceFingerprint: sourceFingerprint(trainingSource, crypto),
        suspendedAt: null,
      },
    ],
  };
  const catalog = {
    query: vi.fn(async () => evidence),
    revalidateQuery: vi.fn<PersonaConsumerCatalog["revalidateQuery"]>(async () => undefined),
    sourceForVerification: vi.fn(async () => trainingSource),
    suspendStructuralQuery: vi.fn(async () => undefined),
  };
  const lease = {
    policyFingerprint: "a".repeat(64),
    execute: vi.fn<() => Promise<SqlExecuteResult>>(async () => ({
      columns: ["id", "amount"],
      rows: [{ id: 1, amount: "10.25" }],
    })),
    revalidate: vi.fn(async () => undefined),
  };
  const gateway = { authorize: vi.fn(async () => lease) };
  const queries = new PersonaSourceQueries(catalog, gateway);
  const memory = store();
  return {
    evidence,
    catalog,
    lease,
    gateway,
    queries,
    memory,
    service: new PersonaAttachments(catalog, queries, gateway, memory, crypto),
  };
};
const input = { format: "json", query: { skillIds: [trainingSource.id], params: { minimum: 0 } } };
const binaryInput = {
  ...input,
  format: "binary",
  query: { ...input.query, params: { minimum: 1 } },
};
const binaryFixture = () => {
  const f = fixture(),
    bytes = Buffer.from("%PDF-1.4\n% Fixture\n%%EOF\n", "ascii");
  f.evidence.publications[0]!.package = compileQueryTraining(
    binaryTraining(),
    trainingSource,
    crypto,
  );
  const result: SqlExecuteResult = {
    columns: ["attachment"],
    rows: [{ attachment: bytes.toString("base64") }],
    columnsMetadata: [{ name: "attachment", odbcType: -4 }],
    truncated: false,
  };
  f.lease.execute.mockResolvedValue(result);
  return { ...f, bytes, result };
};

it("entrega bytes originais com tipo publicado e nome seguro, sem expor base64 pela consulta comum", async () => {
  const f = binaryFixture(),
    descriptor = await f.service.create(identity, binaryInput);
  expect(descriptor).toMatchObject({
    format: "binary",
    mimeType: "application/pdf",
    rows: 1,
    complete: true,
    classifications: ["pessoal"],
  });
  expect(descriptor.filename).toMatch(/^consulta-[a-f0-9-]+\.pdf$/);
  const read = await f.service.read(identity, descriptor.handle);
  expect(Buffer.from(read.data)).toEqual(f.bytes);
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  await expect(f.queries.run(identity, binaryInput.query)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  await expect(f.queries.exportJson(identity, binaryInput.query)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
});
it("metadados ausentes, textuais, conflitantes e base64 não canônico não criam arquivo", async () => {
  const f = binaryFixture();
  for (const columnsMetadata of [
    undefined,
    [{ name: "attachment", odbcType: 12 }],
    [{ name: "attachment", odbcType: -4, type: "text" }],
    [
      { name: "attachment", odbcType: -4 },
      { name: "attachment", odbcType: -4 },
    ],
    [{ name: "other", odbcType: -4 }],
  ]) {
    f.lease.execute.mockResolvedValue({ ...f.result, columnsMetadata });
    await expect(f.service.create(identity, binaryInput)).rejects.toThrow();
  }
  for (const value of [
    null,
    { type: "Buffer", data: [1] },
    [1, 2],
    "not base64",
    "YR==",
    "YQ",
    "",
    " YQ==",
    "YQ==\n",
  ]) {
    f.lease.execute.mockResolvedValue({ ...f.result, rows: [{ attachment: value }] });
    await expect(f.service.create(identity, binaryInput)).rejects.toThrow();
  }
  expect(isBinaryColumn({ name: "file", type: "bytea" })).toBe(true);
  expect(isBinaryColumn({ name: "file", type: "long binary" })).toBe(true);
  for (const odbcType of [-2, -3, -4]) {
    expect(isBinaryColumn({ name: "file", odbcType })).toBe(true);
  }
  expect(isBinaryColumn({ name: "file", odbcType: 7, typeSystem: "odbc_fast" })).toBe(true);
  for (const column of [
    { name: "file", odbcType: 7 },
    { name: "file", odbcType: 7, typeSystem: "odbc" },
    { name: "file", odbcType: -4, typeSystem: "unknown" },
    { name: "file", odbcType: -4, typeSystem: "odbc_fast" },
    { name: "file", odbcType: 99, typeSystem: "odbc_fast" },
    { name: "file", odbcType: 7, typeSystem: "odbc_fast", type: "text" },
  ]) {
    expect(isBinaryColumn(column)).toBe(false);
  }
});
it("exige unicidade e completude, recusa paginação, expressão, UNION e outro campo antes do envio", async () => {
  const f = binaryFixture();
  // Even identical bytes in different records must not be collapsed into one file.
  for (const dialect of ["postgres", "mssql", "sybase"] as const) {
    for (const sql of [
      "SELECT DISTINCT p.document AS attachment FROM orders p ORDER BY p.document",
      "SELECT p.document AS attachment FROM orders p GROUP BY p.document ORDER BY p.document",
    ]) {
      expect(() =>
        assertBinaryProjection(parseSelect(sql, dialect), binaryTraining().binaryAttachments),
      ).toThrow(/agrupamento|DISTINCT/);
    }
  }
  for (const result of [
    { ...f.result, rows: [] },
    { ...f.result, rows: [...f.result.rows, ...f.result.rows] },
    { ...f.result, truncated: true },
    { ...f.result, truncated: undefined },
    {
      ...f.result,
      pagination: { page: 1, pageSize: 2, hasNextPage: true, hasPreviousPage: false },
    },
  ]) {
    f.lease.execute.mockResolvedValue(result);
    await expect(f.service.create(identity, binaryInput)).rejects.toThrow();
  }
  f.lease.execute.mockClear();
  for (const sql of [
    "SELECT p.id AS attachment FROM orders p WHERE p.id = :minimum",
    "SELECT CAST(p.document AS TEXT) AS attachment FROM orders p WHERE p.id = :minimum",
    `${binaryTraining().sqlModel} UNION ALL ${binaryTraining().sqlModel}`,
    `${binaryTraining().sqlModel} LIMIT 1`,
  ]) {
    await expect(
      f.service.create(identity, { ...binaryInput, query: { ...binaryInput.query, sql } }),
    ).rejects.toThrow();
  }
  await expect(
    f.service.create(identity, {
      ...binaryInput,
      query: { ...binaryInput.query, options: { page: 1, pageSize: 1 } },
    }),
  ).rejects.toThrow();
  await expect(
    f.service.create(identity, {
      ...binaryInput,
      query: { ...binaryInput.query, options: { maxRows: 1 } },
    }),
  ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  f.evidence.executionLimits.maxRows = 1;
  await expect(f.service.create(identity, binaryInput)).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  expect(f.lease.execute).not.toHaveBeenCalled();
});
it("capability binária é nova; isolamento, policy e revogação também protegem seus bytes", async () => {
  const f = binaryFixture(),
    file = await f.service.create(identity, binaryInput);
  await expect(
    f.service.read(
      { ...identity, grant: { id: "other", expiresAt: Date.now() + 1000 } },
      file.handle,
    ),
  ).rejects.toThrow();
  f.lease.policyFingerprint = "b".repeat(64);
  await expect(f.service.read(identity, file.handle)).rejects.toMatchObject({
    code: "STALE_AUTHORIZATION",
  });
  const pkg = f.evidence.publications[0]!.package;
  f.evidence.publications[0]!.package = {
    ...pkg,
    requiredCapabilities: pkg.requiredCapabilities.filter(
      (c) => !c.startsWith("binary-attachment-contract:"),
    ),
  };
  const before = f.lease.execute.mock.calls.length;
  await expect(f.service.create(identity, binaryInput)).rejects.toThrow();
  expect(f.lease.execute.mock.calls.length).toBe(before);
});
it("arquivo opaco exige concessão própria; tipo de assinatura não executa nem converte conteúdo", () => {
  for (const [bytes, mimeType, extension] of [
    [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png", "png"],
    [Buffer.from([255, 216, 255]), "image/jpeg", "jpg"],
    [Buffer.from("RIFF0000WEBP"), "image/webp", "webp"],
  ] as const) {
    expect(binaryMedia(bytes, [mimeType])).toEqual({ mimeType, extension });
    expect(() => binaryMedia(bytes, ["application/pdf"])).toThrow();
  }
  expect(binaryMedia(Buffer.from("<html>data</html>"), ["application/octet-stream"])).toEqual({
    mimeType: "application/octet-stream",
    extension: "bin",
  });
  expect(() => binaryMedia(Buffer.from("<svg/>"), ["image/png"])).toThrow();
  expect(() => decodeBinaryCell("AAAA", 2)).toThrow();
  const bytes = Buffer.alloc(1048576, 255);
  expect(decodeBinaryCell(bytes.toString("base64"), bytes.length)).toEqual(bytes);
});

it("handles opacos isolam persona, token, versão e concessão; refresh não estende a validade", () => {
  let now = 1000;
  const memory = store(() => now),
    bind = attachmentBinding(identity);
  const handle = memory.put(bind, "private", 2000);
  expect(handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(memory.get(handle, bind)).toBe("private");
  for (const other of [
    { ...identity, tokenId: "other" },
    { ...identity, personaId: "other" },
    { ...identity, tokenVersion: 2 },
    { ...identity, personaVersion: 2 },
    { ...identity, grant: { id: "oauth", expiresAt: 1500 } },
  ]) {
    expect(memory.get(handle, attachmentBinding(other))).toBeNull();
    memory.remove(handle, attachmentBinding(other));
  }
  expect(memory.get(handle, bind)).toBe("private");
  expect(attachmentBinding({ ...identity, grant: { id: "oauth", expiresAt: 1500 } })).toBe(
    attachmentBinding({ ...identity, grant: { id: "oauth", expiresAt: 1999 } }),
  );
  now = 2000;
  expect(memory.get(handle, bind)).toBeNull();
  memory.close();
  expect(() => memory.put(bind, "private", 2500)).toThrow();
});
it("quota não expulsa handles vivos e corrupção falha fechada", () => {
  const memory = store(),
    until = Date.now() + 60000;
  const handles = Array.from({ length: 8 }, () => memory.put("consumer", "secret", until));
  expect(() => memory.put("consumer", "overflow", until)).toThrow(/Quota/);
  expect(memory.get(handles[0]!, "consumer")).toBe("secret");
  vi.spyOn(crypto, "decrypt").mockImplementation(() => {
    throw new Error("corrupt");
  });
  expect(memory.get(handles[0]!, "consumer")).toBeNull();
});
it("cria por SELECT fresco, preserva decimal/proveniência e baixa sem novo SQL", async () => {
  const f = fixture();
  const file = await f.service.create(identity, input);
  expect(file).toMatchObject({ rows: 1, mimeType: "application/json", classifications: ["livre"] });
  expect(file.filename).not.toContain(file.handle);
  const read = await f.service.read(identity, file.handle);
  const text = Buffer.from(read.data).toString("utf8");
  expect(JSON.parse(text)).toMatchObject({
    rows: [{ id: 1, amount: "10.25" }],
    provenance: { sourceId: trainingSource.id },
  });
  expect(text).not.toMatch(/SELECT|minimum|credential|clientToken/);
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  expect(
    f.catalog.revalidateQuery.mock.calls.some(
      (call) => call[2]?.attachment?.event === "downloaded",
    ),
  ).toBe(true);
  await expect(
    f.service.read({ ...identity, tokenId: "other" }, file.handle),
  ).rejects.toMatchObject({ code: "ATTACHMENT_UNAVAILABLE" });
  expect((await f.service.read(identity, file.handle)).descriptor.readAt).toBe(file.readAt);
});
it("contrato e finalidade são explícitos; exportação reservada antiga não habilita anexo", async () => {
  const f = fixture();
  f.evidence.publications[0]!.package = compileQueryTraining(
    queryTraining(),
    trainingSource,
    crypto,
  );
  await expect(f.service.create(identity, input)).rejects.toThrow();
  expect(f.lease.execute).not.toHaveBeenCalled();
  f.evidence.publications[0]!.package = compileQueryTraining(
    attachmentTraining(),
    trainingSource,
    crypto,
  );
  f.evidence.publications[0]!.package = {
    ...f.evidence.publications[0]!.package,
    requiredCapabilities: f.evidence.publications[0]!.package.requiredCapabilities.filter(
      (c) => !c.startsWith("attachment-contract:"),
    ),
  };
  await expect(f.service.create(identity, input)).rejects.toThrow();
  expect(f.lease.execute).not.toHaveBeenCalled();
  f.evidence.publications[0]!.package = compileQueryTraining(
    {
      ...attachmentTraining(),
      columns: attachmentTraining().columns.map((c) =>
        c.name === "amount" ? { ...c, uses: ["projecao"] } : c,
      ),
    },
    trainingSource,
    crypto,
  );
  await expect(f.service.create(identity, input)).rejects.toThrow();
  expect(f.lease.execute).not.toHaveBeenCalled();
});
it("policy, autoridade, operações pendentes e expiração são revalidadas; falha invalida somente o handle próprio", async () => {
  const f = fixture();
  const file = await f.service.create(identity, input);
  f.lease.policyFingerprint = "b".repeat(64);
  await expect(f.service.read(identity, file.handle)).rejects.toMatchObject({
    code: "STALE_AUTHORIZATION",
  });
  expect(f.memory.get(file.handle, attachmentBinding(identity))).toBeNull();
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  f.evidence.cacheFence.writePending = true;
  await expect(f.service.create(identity, input)).rejects.toThrow();
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
});
it("anexo ignora cache e singleflight mesmo quando consultas comuns os habilitam", async () => {
  const f = fixture(),
    reuse = new PersonaQueryReuse(
      new PersonaMemoryQueryStore(),
      crypto,
      "fixture-key",
      "https://fixture.test",
      1000,
    );
  const reused = vi.spyOn(reuse, "run"),
    queries = new PersonaSourceQueries(f.catalog, f.gateway, reuse);
  await queries.exportJson(identity, input.query);
  await queries.exportJson(identity, input.query);
  expect(f.lease.execute).toHaveBeenCalledTimes(2);
  expect(reused).not.toHaveBeenCalled();
});
it("aliases, expressões e UNION não ocultam campo sem finalidade de exportação", async () => {
  const f = fixture();
  const raw = {
    ...attachmentTraining(),
    columns: attachmentTraining().columns.map((c) =>
      c.name === "amount"
        ? {
            ...c,
            classification: "pessoal",
            uses: ["projecao", "filtro"],
            usePurpose: "Inspeção sintética",
          }
        : c,
    ),
  };
  f.evidence.publications[0]!.package = compileQueryTraining(raw, trainingSource, crypto);
  for (const sql of [
    "SELECT p.amount AS harmless FROM orders p WHERE p.id > :minimum",
    "SELECT p.amount + p.id AS harmless FROM orders p WHERE p.id > :minimum",
    "SELECT p.id AS value FROM orders p WHERE p.id > :minimum UNION ALL SELECT p.amount AS value FROM orders p WHERE p.id > :minimum",
  ])
    await expect(f.queries.exportJson(identity, { ...input.query, sql })).rejects.toThrow();
  expect(f.lease.execute).not.toHaveBeenCalled();
});
it("prazo vencido durante revalidação remota descarta leitura e impede reutilizar o handle", async () => {
  const f = fixture();
  const file = await f.service.create(identity, input);
  vi.mocked(f.lease.revalidate).mockImplementationOnce(async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(file.expiresAt));
  });
  await expect(f.service.read(identity, file.handle)).rejects.toThrow();
  expect(f.memory.get(file.handle, attachmentBinding(identity))).toBeNull();
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
});
it("auditoria indisponível não entrega handle nem arquivo; prazo vencido durante download não entrega bytes", async () => {
  const f = fixture();
  const put = vi.spyOn(f.memory, "put");
  f.catalog.revalidateQuery.mockImplementation(async (...args) => {
    if (args[2]?.attachment) {
      throw new Error("audit unavailable");
    }
  });
  await expect(f.service.create(identity, input)).rejects.toThrow("audit unavailable");
  expect(
    f.memory.get(put.mock.results[0]!.value as string, attachmentBinding(identity)),
  ).toBeNull();
  f.catalog.revalidateQuery.mockResolvedValue(undefined);
  const file = await f.service.create(identity, input);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(file.expiresAt));
  await expect(f.service.read(identity, file.handle)).rejects.toMatchObject({
    code: "ATTACHMENT_UNAVAILABLE",
  });
});

it("guarda estrutural verifica apenas dependências; prova desconhecida recusa sem suspender, drift comprovado suspende", async () => {
  const expected: ExpectedStructure = {
    version: 1,
    resources: [
      {
        resource: { schema: null, name: "orders", type: "table" },
        columns: [{ name: "id", nativeType: "integer", nullable: false, size: null, scale: null }],
        constraints: {
          primaryKeys: [{ name: "pk", columns: ["id"], status: "enabled" }],
          uniqueKeys: [],
          foreignKeys: [],
        },
      },
    ],
  };
  const page: SourceSchemaEvidence = {
    contractVersion: 1,
    identity: sourceProof(),
    observedAt: new Date().toISOString(),
    metadataPage: { offset: 0, pageSize: 1, nextOffset: null },
    resources: [
      {
        resource: expected.resources[0]!.resource,
        status: "available",
        columns: [
          { ...expected.resources[0]!.columns[0]!, ordinal: 1 },
          {
            name: "unrelated",
            nativeType: "text",
            ordinal: 2,
            nullable: true,
            size: null,
            scale: null,
          },
        ],
        primaryKeys: structuredClone(expected.resources[0]!.constraints!.primaryKeys),
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
      },
    ],
  };
  const lease: SourceQueryLease = {
      execute: vi.fn(),
      revalidate: vi.fn(),
      inspectSchema: vi.fn(async () => page),
    },
    mismatch = vi.fn(async () => undefined);
  await verifyAttachmentStructure(lease, expected, mismatch, () => undefined);
  expect(mismatch).not.toHaveBeenCalled();
  page.resources[0]!.primaryKeys[0]!.status = "unknown";
  await expect(
    verifyAttachmentStructure(lease, expected, mismatch, () => undefined),
  ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  expect(mismatch).not.toHaveBeenCalled();
  page.resources[0]!.primaryKeys[0]!.status = "disabled";
  await expect(
    verifyAttachmentStructure(lease, expected, mismatch, () => undefined),
  ).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  expect(mismatch).toHaveBeenCalledOnce();
});
