import {
  MAX_OBSERVACAO_MEMORIA,
  MAX_PERGUNTA_MEMORIA,
} from "../../domain/entities/consulta-memoria.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { CatalogoQueryPort } from "../../domain/ports/catalogo-repository.port.js";
import type { IndiceContextoPort } from "../../domain/ports/indice-contexto.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { MemoriaConsultaRepositoryPort } from "../../domain/ports/memoria-consulta-repository.port.js";
import { auditarTool, codigoErroDe } from "./shared/auditar.js";
import { requireSqlClassificavel } from "./shared/fonte-definicao.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";
import { indexarSeguro } from "./shared/indexar-seguro.js";

export class SalvarConsulta {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly catalogo: CatalogoQueryPort,
    private readonly memoria: MemoriaConsultaRepositoryPort,
    private readonly indice: IndiceContextoPort,
    private readonly audit: AuditLogPort,
    private readonly logger: LoggerPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: {
      ambienteId?: string;
      pergunta?: string;
      sql?: string;
      fonteId?: string;
      observacao?: string;
    },
  ): Promise<{ success: true; id: string }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const sql = input.sql?.trim() ?? "";
    try {
      const pergunta = input.pergunta?.trim() ?? "";
      if (pergunta.length < 5 || pergunta.length > MAX_PERGUNTA_MEMORIA) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `pergunta deve ter entre 5 e ${MAX_PERGUNTA_MEMORIA} caracteres.`,
          hint: "Grave a pergunta em linguagem natural que o usuário fez, não um título genérico.",
        });
      }
      const sqlClassificavel = requireSqlClassificavel(sql);
      const observacao = (input.observacao?.trim() ?? "").slice(0, MAX_OBSERVACAO_MEMORIA);
      const fonteSlugRaw = input.fonteId?.trim() ?? "";
      const fonteSlug = fonteSlugRaw.length > 0 ? fonteSlugRaw : null;
      const escopo = { mcpAccountId: accountId, agentId: ambiente.agentId };
      if (fonteSlug) {
        const fonte = await this.catalogo.findFonteBySlug(fonteSlug, escopo);
        if (!fonte?.ativo) {
          throw new DomainError({
            code: ERROR_CODES.FONTE_NOT_FOUND,
            message: `Fonte '${fonteSlug}' não existe neste ambiente.`,
            hint: "Use listar_fontes e passe o slug visível, ou omita fonteId.",
          });
        }
      }
      const salva = await this.memoria.criar({
        escopo,
        pergunta,
        sqlExecutado: sqlClassificavel,
        fonteSlug,
        observacao,
      });
      await indexarSeguro(this.indice, this.logger, escopo, {
        tipo: "consulta",
        id: salva.id,
        texto: `${pergunta} ${observacao}`,
      });
      await auditarTool(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "salvar_consulta",
        sql: sqlClassificavel,
        started,
        sucesso: true,
        codigoErro: null,
      });
      return { success: true as const, id: salva.id };
    } catch (error) {
      await auditarTool(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "salvar_consulta",
        sql: sql.length > 0 ? sql : null,
        started,
        sucesso: false,
        codigoErro: codigoErroDe(error),
      });
      throw error;
    }
  }
}
