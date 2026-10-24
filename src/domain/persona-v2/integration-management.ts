import type { IntegrationReference } from "./integration-credential.js";
export interface ManagedIntegration extends IntegrationReference {
  active: boolean;
  managementVersion: number;
  suspendedAt: string | null;
}
export interface IntegrationImpact {
  connection: ManagedIntegration;
  publications: readonly {
    skillId: string;
    publicationId: string;
    name: string;
    revision: number;
    suspended: boolean;
  }[];
  activeOperations: number;
  pendingOperations: number;
}
export interface IntegrationReview extends IntegrationImpact {
  fingerprint: string;
}
