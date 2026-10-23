import type { Source, SkillKind, SourcePublicationImpact } from "./model.js";
import type { EscopoSkill } from "../entities/escopo.js";
import type { FederationBudget, FederationStep } from "./federation.js";
import type { OperationPackage } from "./operation-training.js";
import type { AdoptedKnowledge } from "./knowledge-adoption.js";
import type { QueryLimits } from "./execution-limits.js";
import type { PublicationRunEvidence, PublicationRunnerId } from "./publication-run.js";

export interface SkillDraft {
  readonly id: string;
  readonly personaId: string;
  readonly slug: string;
  readonly kind: SkillKind;
  readonly name: string;
  readonly revision: number;
  readonly training: unknown;
  readonly activePublicationId: string | null;
}

export interface QueryPackage {
  readonly limits?: Partial<QueryLimits>;
  readonly sharedKnowledge?: AdoptedKnowledge;
  readonly format: "persona-query-v2";
  readonly name: string;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly dialect: Source["dialect"];
  readonly purpose: string;
  readonly sqlModel: string;
  readonly scope: EscopoSkill;
  readonly training: unknown;
  readonly requiredCapabilities: readonly string[];
  readonly commonTraining: {
    readonly version: string;
    readonly hash: string;
    readonly hubContractRef: string;
  };
}

export interface FederationPackage {
  readonly format: "persona-federation-v2";
  readonly name: string;
  readonly purpose: string;
  readonly commonTraining: QueryPackage["commonTraining"];
  readonly training: unknown;
  readonly requiredCapabilities: readonly string[];
  readonly dependencies: readonly {
    readonly publicationId: string;
    readonly skillId: string;
    readonly hash: string;
    readonly sourceId: string;
    readonly sourceVersion: number;
    readonly sourceFingerprint: string;
  }[];
  readonly steps: readonly (
    | Exclude<FederationStep, { kind: "local" }>
    | {
        readonly kind: "local";
        readonly id: string;
        readonly sourceId: string;
        readonly publicationId: string;
        readonly columns: readonly string[];
      }
  )[];
  readonly output: string;
  readonly budget: FederationBudget;
}
export type PublishedPackage = QueryPackage | FederationPackage | OperationPackage;
export interface CatalogPublication<P extends PublishedPackage = QueryPackage> {
  readonly id: string;
  readonly personaId: string;
  readonly skillId: string;
  readonly revision: number;
  readonly package: P;
  readonly hash: string;
  readonly sourceVersion: number;
  readonly sourceFingerprint: string;
  readonly suspendedAt: Date | null;
}

export interface PublicationPreview {
  readonly administrativeContext?: string | null;
  readonly hash: string;
  readonly personaId: string;
  readonly skillId: string;
  readonly ownerId: string;
  readonly revision: number;
  readonly packageHash: string;
  readonly personaVersion: number;
  readonly sourceFingerprint: string;
  readonly previousPublicationId: string | null;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export interface TrainingCase {
  readonly id: string;
  readonly required: boolean;
  readonly content: unknown;
}

export interface CatalogTestReport {
  readonly id: string;
  readonly revision: number;
  readonly packageHash: string;
  readonly casesHash: string;
  readonly approved: boolean;
  readonly runnerId: string;
  readonly createdAt: Date;
  readonly results: readonly { id: string; passed: boolean }[];
}

export interface OperationTestDetails {
  readonly revision: number;
  readonly packageHash: string | null;
  readonly casesHash: string;
  readonly cases: readonly TrainingCase[];
  readonly requiredApproved: boolean;
  readonly reports: readonly (CatalogTestReport & { readonly current: boolean })[];
  readonly nextCursor: string | null;
}

export interface PublicationPreviewResult {
  readonly reviewDueAt: string;
  readonly confirmationHash: string;
  readonly expiresAt: Date;
  readonly revision: number;
  readonly packageHash: string;
  readonly package: PublishedPackage;
  readonly warnings: readonly string[];
  readonly review: {
    readonly previousRevision: number | null;
    readonly sections: readonly {
      readonly id: string;
      readonly label: string;
      readonly changes: readonly {
        readonly kind: "added" | "removed" | "changed";
        readonly path: string;
        readonly label: string;
        readonly before?: unknown;
        readonly after?: unknown;
      }[];
    }[];
    readonly cases: {
      readonly total: number;
      readonly required: number;
      readonly requiredApproved: boolean | null;
    };
    readonly impact: SourcePublicationImpact;
    readonly existingTokensExpanded: false;
  };
  readonly diff: {
    readonly previousPublicationId: string | null;
    readonly addedCapabilities: readonly string[];
    readonly removedCapabilities: readonly string[];
    readonly previousPackageHash: string | null;
    readonly changedFields: readonly string[];
  };
}

export interface PersonaCatalogTransaction {
  list(personaId: string): Promise<readonly SkillDraft[]>;
  find(personaId: string, skillId: string): Promise<SkillDraft | null>;
  create(draft: SkillDraft): Promise<void>;
  update(draft: SkillDraft, expectedRevision: number): Promise<void>;
  cases(personaId: string, skillId: string): Promise<readonly TrainingCase[]>;
  saveCase(personaId: string, skillId: string, test: TrainingCase): Promise<void>;
  changeCase(
    personaId: string,
    skillId: string,
    test: TrainingCase,
    remove: boolean,
  ): Promise<void>;
  reports(
    personaId: string,
    skillId: string,
    after?: string,
  ): Promise<readonly CatalogTestReport[]>;
  approvedReport(
    personaId: string,
    skillId: string,
    revision: number,
    packageHash: string,
    casesHash: string,
  ): Promise<boolean>;
  saveReport(
    personaId: string,
    skillId: string,
    revision: number,
    packageHash: string,
    casesHash: string,
    approved: boolean,
    results: readonly { id: string; passed: boolean }[],
    runnerId?: PublicationRunnerId,
    evidence?: PublicationRunEvidence,
  ): Promise<void>;
  savePreview(preview: PublicationPreview): Promise<void>;
  preview(personaId: string, skillId: string, hash: string): Promise<PublicationPreview | null>;
  publish(
    publication: CatalogPublication<PublishedPackage>,
    previewHash: string,
    now: Date,
  ): Promise<void>;
  publication(
    personaId: string,
    publicationId: string,
  ): Promise<CatalogPublication<PublishedPackage> | null>;
  suspend(personaId: string, publicationId: string, reason: string): Promise<void>;
}

/** Stable content hashing: JSON key order is not part of a training contract. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
