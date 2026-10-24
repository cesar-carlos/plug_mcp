import type { Dialeto } from "../entities/dialeto.js";
import type { KnowledgeCurationTransaction } from "./knowledge-curation.js";
import type { KnowledgeMaintenancePort } from "./knowledge-maintenance.js";
import type { KnowledgeLibraryPort } from "../ports/knowledge-library.port.js";
import type { KnowledgeImpactResource } from "./knowledge-impact.js";

export type KnowledgeRole = "administrator" | "curator" | "contributor" | "reader";
export interface KnowledgeImpact {
  readonly publications: readonly {
    readonly publicationId: string;
    readonly personaId: string;
    readonly personaName: string;
    readonly skillId: string;
    readonly name: string;
    readonly revision: number;
    readonly direct: boolean;
    readonly active: boolean;
    readonly suspended: boolean;
    readonly sources: readonly { id: string; name: string }[];
  }[];
  readonly nextCursor: string | null;
}
export interface KnowledgeCatalog {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly authorizationVersion: number;
  readonly role: KnowledgeRole;
}
export interface KnowledgeMember {
  readonly ownerId: string;
  readonly hubOrigin: string;
  readonly hubClientId: string;
  readonly role: KnowledgeRole;
}
export interface StructureContent {
  readonly system: string;
  readonly label: string;
  readonly dialects: readonly Dialeto[];
  readonly tables: readonly {
    readonly id: string;
    readonly name: string;
    readonly meaning: string;
    readonly resourceType: "table" | "view";
    readonly grain: readonly string[];
    readonly physicalNames: readonly { readonly dialect: Dialeto; readonly name: string }[];
    readonly keys?: readonly {
      readonly id: string;
      readonly kind: "primary" | "unique";
      readonly columns: readonly string[];
      readonly status: "enabled" | "disabled" | "unvalidated" | "unknown";
    }[];
    readonly columns: readonly {
      readonly name: string;
      readonly meaning: string;
      readonly logicalType: string;
      readonly nullable: boolean;
      readonly classification: "livre" | "sensivel" | "pessoal" | "segredo" | "inferido";
      readonly nativeTypes?: readonly {
        readonly dialect: Dialeto;
        readonly type: string;
        readonly precision?: number;
        readonly scale?: number;
        readonly length?: number;
      }[];
      readonly unit?: string;
      readonly currency?: string;
      readonly calendar?: string;
    }[];
  }[];
  readonly relationships: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly keys: readonly { readonly from: string; readonly to: string }[];
    readonly join: "inner" | "left";
    readonly cardinality: "1:1" | "1:N" | "N:1" | "N:N";
    readonly optional: boolean;
    readonly meaning: string;
    readonly via: readonly string[];
    readonly path?: readonly string[];
    readonly origin?: "database" | "business";
    readonly constraintName?: string;
    readonly constraintStatus?: "enabled" | "disabled" | "unvalidated" | "unknown";
  }[];
  readonly examples: readonly {
    readonly id: string;
    readonly purpose: string;
    readonly explanation: string;
    readonly state: "candidate" | "approved" | "inactive" | "replaced";
    readonly variants: readonly {
      readonly dialect: Dialeto;
      readonly sql: string;
      readonly parameters: readonly {
        readonly name: string;
        readonly type:
          "string" | "number" | "integer" | "decimal" | "boolean" | "date" | "datetime";
        readonly required: boolean;
        readonly meaning: string;
      }[];
    }[];
  }[];
  readonly rules: readonly string[];
}
export interface StructureDraft {
  readonly id: string;
  readonly catalogId: string;
  readonly slug: string;
  readonly name: string;
  readonly revision: number;
  readonly content: StructureContent;
  readonly activePublicationId: string | null;
}
export interface StructurePublication {
  readonly id: string;
  readonly catalogId: string;
  readonly patternId: string;
  readonly revision: number;
  readonly hash: string;
  readonly content: StructureContent;
  readonly publishedAt: string;
  readonly suspendedAt: string | null;
}
export interface StructurePreview {
  readonly hash: string;
  readonly catalogId: string;
  readonly patternId: string;
  readonly ownerId: string;
  readonly revision: number;
  readonly catalogVersion: number;
  readonly packageHash: string;
  readonly previousPublicationId: string | null;
  readonly expiresAt: Date;
}

/** Shared metadata only. Source credentials, row data and consumer authority never enter here. */
export interface SharedKnowledgeTransaction {
  impact(
    catalogId: string,
    publicationId: string,
    ownerId: string,
    after?: string,
    kind?: "padrao" | "perfil",
    resource?: KnowledgeImpactResource,
  ): Promise<KnowledgeImpact>;
  readonly library?: KnowledgeLibraryPort;
  readonly maintenance?: KnowledgeMaintenancePort;
  readonly curation: KnowledgeCurationTransaction;
  catalog(catalogId: string, ownerId: string): Promise<KnowledgeCatalog | null>;
  list(ownerId: string): Promise<readonly KnowledgeCatalog[]>;
  createCatalog(catalog: KnowledgeCatalog): Promise<void>;
  members(catalogId: string): Promise<readonly KnowledgeMember[]>;
  setMember(catalogId: string, member: KnowledgeMember | null, ownerId: string): Promise<void>;
  resolveOwner(hubOrigin: string, hubClientId: string): Promise<string>;
  drafts(catalogId: string): Promise<readonly StructureDraft[]>;
  draft(catalogId: string, patternId: string): Promise<StructureDraft | null>;
  saveDraft(draft: StructureDraft, expectedRevision: number | null): Promise<void>;
  savePreview(preview: StructurePreview): Promise<void>;
  preview(catalogId: string, hash: string): Promise<StructurePreview | null>;
  publish(publication: StructurePublication, previewHash: string, now: Date): Promise<void>;
  publication(catalogId: string, publicationId: string): Promise<StructurePublication | null>;
  publications(
    catalogId: string,
    patternId: string,
    includeSuspended: boolean,
    beforeId?: string,
  ): Promise<{ publications: readonly StructurePublication[]; nextCursor: string | null }>;
  suspend(catalogId: string, publicationId: string, ownerId: string): Promise<void>;
  audit(catalogId: string, ownerId: string, event: string, resourceId: string): Promise<void>;
}
export interface SharedKnowledgeRepositoryPort {
  transaction<T>(
    catalogId: string | null,
    action: (tx: SharedKnowledgeTransaction) => Promise<T>,
    beforeCommit: () => void,
  ): Promise<T>;
}
