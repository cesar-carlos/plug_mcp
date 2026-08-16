import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { TokenEncryptorPort } from "../../domain/ports/crypto.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import {
  analisarAmostraSql,
  montarHintTestarSql,
  TESTAR_SQL_MAX_ROWS,
  type ColunaCodigoAmostra,
  type EstruturaColunaAmostra,
} from "./shared/amostra-sql.js";
import { requireSqlClassificavel } from "./shared/fonte-definicao.js";
import { requireAccount, requireAmbiente, requireAmbienteConsultavel } from "./shared/guards.js";

export class TestarSql {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly crypto: TokenEncryptorPort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: { ambienteId?: string; sql?: string },
  ): Promise<{
    success: true;
    valido: true;
    columns: readonly string[];
    estrutura: readonly EstruturaColunaAmostra[];
    colunasCodigo: readonly ColunaCodigoAmostra[];
    sampleRowCount: number;
    sampleRows: readonly Record<string, unknown>[];
    sampleRow: Record<string, unknown> | null;
    hint: string;
  }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const consultavel = requireAmbienteConsultavel(ambiente);
    const sql = requireSqlClassificavel(input.sql);
    try {
      const result = await this.plug.executeSql({
        agentId: consultavel.agentId,
        clientToken: this.crypto.decrypt(consultavel.clientTokenEncriptado),
        sql,
        options: { maxRows: TESTAR_SQL_MAX_ROWS },
      });
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "testar_sql",
        sqlEnviado: sql,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: result.rows.length,
        duracaoMs: Date.now() - started,
      });
      const amostra = analisarAmostraSql(result.columns, result.rows);
      const sample = result.rows[0] ?? null;
      return {
        success: true,
        valido: true,
        columns: result.columns,
        estrutura: amostra.estrutura,
        colunasCodigo: amostra.colunasCodigo,
        sampleRowCount: result.rows.length,
        sampleRows: result.rows,
        sampleRow: sample,
        hint: montarHintTestarSql({
          rowCount: result.rows.length,
          colunasCodigo: amostra.colunasCodigo,
        }),
      };
    } catch (error) {
      const code = error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR;
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "testar_sql",
        sqlEnviado: sql,
        sucesso: false,
        codigoErro: code,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
      });
      if (error instanceof DomainError) {
        throw new DomainError({
          code: error.code,
          message: error.message,
          hint: `${error.hint} Mostre o erro ao usuário, ajuste o SQL e chame testar_sql de novo. Não chame registrar_fonte enquanto o teste falhar.`,
          retryable: error.retryable,
          retryAfterMs: error.retryAfterMs,
        });
      }
      throw error;
    }
  }
}
