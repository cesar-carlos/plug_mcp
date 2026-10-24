import { randomBytes } from "node:crypto";
import { z } from "zod";
import { datasetPayloadSchema } from "../../src/application/persona-v2/knowledge-library-schema.js";
import { composeStructureEvidenceSchema } from "../../src/domain/persona-v2/source-schema.js";
import {
  compileQueryTraining,
  queryTrainingSchema,
} from "../../src/application/persona-v2/query-training.js";
import {
  federationPlanSchema,
  federationTrainingSchema,
} from "../../src/application/persona-v2/federation-training.js";
import { sourceQuerySchema } from "../../src/application/persona-v2/source-query.js";
import {
  personaUpdateSchema,
  sourceUpdateSchema,
  sourceStateSchema,
} from "../../src/application/persona-v2/maintenance.js";
import { sourceRestrictionsSchema } from "../../src/domain/persona-v2/source-restrictions.js";
import { validateStructureContent } from "../../src/application/persona-v2/shared-structure-schema.js";
import {
  operationCaseSchema,
  assertOperationCaseCoverage,
} from "../../src/application/persona-v2/operation-cases.js";
import {
  compileOperationCommand,
  compileOperationTraining,
  operationTrainingSchema,
} from "../../src/application/persona-v2/operation-training.js";
import { permissionsSchema } from "../../src/infrastructure/persistence/persona-v2/permissions-schema.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import type { Source } from "../../src/domain/persona-v2/model.js";
import {
  feedbackInputSchema,
  reviewDecisionSchema,
} from "../../src/domain/persona-v2/knowledge-maintenance.js";

export interface RequiredExample {
  file: string;
  kind: string;
  location: "block" | "file";
}

export const requiredExamples: readonly RequiredExample[] = [
  { file: "docs/persona-v2/knowledge-library.md", kind: "knowledge-dataset", location: "block" },
  { file: "docs/persona-v2/shared-knowledge.md", kind: "knowledge-feedback", location: "block" },
  { file: "docs/persona-v2/shared-knowledge.md", kind: "knowledge-review", location: "block" },
  { file: "docs/persona-v2/shared-knowledge.md", kind: "shared-structure", location: "block" },
  { file: "docs/persona-v2/shared-knowledge.md", kind: "structure-composition", location: "block" },
  { file: "docs/persona-v2/onboarding.md", kind: "persona-update", location: "block" },
  { file: "docs/persona-v2/onboarding.md", kind: "source-update", location: "block" },
  { file: "docs/persona-v2/onboarding.md", kind: "source-state", location: "block" },
  { file: "docs/persona-v2/catalog.md", kind: "query-draft", location: "block" },
  { file: "docs/persona-v2/federation.md", kind: "federation-training", location: "block" },
  { file: "docs/persona-v2/federation.md", kind: "federation-local", location: "block" },
  { file: "docs/persona-v2/source-queries.md", kind: "source-query", location: "block" },
  { file: "docs/persona-v2/source-queries.md", kind: "source-restrictions", location: "block" },
  { file: "docs/persona-v2/sql-operations.md", kind: "adaptive-filter", location: "block" },
  {
    file: "docs/persona-v2/examples/sql-operation.json",
    kind: "operation-bundle",
    location: "file",
  },
  {
    file: "docs/persona-v2/examples/sql-operation-adaptive.json",
    kind: "operation-bundle",
    location: "file",
  },
  { file: "docs/persona-v2/examples/permissions.json", kind: "permissions", location: "file" },
];

const queryDraft = z.strictObject({
  slug: z.string().min(1),
  kind: z.literal("consulta"),
  name: z.string().min(1),
  training: queryTrainingSchema,
});
const operationBundle = z.strictObject({
  draft: z.strictObject({
    slug: z.string().min(1),
    kind: z.literal("operacao_sql"),
    name: z.string().min(1),
    training: operationTrainingSchema,
  }),
  cases: z.array(z.strictObject({ required: z.boolean(), content: operationCaseSchema })).min(1),
  prepareInput: z.json(),
});

/** Synthetic identity for pure compilation only. No credential lookup or database is opened. */
const sourceFor = (training: { sourceId: string; dialect: Source["dialect"] }): Source => ({
  id: training.sourceId,
  personaId: "22222222-2222-4222-8222-222222222222",
  physicalSourceId: "33333333-3333-4333-8333-333333333333",
  name: "Fixture documental",
  purpose: "Validação offline",
  environment: "test",
  agentId: "44444444-4444-4444-8444-444444444444",
  database: "docs_fixture",
  identityHash: "f".repeat(64),
  identityVerifiedAt: "2026-10-11T00:00:00.000Z",
  dialect: training.dialect,
  credentialId: "55555555-5555-4555-8555-555555555555",
  credentialVersion: 1,
  authorizationVersion: 1,
  active: true,
});

export function validateExample(kind: string, value: unknown): number {
  switch (kind) {
    case "shared-structure": {
      validateStructureContent(value, new NodeCryptoAdapter(randomBytes(32).toString("hex")));
      return 1;
    }
    case "persona-update": {
      personaUpdateSchema.parse(value);
      return 1;
    }
    case "source-update": {
      sourceUpdateSchema.parse(value);
      return 1;
    }
    case "source-state": {
      sourceStateSchema.parse(value);
      return 1;
    }
    case "query-draft": {
      const draft = queryDraft.parse(value);
      compileQueryTraining(
        draft.training,
        sourceFor(draft.training),
        new NodeCryptoAdapter(randomBytes(32).toString("hex")),
      );
      return 1;
    }
    case "operation-bundle": {
      const bundle = operationBundle.parse(value);
      const source = sourceFor(bundle.draft.training);
      const crypto = new NodeCryptoAdapter(randomBytes(32).toString("hex"));
      const pkg = compileOperationTraining(
        bundle.draft.training,
        source,
        crypto,
        bundle.draft.name,
      );
      assertOperationCaseCoverage(pkg, bundle.cases);
      compileOperationCommand(
        pkg,
        source,
        "66666666-6666-4666-8666-666666666666",
        bundle.prepareInput,
        crypto,
      );
      return bundle.cases.length + 2;
    }
    case "federation-training":
      federationTrainingSchema.parse(value);
      break;
    case "federation-local":
      federationPlanSchema.shape.steps.element.options[0].parse(value);
      break;
    case "source-query":
      sourceQuerySchema.parse(value);
      break;
    case "source-restrictions":
      sourceRestrictionsSchema.parse(value);
      break;
    case "adaptive-filter":
      operationTrainingSchema.shape.steps.element.shape.adaptiveFilters
        .unwrap()
        .element.parse(value);
      break;
    case "permissions":
      permissionsSchema.parse(value);
      break;
    case "knowledge-feedback":
      feedbackInputSchema.parse(value);
      break;
    case "knowledge-review":
      reviewDecisionSchema.parse(value);
      break;
    case "knowledge-dataset":
      datasetPayloadSchema.parse(value);
      break;
    case "structure-composition":
      composeStructureEvidenceSchema.parse(value);
      break;
    default:
      throw new Error("Schema documental desconhecido.");
  }
  return 1;
}
