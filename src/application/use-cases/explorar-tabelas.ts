import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { TokenEncryptorPort } from "../../domain/ports/crypto.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import { requireAccount, requireAmbiente, requireAmbienteConsultavel } from "./shared/guards.js";
import {
  cell,
  EXPLORAR_TABELAS_MAX_ROWS,
  hintCatalogoSistemaNegado,
  likeFiltro,
  sqlExplorarTabelas,
} from "./shared/schema-introspection.js";

const relancarCatalogoNegado = (error: unknown): never => {
  if (
    error instanceof DomainError &&
    (error.code === ERROR_CODES.PERMISSION_DENIED || error.code === ERROR_CODES.ACCESS_REVOKED)
  ) {
    throw new DomainError({
      code: error.code,
      message: error.message,
      hint: hintCatalogoSistemaNegado(),
    });
  }
  throw error;
};

export class ExplorarTabelas {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly crypto: TokenEncryptorPort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: { ambienteId?: string; filtro?: string },
  ): Promise<{
    success: true;
    dialeto: string;
    tabelas: { schema: string | null; table_name: string; object_type: string }[];
    truncated: boolean;
    hint?: string;
  }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const consultavel = requireAmbienteConsultavel(ambiente);
    const sql = sqlExplorarTabelas(ambiente.dialeto);
    const params = { filtro: likeFiltro(input.filtro) };
    try {
      const result = await this.plug.executeSql({
        agentId: consultavel.agentId,
        clientToken: this.crypto.decrypt(consultavel.clientTokenEncriptado),
        sql,
        params,
        options: { maxRows: EXPLORAR_TABELAS_MAX_ROWS },
      });
      const tabelas = result.rows.map((row) => ({
        schema: cell(row, "schema_name") || null,
        table_name: cell(row, "table_name"),
        object_type: cell(row, "object_type") || "table",
      }));
      const truncated = tabelas.length >= EXPLORAR_TABELAS_MAX_ROWS;
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "explorar_tabelas",
        sqlEnviado: sql,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: tabelas.length,
        duracaoMs: Date.now() - started,
      });
      return {
        success: true,
        dialeto: ambiente.dialeto,
        tabelas,
        truncated,
        hint: truncated
          ? `Lista truncada em ${EXPLORAR_TABELAS_MAX_ROWS} tabelas. Passe filtro (ex.: venda) para estreitar.`
          : undefined,
      };
    } catch (error) {
      const code = error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR;
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "explorar_tabelas",
        sqlEnviado: sql,
        sucesso: false,
        codigoErro: code,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
      });
      return relancarCatalogoNegado(error);
    }
  }
}
