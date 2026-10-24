import type { Source } from "./model.js";

/** Only metadata. Case payloads, SQL, rows and credentials never belong here. */
export interface PublicationRunEvidence {
  readonly version: 1;
  readonly runId: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly scope: "isolated-sql-transport" | "isolated-federation-transport";
  readonly sources: readonly {
    readonly sourceId: string;
    readonly sourceVersion: number;
    readonly credentialVersion: number;
    readonly sourceFingerprint: string;
    readonly dialect: Source["dialect"];
    readonly identityHash: string;
    readonly fixtureSourceId: string;
    readonly fixtureIdentityHash: string;
    readonly fixtureManifestHash: string;
  }[];
  readonly dependencies: readonly { publicationId: string; hash: string }[];
}
export type PublicationRunnerId =
  | "persona-external-fixtures-v1"
  | "persona-federation-fixtures-v1"
  | "persona-generic-sql-fixtures-v1"
  | "persona-generic-federation-fixtures-v1";
