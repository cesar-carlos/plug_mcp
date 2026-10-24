import { z } from "zod";
import type {
  ExternalConnection,
  ExternalContract,
  ExternalPublication,
  ExternalPackage,
} from "./external-contract.js";
import type { TrainingCase, PublicationPreviewResult } from "./catalog.js";
export interface ExternalDraftDetails {
  readonly skillId: string;
  readonly slug: string;
  readonly name: string;
  readonly revision: number;
  readonly contract: ExternalContract;
  readonly published: boolean;
  readonly publication: ExternalPublication | null;
}
export interface ExternalPublicationPreview extends Omit<PublicationPreviewResult, "package"> {
  readonly package: ExternalPackage;
  readonly hash: string;
}
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const externalRunManifestSchema = z.strictObject({
  version: z.literal(1),
  runId: z.uuid(),
  personaId: z.uuid(),
  skillId: z.uuid(),
  ownerId: z.uuid(),
  revision: z.number().int().positive(),
  packageHash: hash,
  casesHash: hash,
  fixtureIntegrationId: z.uuid(),
  fixtureCredentialVersion: z.number().int().positive(),
  fixtureDestinationHash: hash,
  confirmation: z.literal("isolated-external-effects"),
});
export type ExternalRunManifest = z.infer<typeof externalRunManifestSchema>;
export interface ExternalFixtureControl {
  verify(fixture: ExternalConnection, run: ExternalRunManifest, signal: AbortSignal): Promise<void>;
  cleanup(
    fixture: ExternalConnection,
    run: ExternalRunManifest,
    signal: AbortSignal,
  ): Promise<void>;
}
export interface ExternalRun {
  readonly runId: string;
  readonly state: "running" | "passed" | "failed" | "unknown";
  readonly manifest: ExternalRunManifest;
  readonly fixtureOriginHash: string;
}
export interface ExternalTestReport {
  readonly id: string;
  readonly revision: number;
  readonly packageHash: string;
  readonly casesHash: string;
  readonly approved: boolean;
  readonly runnerId: string;
  readonly runId: string | null;
  readonly runState: ExternalRun["state"] | null;
  readonly createdAt: string;
  readonly results: readonly { id: string; passed: boolean }[];
}
export interface ExternalDraftSummary {
  readonly skillId: string;
  readonly name: string;
  readonly revision: number;
  readonly effect: ExternalContract["effect"];
  readonly publicationId: string | null;
}
export interface ExternalTestDetails {
  readonly skillId: string;
  readonly name: string;
  readonly revision: number;
  readonly packageHash: string;
  readonly casesHash: string;
  readonly ownerId: string;
  readonly contract: ExternalContract;
  readonly cases: readonly TrainingCase[];
  readonly requiredApproved: boolean;
  readonly reports: readonly (ExternalTestReport & { readonly current: boolean })[];
  readonly nextCursor: string | null;
}
export interface ExternalRunResult {
  readonly runId: string;
  readonly approved: boolean;
  readonly state: ExternalRun["state"];
  readonly revision: number;
  readonly packageHash: string;
  readonly casesHash: string;
  readonly results: readonly { id: string; passed: boolean }[];
}
