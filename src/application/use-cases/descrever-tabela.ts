import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { TokenEncryptorPort } from "../../domain/ports/crypto.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import { requireAccount, requireAmbiente, requireAmbienteConsultavel } from "./shared/guards.js";
import {
  cell,
  DESCREVER_TABELA_MAX_ROWS,
  hintCatalogoSistemaNegado,
  parseIdentificadorTabela,
  sqlDescreverTabela,
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

export class DescreverTabela {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly crypto: TokenEncryptorPort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: { ambienteId?: string; tabela?: string },
  ): Promise<{
    success: true;
    tabela: string;
    colunas: { nome: string; tipo: string; nullable: boolean }[];
    truncated: boolean;
  }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const consultavel = requireAmbienteConsultavel(ambiente);
    const ident = parseIdentificadorTabela(input.tabela);
    const sql = sqlDescreverTabela(ambiente.dialeto, ident.schema !== null);
    const params: Record<string, unknown> = { tabela: ident.tabela };
    if (ident.schema) {
      params.schema = ident.schema;
    }
    try {
      const result = await this.plug.executeSql({
        agentId: consultavel.agentId,
        clientToken: this.crypto.decrypt(consultavel.clientTokenEncriptado),
        sql,
        params,
        options: { maxRows: DESCREVER_TABELA_MAX_ROWS },
      });
      const colunas = result.rows.map((row) => ({
        nome: cell(row, "column_name"),
        tipo: cell(row, "data_type"),
        nullable: cell(row, "is_nullable").toUpperCase() !== "NO",
      }));
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "descrever_tabela",
        sqlEnviado: sql,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: colunas.length,
        duracaoMs: Date.now() - started,
      });
      return {
        success: true,
        tabela: ident.schema ? `${ident.schema}.${ident.tabela}` : ident.tabela,
        colunas,
        truncated: colunas.length >= DESCREVER_TABELA_MAX_ROWS,
      };
    } catch (error) {
      const code = error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR;
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "descrever_tabela",
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
