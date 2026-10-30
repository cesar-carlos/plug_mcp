import { z } from "zod";
import { querySemanticsSchema, assertQuerySemantics } from "./query-semantics.js";
import {
  attachmentContractSchema,
  binaryAttachmentContractSchema,
} from "../../domain/persona-v2/attachments.js";
import { assertBinaryProjection } from "./binary-attachment.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import { canonicalJson, type QueryPackage } from "../../domain/persona-v2/catalog.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { validateSourceSql } from "./source-sql.js";
import { assertQueryRelationshipPaths } from "./query-relationship-paths.js";
import { assertFanoutSeguro } from "../use-cases/shared/assert-fanout.js";
import type { EscopoSkill } from "../../domain/entities/escopo.js";
import { extractNamedParams } from "../use-cases/shared/sql-modelo.js";
import { PERSONA_V2_TRAINING_BASE } from "./training-base.js";
import { parseSourceRestrictions, enforceSourceRestrictions } from "./source-restrictions.js";
import {
  fieldUsesSchema,
  executableField,
  fieldUseCapability,
} from "../../domain/persona-v2/field-use.js";
import { assertQueryFieldUses } from "./query-field-uses.js";
import { queryLimitsSchema } from "../../domain/persona-v2/execution-limits.js";
import {
  knowledgeSelectionSchema,
  trainedRelationshipSchema,
} from "../../domain/persona-v2/knowledge-adoption.js";

const identifier = z
  .string()
  .regex(/^[a-z_][a-z0-9_$]*(\.[a-z_][a-z0-9_$]*)?$/)
  .max(200);
const columnName = z
  .string()
  .regex(/^[a-z_][a-z0-9_$]*$/)
  .max(100);
const text = z.string().trim().min(1).max(5000);
export const queryTrainingSchema = z.strictObject({
  semantics: querySemanticsSchema.optional(),
  binaryAttachments: binaryAttachmentContractSchema.optional(),
  attachments: attachmentContractSchema.optional(),
  limits: queryLimitsSchema.optional(),
  sharedKnowledge: knowledgeSelectionSchema.optional(),
  sourceId: z.uuid(),
  dialect: z.enum(["postgres", "mssql", "sybase"]),
  purpose: text,
  sqlModel: z.string().min(1).max(30000),
  examples: z
    .array(
      z.strictObject({
        id: z
          .string()
          .regex(/^[a-z][a-z0-9_-]*$/)
          .max(100),
        purpose: text,
        sql: z.string().min(1).max(30000),
        explanation: text,
        state: z.enum(["candidate", "approved", "inactive", "replaced"]).optional(),
      }),
    )
    .max(100)
    .optional(),
  tables: z
    .array(
      z.strictObject({
        name: identifier,
        resourceType: z.enum(["table", "view"]).default("table"),
        meaning: text,
        grain: z.array(columnName).min(1).max(32),
      }),
    )
    .min(1)
    .max(64),
  columns: z
    .array(
      z.strictObject({
        table: identifier,
        name: columnName,
        meaning: text,
        classification: z.enum(["livre", "sensivel", "pessoal", "segredo", "inferido"]),
        uses: fieldUsesSchema.optional(),
        usePurpose: text.optional(),
      }),
    )
    .min(1)
    .max(1024),
  relationships: z.array(trainedRelationshipSchema).max(128),
  rules: z.array(text).max(100),
  parameters: z
    .array(
      z.strictObject({
        name: columnName,
        type: z.enum(["string", "number", "integer", "decimal", "boolean", "date", "datetime"]),
        required: z.boolean(),
        meaning: text,
      }),
    )
    .max(100),
});

export type QueryTraining = z.infer<typeof queryTrainingSchema>;

export const sourceFingerprint = (source: Source, crypto: CryptoPort): string =>
  crypto.sha256Hex(canonicalJson(source));

/** Structural validation only. It never executes training SQL or approves business semantics. */
export const compileQueryTraining = (
  raw: unknown,
  source: Source,
  crypto: CryptoPort,
): QueryPackage => {
  const training = queryTrainingSchema.parse(raw);
  assertQuerySemantics(training);
  assertQueryRelationshipPaths(training);
  if (
    training.attachments &&
    !training.columns.some((field) => field.uses?.includes("exportacao"))
  ) {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Anexos exigem finalidade de exportação explícita nos campos.",
    );
  }
  for (const field of training.columns) {
    if (
      field.uses &&
      (field.classification === "segredo" ||
        field.classification === "inferido" ||
        (field.classification !== "livre" && !field.usePurpose))
    ) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Finalidades exigem campo confirmado e justificativa para dados pessoais ou sensíveis.",
      );
    }
  }
  if (training.tables.some((table) => table.name.split(".").at(-1) === "se7e_source_identity"))
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "A tabela de identidade é reservada à verificação do agente.",
    );
  const restrictions = parseSourceRestrictions(source.rowRestrictions);
  if (training.parameters.some((p) => p.name.startsWith("__scope_"))) {
    throw new PersonaV2Error("INVALID_PLAN", "Parâmetro de recorte é reservado ao servidor.");
  }
  if (!source.active || training.sourceId !== source.id || training.dialect !== source.dialect) {
    throw new PersonaV2Error("INVALID_PLAN", "Fonte ou dialeto divergente do treinamento.");
  }
  if (pareceSegredoEmTexto(canonicalJson(training))) {
    throw new PersonaV2Error("INVALID_PLAN", "Treinamento contém segredo; use o cofre da fonte.");
  }
  const tables = new Map(training.tables.map((t) => [t.name, t]));
  const columns = new Set(training.columns.map((c) => `${c.table}.${c.name}`));
  const freeColumns = new Set(
    training.columns.filter(executableField).map((c) => `${c.table}.${c.name}`),
  );
  if (
    tables.size !== training.tables.length ||
    new Set(training.examples?.map((e) => e.id)).size !== (training.examples?.length ?? 0) ||
    columns.size !== training.columns.length ||
    new Set(training.parameters.map((p) => p.name)).size !== training.parameters.length ||
    training.columns.some((c) => !tables.has(c.table)) ||
    training.tables.some(
      (t) =>
        new Set(t.grain).size !== t.grain.length ||
        t.grain.some(
          (c) =>
            !training.columns.some(
              (col) => col.table === t.name && col.name === c && executableField(col),
            ),
        ),
    ) ||
    training.relationships.some(
      (r) =>
        !tables.has(r.from) ||
        !tables.has(r.to) ||
        r.keys.some(
          (k) => !freeColumns.has(`${r.from}.${k.from}`) || !freeColumns.has(`${r.to}.${k.to}`),
        ),
    )
  ) {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Estrutura duplicada ou referência física não treinada.",
    );
  }
  if (
    [training.sqlModel, ...(training.examples?.map((e) => e.sql) ?? [])].some((sql) =>
      extractNamedParams(sql).some(
        (name) =>
          !training.parameters.some((p) => p.name === name) &&
          !restrictions.some((r) => r.parameter === name),
      ),
    )
  ) {
    throw new PersonaV2Error("INVALID_PLAN", "SQL contém parâmetro sem contrato tipado.");
  }
  // Restricted fields enter only through explicit published purposes and token capabilities.
  const scope: EscopoSkill = {
    tabelas: [...tables.keys()],
    colunasPorTabela: Object.fromEntries(
      training.tables.map((t) => [
        t.name,
        training.columns.filter((c) => c.table === t.name && executableField(c)).map((c) => c.name),
      ]),
    ),
    graoPorTabela: Object.fromEntries(training.tables.map((t) => [t.name, t.grain])),
    graosConfirmados: Object.fromEntries(
      training.tables.map((t) => [
        t.name,
        { significado: t.meaning, chaves: t.grain, evidencia: "declaracao_usuario" as const },
      ]),
    ),
    graoResultado: [],
    metricasSaida: [],
    pacoteVersao: 2,
    relacionamentos: training.relationships
      .filter((r) => !r.via?.length)
      .map((r) => ({
        tabelaOrigem: r.from,
        tabelaDestino: r.to,
        colunaOrigem: r.keys[0]!.from,
        colunaDestino: r.keys[0]!.to,
        pares: r.keys.map((k) => ({ colunaOrigem: k.from, colunaDestino: k.to })),
        tipoJoin: r.join,
        cardinalidade: r.cardinality,
      })),
  };
  const ast = validateSourceSql(training.sqlModel, training.dialect, scope);
  if (training.binaryAttachments) {
    const field = training.columns.find(
      (c) =>
        c.table === training.binaryAttachments!.table &&
        c.name === training.binaryAttachments!.column,
    );
    if (
      !field ||
      !executableField(field) ||
      !field.uses?.includes("exportacao") ||
      !field.uses.includes("projecao")
    ) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Coluna binária exige projeção e exportação explícitas e classificação executável.",
      );
    }
    assertBinaryProjection(ast, training.binaryAttachments);
  }
  assertQueryFieldUses(ast, training.columns);
  assertFanoutSeguro(ast, scope);
  enforceSourceRestrictions(ast, scope, restrictions);
  for (const example of training.examples ?? []) {
    const exampleAst = validateSourceSql(example.sql, training.dialect, scope);
    assertQueryFieldUses(exampleAst, training.columns);
    assertFanoutSeguro(exampleAst, scope);
    enforceSourceRestrictions(exampleAst, scope, restrictions);
  }
  const contract = {
    ...(training.semantics ? { semantics: training.semantics } : {}),
    ...(training.sharedKnowledge ? { sharedKnowledge: training.sharedKnowledge } : {}),
    commonTrainingHash: PERSONA_V2_TRAINING_BASE.hash,
    sourceId: source.id,
    physicalSourceId: source.physicalSourceId,
    database: source.database,
    rowRestrictions: source.rowRestrictions ?? [],
    dialect: training.dialect,
    scope,
    ...(training.limits ? { limits: training.limits } : {}),
    ...(training.columns.some((c) => c.uses)
      ? { fieldUses: training.columns.filter((c) => c.uses) }
      : {}),
    ...(training.relationships.some((r) => r.via?.length)
      ? { relationshipPaths: training.relationships.filter((r) => r.via?.length) }
      : {}),
    resources: training.tables.map((t) => ({ name: t.name, type: t.resourceType })),
    rules: training.rules,
    parameters: training.parameters,
    ...(training.examples ? { examples: training.examples } : {}),
  };
  return {
    format: "persona-query-v2",
    ...(training.limits ? { limits: training.limits } : {}),
    name: training.purpose,
    sourceId: source.id,
    sourceFingerprint: sourceFingerprint(source, crypto),
    dialect: training.dialect,
    purpose: training.purpose,
    sqlModel: training.sqlModel,
    scope,
    training,
    commonTraining: {
      version: PERSONA_V2_TRAINING_BASE.version,
      hash: PERSONA_V2_TRAINING_BASE.hash,
      hubContractRef: PERSONA_V2_TRAINING_BASE.hubContract.ref,
    },
    requiredCapabilities: [
      ...(training.binaryAttachments
        ? [
            `binary-attachment-contract:${crypto.sha256Hex(canonicalJson({ sourceId: source.id, contract: training.binaryAttachments, fields: training.columns.filter((c) => c.uses?.includes("exportacao")) }))}`,
          ]
        : []),
      ...(training.attachments
        ? [
            `attachment-contract:${crypto.sha256Hex(canonicalJson({ sourceId: source.id, contract: training.attachments, fields: training.columns.filter((c) => c.uses?.includes("exportacao")) }))}`,
          ]
        : []),
      ...training.columns
        .filter(executableField)
        .map((c) => `column:${source.id}:${c.table}.${c.name}`)
        .sort(),
      ...training.columns
        .flatMap((c) => (c.uses ?? []).map((use) => fieldUseCapability(source.id, c, use)))
        .sort(),
      `query-contract:${crypto.sha256Hex(canonicalJson(contract))}`,
    ],
  };
};
