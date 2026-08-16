import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { AuditLogPort } from "../../../domain/ports/audit-log.port.js";

export const auditarTool = async (
  audit: AuditLogPort,
  input: {
    accountId: string;
    ambienteId: string;
    tool: string;
    sql: string | null;
    started: number;
    sucesso: boolean;
    codigoErro: string | null;
  },
): Promise<void> => {
  await audit.append({
    mcpAccountId: input.accountId,
    ambienteId: input.ambienteId,
    tool: input.tool,
    sqlEnviado: input.sql,
    sucesso: input.sucesso,
    codigoErro: input.codigoErro,
    linhasRetornadas: null,
    duracaoMs: Date.now() - input.started,
  });
};

export const codigoErroDe = (error: unknown): string =>
  error instanceof DomainError ? error.code : ERROR_CODES.INTERNAL_ERROR;
