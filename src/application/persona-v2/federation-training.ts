import { federationTrainingSchema } from "../../domain/persona-v2/federation-training.js";
export {
  federationTrainingSchema,
  federationPlanSchema,
  federationRequestSchema,
} from "../../domain/persona-v2/federation-training.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import { canonicalJson, type FederationPackage } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { FederationPlan } from "../../domain/persona-v2/federation.js";

import { ExecuteFederation, federationBudget } from "./federation.js";
import { sourceFingerprint } from "./query-training.js";
import { PERSONA_V2_TRAINING_BASE } from "./training-base.js";

export function assertFederationContract(pkg: FederationPackage, plan: FederationPlan): void {
  const shape = plan.steps.map((s) =>
    s.kind === "local"
      ? {
          kind: s.kind,
          id: s.id,
          sourceId: s.sourceId,
          publicationId: s.publicationId,
          columns: pkg.steps.filter((t) => t.kind === "local").find((t) => t.id === s.id)?.columns,
        }
      : s,
  );
  if (plan.output !== pkg.output || canonicalJson(shape) !== canonicalJson(pkg.steps))
    throw new PersonaV2Error("INVALID_PLAN", "Plano difere da combinação publicada.");
}

/** Pure compilation plus same-persona dependency reads; never dispatches SQL. */
export async function compileFederationTraining(
  tx: PersonaTransaction,
  personaId: string,
  name: string,
  raw: unknown,
  crypto: CryptoPort,
): Promise<FederationPackage> {
  const training = federationTrainingSchema.parse(raw);
  const sources = await tx.listSources(personaId);
  const dependencies: FederationPackage["dependencies"][number][] = [];
  for (const step of training.steps) {
    if (step.kind !== "local") continue;
    const p = await tx.catalog.publication(personaId, step.publicationId);
    const source = sources.find((s) => s.id === step.sourceId && s.active);
    const skill = p ? await tx.catalog.find(personaId, p.skillId) : null;
    if (
      p?.package.format !== "persona-query-v2" ||
      p.suspendedAt ||
      skill?.activePublicationId !== p.id ||
      p.package.sourceId !== source?.id ||
      p.sourceVersion !== source.authorizationVersion ||
      p.sourceFingerprint !== sourceFingerprint(source, crypto) ||
      p.hash !== crypto.sha256Hex(canonicalJson(p.package))
    )
      throw new PersonaV2Error(
        "STALE_AUTHORIZATION",
        "Dependência de consulta indisponível ou alterada.",
      );
    if (!dependencies.some((d) => d.publicationId === p.id))
      dependencies.push({
        publicationId: p.id,
        skillId: p.skillId,
        hash: p.hash,
        sourceId: source.id,
        sourceVersion: p.sourceVersion,
        sourceFingerprint: p.sourceFingerprint,
      });
  }
  if (new Set(dependencies.map((d) => d.sourceId)).size < 2)
    throw new PersonaV2Error("INVALID_PLAN", "Cruzamento exige pelo menos duas fontes.");
  const budget = federationBudget(training.budget);
  // An empty-input pass checks the complete typed graph and all referenced columns.
  const structuralPlan: FederationPlan = {
    publicationId: "compile",
    output: training.output,
    page: 1,
    pageSize: 1,
    steps: training.steps.map((s) =>
      s.kind === "local"
        ? {
            kind: s.kind,
            id: s.id,
            sourceId: s.sourceId,
            publicationId: s.publicationId,
            sql: "",
            params: {},
          }
        : s,
    ),
  };
  await new ExecuteFederation({
    authorize: () => Promise.resolve(),
    query: (s) =>
      Promise.resolve({
        rows: [],
        columns: training.steps.filter((t) => t.kind === "local").find((t) => t.id === s.id)!
          .columns,
        truncated: false,
        publicationHash: "compile",
        readAt: new Date(0).toISOString(),
      }),
  }).execute(structuralPlan, budget);
  const contract = { training, dependencies, commonHash: PERSONA_V2_TRAINING_BASE.hash };
  return {
    format: "persona-federation-v2",
    name,
    purpose: training.purpose,
    training,
    dependencies,
    steps: training.steps,
    output: training.output,
    budget,
    requiredCapabilities: [`federation-contract:${crypto.sha256Hex(canonicalJson(contract))}`],
    commonTraining: {
      version: PERSONA_V2_TRAINING_BASE.version,
      hash: PERSONA_V2_TRAINING_BASE.hash,
      hubContractRef: PERSONA_V2_TRAINING_BASE.hubContract.ref,
    },
  };
}
