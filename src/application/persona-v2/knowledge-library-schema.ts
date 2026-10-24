import { z } from "zod";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { KnowledgeLibraryVersion } from "../../domain/ports/knowledge-library.port.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import { structureContentSchema, validateStructureContent } from "./shared-structure-schema.js";
import {
  datasetLogicalType,
  decimalFitsLogicalType,
  stringFitsLogicalType,
} from "./dataset-types.js";
export const LIBRARY_MAX_BYTES = 50 * 1024;
const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(100);
const text = z.string().trim().min(1).max(2000);
export const libraryMetaSchema = z.strictObject({ slug, name: z.string().trim().min(1).max(200) });
export const templatePayloadSchema = z.strictObject({
  kind: z.literal("template"),
  content: structureContentSchema,
});
const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
export const datasetPayloadSchema = z.strictObject({
  kind: z.literal("dataset"),
  templateId: z.uuid(),
  templateVersion: z.number().int().positive(),
  templateHash: z.string().regex(/^[a-f0-9]{64}$/),
  provenance: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("synthetic"), description: text }),
    z.strictObject({ kind: z.literal("authorized"), description: text, authorizationRef: text }),
  ]),
  tables: z
    .array(
      z.strictObject({
        tableId: z.string().min(1).max(100),
        columns: z
          .array(
            z.strictObject({
              name: z
                .string()
                .regex(/^[a-z_][a-z0-9_$]*$/)
                .max(100),
              type: z.enum([
                "string",
                "integer",
                "decimal",
                "number",
                "boolean",
                "date",
                "datetime",
              ]),
            }),
          )
          .min(1)
          .max(100),
        rows: z.array(z.array(scalar).max(100)).max(1000),
      }),
    )
    .min(1)
    .max(64),
});
export const libraryPayloadSchema = z.discriminatedUnion("kind", [
  templatePayloadSchema,
  datasetPayloadSchema,
]);
export type LibraryPayload = z.infer<typeof libraryPayloadSchema>;
export const libraryImportSchema = libraryMetaSchema.extend({ payload: libraryPayloadSchema });
/** Exact editorial versions; import never delegates catalog browsing or publication. */
export const templateReadSchema = z.strictObject({
  catalogId: z.uuid(),
  templateId: z.uuid(),
  templateVersion: z.number().int().positive(),
  templateHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceId: z.uuid(),
  sourceVersion: z.number().int().positive(),
  dialect: z.enum(["postgres", "mssql", "sybase"]),
});

export const templateDraftImportSchema = libraryMetaSchema
  .extend(templateReadSchema.shape)
  .extend({
    exampleId: z.string().min(1).max(100),
    additionalExampleIds: z.array(z.string().min(1).max(100)).max(99).optional(),
    dataset: z
      .strictObject({
        id: z.uuid(),
        version: z.number().int().positive(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    const ids = [input.exampleId, ...(input.additionalExampleIds ?? [])];
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["additionalExampleIds"],
        message: "Exemplos duplicados.",
      });
    }
  });
export function assertLibrarySize(raw: unknown): void {
  const json = canonicalJson(raw);
  if (typeof json !== "string") {
    throw new PersonaV2Error("INVALID_PLAN", "Informe material JSON estruturado.");
  }
  if (new TextEncoder().encode(json).length > LIBRARY_MAX_BYTES || pareceSegredoEmTexto(json)) {
    throw new PersonaV2Error("INVALID_PLAN", "Material excede 50 KiB ou contém possível segredo.");
  }
}
export function decodeLibrary(v: KnowledgeLibraryVersion, crypto: CryptoPort): LibraryPayload {
  const plain = crypto.decrypt(v.payloadEnc);
  if (crypto.sha256Hex(plain) !== v.hash) {
    throw new PersonaV2Error("INVALID_PLAN", "Integridade da biblioteca inválida.");
  }
  const payload = libraryPayloadSchema.parse(JSON.parse(plain));
  if (payload.kind !== v.kind) {
    throw new PersonaV2Error("INVALID_PLAN", "Tipo da biblioteca inválido.");
  }
  return payload;
}
export function candidateTemplate(
  payload: z.infer<typeof templatePayloadSchema>,
  crypto: CryptoPort,
): LibraryPayload {
  const content = validateStructureContent(payload.content, crypto);
  return templatePayloadSchema.parse({
    kind: "template",
    content: {
      ...content,
      examples: content.examples.map((e) => ({ ...e, state: "candidate" as const })),
    },
  });
}
export function validateDataset(
  payload: z.infer<typeof datasetPayloadSchema>,
  template: Extract<LibraryPayload, { kind: "template" }>,
): void {
  const ids = new Set<string>();
  let rows = 0,
    cells = 0;
  for (const table of payload.tables) {
    const definition = template.content.tables.find((t) => t.id === table.tableId);
    if (
      !definition ||
      ids.has(table.tableId) ||
      new Set(table.columns.map((c) => c.name)).size !== table.columns.length
    ) {
      throw new PersonaV2Error("INVALID_PLAN", "Tabela/coluna duplicada ou fora do template.");
    }
    ids.add(table.tableId);
    for (const col of table.columns) {
      const field = definition.columns.find((c) => c.name === col.name);
      if (field?.classification !== "livre") {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Dataset aceita somente campos livres declarados no template.",
        );
      }
      if (datasetLogicalType(field.logicalType) !== col.type) {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Tipo do dataset diverge do template ou é desconhecido; revise o tipo lógico do campo.",
        );
      }
    }
    for (const row of table.rows) {
      rows++;
      cells += row.length;
      if (row.length !== table.columns.length) {
        throw new PersonaV2Error("INVALID_PLAN", "Linha não corresponde às colunas declaradas.");
      }
      row.forEach((value, index) => {
        const col = table.columns[index]!;
        const field = definition.columns.find((c) => c.name === col.name)!;
        const nullable = field.nullable;
        const valid =
          value === null
            ? nullable
            : col.type === "integer"
              ? typeof value === "number" && Number.isSafeInteger(value)
              : col.type === "number"
                ? typeof value === "number" && Number.isFinite(value)
                : col.type === "decimal"
                  ? typeof value === "string" &&
                    /^-?\d+(\.\d+)?$/.test(value) &&
                    decimalFitsLogicalType(value, field.logicalType)
                  : col.type === "boolean"
                    ? typeof value === "boolean"
                    : col.type === "date"
                      ? typeof value === "string" &&
                        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
                        !Number.isNaN(Date.parse(value)) &&
                        new Date(value).toISOString().slice(0, 10) === value
                      : col.type === "datetime"
                        ? typeof value === "string" && z.iso.datetime().safeParse(value).success
                        : typeof value === "string" &&
                          stringFitsLogicalType(value, field.logicalType);
        if (!valid) {
          throw new PersonaV2Error(
            "INVALID_PLAN",
            "Valor incompatível com tipo/nulabilidade do dataset.",
          );
        }
      });
    }
  }
  if (rows > 1000 || cells > 20000) {
    throw new PersonaV2Error("INVALID_PLAN", "Dataset excede 1.000 linhas ou 20.000 células.");
  }
}
