import type { ExternalConnection, ExternalPublication } from "../persona-v2/external-contract.js";
import type { IntegrationReference } from "../persona-v2/integration-credential.js";
import type { ExternalActionTransaction } from "./external-action.port.js";
import type { ExternalRun, ExternalTestReport } from "../persona-v2/external-run.js";
import type { TrainingCase } from "../persona-v2/catalog.js";
import type {
  ManagedIntegration,
  IntegrationImpact,
} from "../persona-v2/integration-management.js";
export interface PersonaExternalTransaction {
  connections(personaId: string): Promise<readonly ManagedIntegration[]>;
  impact(personaId: string, id: string): Promise<IntegrationImpact | null>;
  changeState(
    personaId: string,
    id: string,
    expectedVersion: number,
    suspended: boolean,
  ): Promise<void>;
  readonly actions: ExternalActionTransaction;
  startRun(run: ExternalRun): Promise<void>;
  finishRun(
    run: ExternalRun,
    approved: boolean,
    results: readonly { id: string; passed: boolean }[],
  ): Promise<void>;
  reports(
    personaId: string,
    skillId: string,
    afterId?: string,
  ): Promise<readonly ExternalTestReport[]>;
  changeCase(
    personaId: string,
    skillId: string,
    test: TrainingCase,
    remove: boolean,
  ): Promise<void>;
  connection(
    personaId: string,
    id: string,
  ): Promise<(IntegrationReference & ExternalConnection & { active: boolean }) | null>;
  publication(personaId: string, skillId: string): Promise<ExternalPublication | null>;
  publish(value: ExternalPublication, previewHash: string, now: Date): Promise<void>;
  record(
    personaId: string,
    tokenId: string,
    publication: ExternalPublication,
    success: boolean,
  ): Promise<void>;
}
