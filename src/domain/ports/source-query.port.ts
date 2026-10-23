import type { Source } from "../persona-v2/model.js";
import type {
  SchemaInspection,
  SourceSchemaEvidence,
  ExpectedStructure,
} from "../persona-v2/source-schema.js";
import type { SqlExecuteOptions, SqlExecuteResult } from "./plug-server-gateway.port.js";

/** Live hub authority, checked outside MCP database transactions. No retries or SQL rewrites. */
export interface SourceQueryLease {
  /** Exact live policy, never a cached authorization decision. */
  readonly policyFingerprint?: string;
  inspectSchema?(inspection: SchemaInspection): Promise<SourceSchemaEvidence>;
  execute(
    sql: string,
    params: Record<string, unknown>,
    options: SqlExecuteOptions,
    expectedStructure?: ExpectedStructure,
  ): Promise<SqlExecuteResult>;
  revalidate(): Promise<void>;
}
export interface SourceQueryGatewayPort {
  authorize(
    source: Source,
    resources: readonly { name: string; type: "table" | "view" }[],
    fences?: {
      readonly exactResources: true;
      readonly requireDatabase: true;
      readonly requireSchema?: true;
      readonly requireConstraints?: true;
    },
  ): Promise<SourceQueryLease>;
}
