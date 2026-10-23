import type { ExpectedSource } from "../persona-v2/source-discovery.js";
import type { SchemaInspection, ExpectedStructure } from "../persona-v2/source-schema.js";
export interface PlugHubTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface RequestAgentAccessResult {
  readonly requested: readonly string[];
  readonly alreadyApproved: readonly string[];
  readonly newRequests: readonly string[];
}

export interface AgentAccessStatus {
  readonly sourceIdentity?: 1 | null;
  readonly sourceSchema?: 1 | null;
  readonly sourceConstraints?: 1 | null;
  readonly agentId: string;
  readonly state: "pending" | "approved" | "rejected" | "revoked" | "expired" | "unknown";
  readonly hasClientToken: boolean;
  readonly isHubConnected: boolean | null;
  readonly sqlOperations?: {
    readonly version: 1;
    readonly structureGuard?: 1;
    readonly maxSteps: number;
    readonly maxAffectedRows: number;
    readonly timeoutMs: number;
  } | null;
}

export interface SqlExecuteOptions {
  readonly maxRows?: number;
  readonly timeoutMs?: number;
  readonly page?: number;
  readonly pageSize?: number;
  readonly requestServerTimings?: boolean;
}

export interface SqlExecutePagination {
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

export interface SqlColumnMetadata {
  /** Absent means native ODBC codes; odbc_fast uses its own discriminants. */
  readonly typeSystem?: string;
  readonly name: string;
  readonly odbcType?: number;
  readonly type?: string;
  readonly nullable?: boolean;
}

export interface SqlExecuteResult {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
  readonly truncated?: boolean;
  readonly pagination?: SqlExecutePagination;
  readonly columnsMetadata?: readonly SqlColumnMetadata[];
  readonly serverTimings?: Readonly<Record<string, number>>;
  readonly sqlHandlingMode?: string;
  readonly maxRowsHandling?: string;
  readonly effectiveMaxRows?: number;
}

export interface ClientTokenPolicy {
  readonly allTables: boolean;
  readonly tables: readonly string[];
  readonly fullPolicy?: {
    readonly allViews: boolean;
    readonly allPermissions: boolean;
    readonly revoked: boolean;
    readonly database: string | null;
    readonly globalPermissions: Readonly<Record<"read" | "update" | "delete" | "ddl", boolean>>;
    readonly rules: readonly {
      readonly resourceType: "table" | "view" | "unknown";
      readonly resource: string;
      readonly effect: "allow" | "deny";
      readonly read: boolean;
      readonly update: boolean;
      readonly delete: boolean;
      readonly ddl: boolean;
    }[];
  };
}

export interface PlugServerGatewayPort {
  describeSchema?(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
    database: string;
    expectedSource: ExpectedSource;
    inspection: SchemaInspection;
  }): Promise<unknown>;
  describeSource?(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
    database: string;
  }): Promise<unknown>;
  login(email: string, password: string): Promise<PlugHubTokens>;
  refresh(refreshToken: string): Promise<PlugHubTokens>;
  requestAgentAccess(accessToken: string, agentId: string): Promise<RequestAgentAccessResult>;
  getAgentAccessStatus(accessToken: string, agentId: string): Promise<AgentAccessStatus>;
  putClientToken(accessToken: string, agentId: string, clientToken: string | null): Promise<void>;
  getClientTokenPolicy(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
  }): Promise<ClientTokenPolicy>;
  executeSql(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
    sql: string;
    database?: string;
    expectedSource?: ExpectedSource;
    expectedStructure?: ExpectedStructure;
    params?: Record<string, unknown>;
    options?: SqlExecuteOptions;
  }): Promise<SqlExecuteResult>;
}

export interface UsuarioPlugSessionPort {
  getAccessToken(usuarioId: string): Promise<string>;
  invalidate(usuarioId: string): void;
  remember(usuarioId: string, tokens: PlugHubTokens): void;
}
