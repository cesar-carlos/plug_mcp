import type { Source } from "../../src/domain/persona-v2/model.js";

export const trainingSource: Source = {
  id: "11111111-1111-4111-8111-111111111111",
  personaId: "22222222-2222-4222-8222-222222222222",
  physicalSourceId: "33333333-3333-4333-8333-333333333333",
  name: "ERP sintético",
  purpose: "Teste",
  environment: "test",
  agentId: "44444444-4444-4444-8444-444444444444",
  database: "synthetic",
  identityHash: "f".repeat(64),
  identityVerifiedAt: "2026-10-11T00:00:00.000Z",
  dialect: "postgres",
  credentialId: "55555555-5555-4555-8555-555555555555",
  credentialVersion: 1,
  authorizationVersion: 1,
  active: true,
};
/** Synthetic transport proof, never a substitute for actual engine homologation. */
export const sourceProof = (source: Pick<Source, "database" | "dialect"> = trainingSource) => ({
  contractVersion: 1 as const,
  database: source.database,
  dialect: source.dialect,
  identityHash: "f".repeat(64),
  identityKind: source.dialect === "sybase" ? ("provisioned" as const) : ("native" as const),
  engineVersion: "fixture",
  verifiedAt: "2026-10-11T00:00:00.000Z",
});
export const queryTraining = (sourceId = trainingSource.id) => ({
  sourceId,
  dialect: "postgres" as const,
  purpose: "Listagem de pedidos sintéticos",
  sqlModel: "SELECT p.id, p.amount FROM orders p WHERE p.id > :minimum ORDER BY p.id",
  tables: [{ name: "orders", meaning: "Um pedido por identificador", grain: ["id"] }],
  columns: [
    { table: "orders", name: "id", meaning: "Identificador", classification: "livre" as const },
    {
      table: "orders",
      name: "amount",
      meaning: "Valor em reais",
      classification: "livre" as const,
    },
  ],
  relationships: [],
  rules: ["Valores em BRL"],
  parameters: [
    { name: "minimum", type: "number" as const, required: true, meaning: "Identificador mínimo" },
  ],
});

export const attachmentTraining = (sourceId = trainingSource.id) => ({
  ...queryTraining(sourceId),
  columns: queryTraining(sourceId)
    .columns.map((column) => ({
      ...column,
      uses: ["projecao", "filtro", "ordenacao", "exportacao"] as const,
    }))
    .map((column) => ({ ...column, uses: [...column.uses] })),
  attachments: { format: "json" as const, maxBytes: 1048576, ttlMs: 300000 },
});
export const binaryTraining = (sourceId = trainingSource.id) => ({
  ...queryTraining(sourceId),
  sqlModel: "SELECT p.document AS attachment FROM orders p WHERE p.id = :minimum ORDER BY p.id",
  columns: [
    ...queryTraining(sourceId).columns,
    {
      table: "orders",
      name: "document",
      meaning: "Documento sintético",
      classification: "pessoal" as const,
      uses: ["projecao", "exportacao"] as ("projecao" | "exportacao")[],
      usePurpose: "Download explícito de documento sintético autorizado",
    },
  ],
  binaryAttachments: {
    table: "orders",
    column: "document",
    mimeTypes: ["application/pdf"] as "application/pdf"[],
    maxBytes: 1048576,
    ttlMs: 300000,
  },
});
