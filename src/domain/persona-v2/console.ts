export interface HistoryFilter {
  readonly from?: string;
  readonly to?: string;
  readonly event?: string;
  readonly resourceId?: string;
  readonly after?: { readonly at: string; readonly id: string };
}
export interface HistoryItem {
  readonly id: string;
  readonly at: string;
  readonly event: string;
  readonly origin: string;
  readonly success: boolean;
  readonly actor: {
    readonly kind: "responsavel" | "token" | "nao_registrado";
    readonly id: string | null;
  };
  readonly resourceId: string;
  readonly previousVersion: number | null;
  readonly version: number | null;
}
export interface HistoryPage {
  readonly items: readonly HistoryItem[];
  readonly nextCursor: { readonly at: string; readonly id: string } | null;
}
export interface ProgressStep {
  readonly id: string;
  readonly label: string;
  readonly state: "pendente" | "disponivel" | "concluido" | "bloqueado" | "nao_aplicavel";
  readonly reason: string;
  readonly area: "overview" | "sources" | "knowledge" | "training" | "tokens" | "queries";
  readonly action: string;
}
export interface PersonaProgress {
  readonly checkedAt: string;
  readonly steps: readonly ProgressStep[];
  readonly currentAvailabilityVerified: false;
  readonly lastQueryAt: string | null;
}
import type { FederationBudget } from "./federation.js";
import type { QueryLimits, OperationLimits } from "./execution-limits.js";
import type { SkillKind } from "./model.js";

export interface SkillDiagnosis {
  readonly skillId: string;
  readonly state: "permitido" | "bloqueado";
  readonly code: string;
  readonly reason: string;
  readonly action: string;
  readonly name?: string;
  readonly publicationId?: string;
  readonly revision?: number;
  readonly kind?: SkillKind;
  readonly capabilities?: readonly string[];
  readonly sourceIds?: readonly string[];
  readonly requireHumanApproval?: boolean;
  readonly limits?: FederationBudget | QueryLimits | OperationLimits;
}
export interface ConsumerDiagnosis {
  readonly personaId: string;
  readonly checkedAt: string;
  readonly token: {
    readonly id: string;
    readonly version: number;
    readonly expiresAt: Date | null;
    readonly state: "vigente";
  };
  readonly remoteAuthority: "nao_verificado";
  readonly sqlExecuted: false;
  readonly skills: readonly SkillDiagnosis[];
  readonly guidance: string;
}
