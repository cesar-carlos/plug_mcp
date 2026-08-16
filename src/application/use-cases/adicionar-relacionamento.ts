import type { Ambiente } from "../../domain/entities/ambiente.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type {
  CatalogoQueryPort,
  CatalogoWritePort,
} from "../../domain/ports/catalogo-repository.port.js";
import { auditarTool, codigoErroDe } from "./shared/auditar.js";
import {
  parseUmRelacionamento,
  resolverRelacionamentos,
  type RelacionamentoDefinicaoInput,
} from "./shared/fonte-definicao.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export interface AdicionarRelacionamentoInput {
  ambienteId?: string;
  fonteId?: string;
  relacionamento?: RelacionamentoDefinicaoInput;
}

export class AdicionarRelacionamento {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly catalogo: CatalogoQueryPort & CatalogoWritePort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: AdicionarRelacionamentoInput,
  ): Promise<{ success: true; relacionamentoAdicionado: true }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    try {
      await this.gravar(ambiente, input);
      await auditarTool(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "adicionar_relacionamento",
        sql: null,
        started,
        sucesso: true,
        codigoErro: null,
      });
      return { success: true as const, relacionamentoAdicionado: true as const };
    } catch (error) {
      await auditarTool(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "adicionar_relacionamento",
        sql: null,
        started,
        sucesso: false,
        codigoErro: codigoErroDe(error),
      });
      throw error;
    }
  }

  private async gravar(ambiente: Ambiente, input: AdicionarRelacionamentoInput): Promise<void> {
    const slug = input.fonteId?.trim() ?? "";
    if (!slug) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "fonteId é obrigatório.",
        hint: "Informe o slug da fonte origem visível em listar_fontes.",
      });
    }
    if (input.relacionamento === undefined) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "relacionamento é obrigatório.",
        hint: "Informe colunaOrigem, colunaDestino e fonteDestinoSlug ou tabelaDestino.",
      });
    }
    const escopo = { mcpAccountId: ambiente.mcpAccountId, agentId: ambiente.agentId };
    const fonte = await this.catalogo.findFonteBySlug(slug, escopo);
    if (!fonte?.ativo) {
      throw new DomainError({
        code: ERROR_CODES.FONTE_NOT_FOUND,
        message: `Fonte '${slug}' não existe neste ambiente.`,
        hint: "Use listar_fontes e passe o slug da fonte origem.",
      });
    }
    if (fonte.mcpAccountId === null) {
      throw new DomainError({
        code: ERROR_CODES.FONTE_READONLY,
        message: "Não dá para acrescentar relacionamento no seed.",
        hint: "Registre uma sombra com registrar_fonte no mesmo slug, ou anote o cruzamento em texto com anotar_fonte (tipo uso).",
      });
    }
    const parsed = parseUmRelacionamento(input.relacionamento, 0);
    const resolved = await resolverRelacionamentos(this.catalogo, ambiente, [parsed]);
    const rel = resolved[0];
    if (!rel) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Relacionamento inválido.",
        hint: "Informe colunaOrigem, colunaDestino e fonteDestinoSlug ou tabelaDestino.",
      });
    }
    await this.catalogo.adicionarRelacionamento(fonte.id, rel);
  }
}
