import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type {
  CatalogoQueryPort,
  CatalogoWritePort,
} from "../../domain/ports/catalogo-repository.port.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export class RemoverFonte {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly catalogo: CatalogoQueryPort & CatalogoWritePort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: { ambienteId?: string; slug?: string },
  ): Promise<{ success: true; slug: string; seedVoltouAValer: boolean }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const slug = input.slug?.trim() ?? "";
    if (!slug) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "slug é obrigatório.",
        hint: "Confirme com o usuário e passe o id (slug) de listar_fontes da fonte com origem=minha.",
      });
    }
    const escopo = { mcpAccountId: accountId, agentId: ambiente.agentId };
    const existente = await this.catalogo.findFonteBySlug(slug, escopo);
    if (!existente) {
      throw new DomainError({
        code: ERROR_CODES.FONTE_NOT_FOUND,
        message: `Fonte '${slug}' não existe neste ambiente.`,
        hint: "Use listar_fontes e confirme o slug com o usuário.",
      });
    }
    if (existente.mcpAccountId === null) {
      throw new DomainError({
        code: ERROR_CODES.FONTE_READONLY,
        message: `Fonte '${slug}' é do catálogo seed e não pode ser removida.`,
        hint: "Só fontes com origem=minha podem ser apagadas. Confirme o slug com listar_fontes.",
      });
    }
    const removida = await this.catalogo.removerFonte(slug, escopo);
    if (!removida) {
      throw new DomainError({
        code: ERROR_CODES.FONTE_NOT_FOUND,
        message: `Fonte '${slug}' não existe neste ambiente.`,
        hint: "Use listar_fontes e confirme o slug com o usuário.",
      });
    }
    const seed = await this.catalogo.findFonteBySlug(slug, escopo);
    const seedVoltouAValer = seed?.mcpAccountId === null && seed.ativo;
    await this.audit.append({
      mcpAccountId: accountId,
      ambienteId: ambiente.id,
      tool: "remover_fonte",
      sqlEnviado: null,
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: null,
      duracaoMs: Date.now() - started,
    });
    return { success: true, slug, seedVoltouAValer };
  }
}
