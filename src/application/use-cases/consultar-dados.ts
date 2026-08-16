import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { TokenEncryptorPort } from "../../domain/ports/crypto.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import { requireAccount, requireAmbiente, requireAmbienteConsultavel } from "./shared/guards.js";

export interface ConsultarDadosInput {
  ambienteId?: string;
  sql?: string;
  params?: Record<string, unknown>;
  options?: {
    max_rows?: number;
    page?: number;
    page_size?: number;
    timeout_ms?: number;
  };
}

export interface ConsultarDadosResult {
  success: true;
  columns: readonly string[];
  rows: readonly Record<string, unknown>[];
  rowCount: number;
  maxRowsApplied: number;
  truncated: boolean;
  hint?: string;
}

export class ConsultarDados {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly crypto: TokenEncryptorPort,
    private readonly audit: AuditLogPort,
    private readonly defaultMaxRows: number,
    private readonly absoluteMaxRows: number,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: ConsultarDadosInput,
  ): Promise<ConsultarDadosResult> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const consultavel = requireAmbienteConsultavel(ambiente);

    const sql = input.sql?.trim();
    if (!sql) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "sql é obrigatório.",
        hint: "Obtenha sql_base em obter_fonte e derive um SELECT agregado ou paginado. Prefira SUM/COUNT a trazer todas as linhas. Use params nomeados para literais.",
      });
    }

    const requested = input.options?.max_rows ?? this.defaultMaxRows;
    const maxRows = Math.min(Math.max(1, requested), this.absoluteMaxRows);
    const clientToken = this.crypto.decrypt(consultavel.clientTokenEncriptado);

    try {
      const result = await this.plug.executeSql({
        agentId: consultavel.agentId,
        clientToken,
        sql,
        params: input.params,
        options: {
          maxRows,
          page: input.options?.page,
          pageSize: input.options?.page_size,
          timeoutMs: input.options?.timeout_ms,
        },
      });
      const truncated = result.rows.length >= maxRows;
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "consultar_dados",
        sqlEnviado: sql,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: result.rows.length,
        duracaoMs: Date.now() - started,
      });
      return {
        success: true as const,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows.length,
        maxRowsApplied: maxRows,
        truncated,
        hint: truncated
          ? "Resultado possivelmente incompleto (atingiu max_rows). Agregue no SQL, adicione WHERE ou use options.page/page_size com ORDER BY. Não some linhas truncadas como se fossem o total."
          : undefined,
      };
    } catch (error) {
      const code = error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR;
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "consultar_dados",
        sqlEnviado: sql,
        sucesso: false,
        codigoErro: code,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
      });
      throw error;
    }
  }
}
