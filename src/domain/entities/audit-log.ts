export interface AuditMetadata {
  readonly publicacoes?: readonly { skillId: string; id: string; hash: string }[];
  readonly origem?: "sql" | "semantica" | "aprendida" | "modelo" | "busca";
  readonly skillIds?: readonly string[];
  readonly agregado?: boolean;
  readonly cacheHit?: boolean;
  readonly coalescencia?: "leader" | "waiter";
  readonly esperaCoalescenciaMs?: number;
  readonly tabelas?: number;
  readonly truncated?: boolean;
  readonly paginada?: boolean;
  readonly maxRows?: number;
  readonly errorSource?:
    "sql" | "sql_engine" | "client_token_rpc" | "plug_server_http" | "mcp_preflight";
  readonly stage?: "preflight" | "cache" | "hub" | "sanitize";
  readonly timingsSolicitados?: boolean;
  readonly timingsDevolvidos?: boolean;
  readonly timings?: Readonly<Record<string, number>>;
  readonly sqlHandlingMode?: string;
  readonly maxRowsHandling?: string;
  readonly effectiveMaxRows?: number;
}

export interface NewAuditLog {
  readonly usuarioId: string | null;
  readonly acessoId: string | null;
  readonly tool: string;
  readonly sqlEnviado: string | null;
  readonly sucesso: boolean;
  readonly codigoErro: string | null;
  readonly linhasRetornadas: number | null;
  readonly duracaoMs: number | null;
  readonly metadata?: AuditMetadata | null;
}

export interface AuditLogEntry extends NewAuditLog {
  readonly id: string;
  readonly createdAt: Date;
}
