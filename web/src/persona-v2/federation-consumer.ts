import type { FederationPackage } from "../../../src/domain/persona-v2/catalog";
import type {
  FederationBudget,
  FederationPlan,
  FederationResult,
} from "../../../src/domain/persona-v2/federation";
import type { Source, Training } from "./model";
import { queryParameters, type ParameterMode } from "./query-parameters";

export interface FederationConsumerSkill {
  id: string;
  slug: string;
  name: string;
  kind: string;
  publicationId: string;
  hash: string;
}

export interface FederationConsumerContext extends Pick<
  FederationPackage,
  "name" | "purpose" | "steps" | "output" | "budget"
> {
  publicationId: string;
  hash: string;
  executionBudget: FederationBudget;
  training: { semantics: Record<string, string> };
  dependencies: { publicationId: string; hash: string; skillId: string; sourceId: string }[];
}

export interface FederationLocalInput {
  id: string;
  sourceId: string;
  publicationId: string;
  name: string;
  sql: string;
  parameters: Training["parameters"];
  values: Record<string, string>;
  modes: Record<string, ParameterMode>;
}

export type FederationConsumerResult = FederationResult & {
  publicationId: string;
  hash: string;
  page: number;
  pageSize: number;
};

export const federationConsumerSemantics: Record<string, string> = {
  matching: "Correspondência",
  normalization: "Normalização",
  missing: "Ausência",
  duplicates: "Duplicidades",
  units: "Unidades",
  currency: "Moeda",
  calendar: "Calendário",
};

export function federationSourceName(
  sources: readonly Pick<Source, "id" | "name">[],
  id: string,
): string {
  return sources.find((source) => source.id === id)?.name ?? id;
}

export function buildFederationPlan(
  pkg: Pick<FederationConsumerContext, "publicationId" | "output" | "steps">,
  inputs: readonly FederationLocalInput[],
  page: number,
  pageSize: number,
): FederationPlan {
  return {
    publicationId: pkg.publicationId,
    output: pkg.output,
    page,
    pageSize,
    steps: pkg.steps.map((step) => {
      if (step.kind !== "local") {
        return step;
      }
      const input = inputs.find((item) => item.id === step.id)!;
      return {
        kind: "local",
        id: step.id,
        sourceId: step.sourceId,
        publicationId: step.publicationId,
        sql: input.sql,
        params: queryParameters(input.parameters, input.values, input.modes),
      };
    }),
  };
}
