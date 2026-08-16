import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type {
  CatalogoQueryPort,
  CatalogoWritePort,
} from "../../domain/ports/catalogo-repository.port.js";
import type { TokenEncryptorPort } from "../../domain/ports/crypto.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import {
  executarDryRun,
  montarNovaFonte,
  parseDefinicaoFonte,
  resolverRelacionamentos,
  type DefinicaoFonteInput,
} from "./shared/fonte-definicao.js";
import { requireAccount, requireAmbiente, requireAmbienteConsultavel } from "./shared/guards.js";

export class AtualizarFonte {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly catalogo: CatalogoQueryPort & CatalogoWritePort,
    private readonly plug: PlugServerGatewayPort,
    private readonly crypto: TokenEncryptorPort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: DefinicaoFonteInput & { ambienteId?: string; confirmado?: boolean },
  ): Promise<{ success: true; slug: string; avisos: string[] }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const consultavel = requireAmbienteConsultavel(ambiente);
    const definicao = parseDefinicaoFonte(input);
    const escopo = { mcpAccountId: accountId, agentId: ambiente.agentId };
    const existente = await this.catalogo.findFonteBySlug(definicao.slug, escopo);
    if (!existente) {
      throw new DomainError({
        code: ERROR_CODES.FONTE_NOT_FOUND,
        message: `Fonte '${definicao.slug}' não existe neste ambiente.`,
        hint: "Use listar_fontes. Para criar, chame registrar_fonte.",
      });
    }
    if (existente.mcpAccountId === null) {
      throw new DomainError({
        code: ERROR_CODES.FONTE_READONLY,
        message: `Fonte '${definicao.slug}' é do catálogo seed e não pode ser editada.`,
        hint: "Registre a sua versão com registrar_fonte usando o mesmo slug; ela fará sombra ao seed neste agente.",
      });
    }
    const relacionamentos = await resolverRelacionamentos(
      this.catalogo,
      ambiente,
      definicao.relacionamentos,
    );
    if (input.confirmado !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Confirme com o usuário antes de substituir a fonte.",
        hint: `Resumo: slug=${definicao.slug}; colunas=${definicao.colunas.map((c) => c.nome).join(", ")}. Mostre o SQL, chame testar_sql se mudou o sqlBase, confirme dicionários de código com o usuário, e se concordar chame atualizar_fonte de novo com confirmado=true.`,
      });
    }
    try {
      const dry = await executarDryRun(
        { plug: this.plug, crypto: this.crypto },
        consultavel,
        definicao,
      );
      const updated = await this.catalogo.substituirFonte(
        montarNovaFonte(ambiente, definicao, relacionamentos),
      );
      if (!updated) {
        throw new DomainError({
          code: ERROR_CODES.FONTE_NOT_FOUND,
          message: `Fonte '${definicao.slug}' não existe neste ambiente.`,
          hint: "Use listar_fontes. Para criar, chame registrar_fonte.",
        });
      }
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "atualizar_fonte",
        sqlEnviado: definicao.sqlBase,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
      });
      return { success: true, slug: definicao.slug, avisos: [...dry.avisos] };
    } catch (error) {
      const code = error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR;
      await this.audit.append({
        mcpAccountId: accountId,
        ambienteId: ambiente.id,
        tool: "atualizar_fonte",
        sqlEnviado: definicao.sqlBase,
        sucesso: false,
        codigoErro: code,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
      });
      throw error;
    }
  }
}
