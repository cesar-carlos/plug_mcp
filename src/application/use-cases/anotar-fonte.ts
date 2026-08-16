import {
  MAX_ANOTACOES_POR_FONTE,
  MAX_TEXTO_ANOTACAO,
  MAX_TITULO_ANOTACAO,
  TIPOS_ANOTACAO,
  type TipoAnotacao,
} from "../../domain/entities/anotacao.js";
import type { Ambiente } from "../../domain/entities/ambiente.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AnotacaoRepositoryPort } from "../../domain/ports/anotacao-repository.port.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { CatalogoQueryPort } from "../../domain/ports/catalogo-repository.port.js";
import type { IndiceContextoPort } from "../../domain/ports/indice-contexto.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { auditarTool, codigoErroDe } from "./shared/auditar.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";
import { indexarSeguro } from "./shared/indexar-seguro.js";

export interface AnotarFonteInput {
  ambienteId?: string;
  fonteId?: string;
  tipo?: string;
  titulo?: string;
  texto?: string;
}

const isTipo = (value: string): value is TipoAnotacao =>
  (TIPOS_ANOTACAO as readonly string[]).includes(value);

export class AnotarFonte {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly catalogo: CatalogoQueryPort,
    private readonly anotacoes: AnotacaoRepositoryPort,
    private readonly indice: IndiceContextoPort,
    private readonly audit: AuditLogPort,
    private readonly logger: LoggerPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: AnotarFonteInput,
  ): Promise<{
    success: true;
    anotacaoId: string;
  }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    try {
      const result = await this.gravar(ambiente, input);
      await auditarTool(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "anotar_fonte",
        sql: null,
        started,
        sucesso: true,
        codigoErro: null,
      });
      return result;
    } catch (error) {
      await auditarTool(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "anotar_fonte",
        sql: null,
        started,
        sucesso: false,
        codigoErro: codigoErroDe(error),
      });
      throw error;
    }
  }

  private async gravar(
    ambiente: Ambiente,
    input: AnotarFonteInput,
  ): Promise<{ success: true; anotacaoId: string }> {
    const escopo = { mcpAccountId: ambiente.mcpAccountId, agentId: ambiente.agentId };
    const slugRaw = input.fonteId?.trim() ?? "";
    const slug = slugRaw.length > 0 ? slugRaw : undefined;
    const texto = input.texto?.trim() ?? "";
    if (texto.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Informe o texto da anotação.",
        hint: "O texto deve vir do usuário (nunca inventado). Para um join, use adicionar_relacionamento.",
      });
    }
    if (texto.length > MAX_TEXTO_ANOTACAO) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `texto deve ter no máximo ${MAX_TEXTO_ANOTACAO} caracteres.`,
        hint: "Resuma a nota; não despeje dumps de schema.",
      });
    }

    let fonteId: string | null = null;
    if (slug) {
      const fonte = await this.catalogo.findFonteBySlug(slug, escopo);
      if (!fonte?.ativo) {
        throw new DomainError({
          code: ERROR_CODES.FONTE_NOT_FOUND,
          message: `Fonte '${slug}' não existe neste ambiente.`,
          hint: "Use listar_fontes. Sem fonteId a anotação vira glossário deste agente.",
        });
      }
      fonteId = fonte.id;
    }

    const titulo = (input.titulo?.trim() ?? "").slice(0, MAX_TITULO_ANOTACAO);
    const tipoRaw = input.tipo?.trim().toLowerCase() ?? (fonteId === null ? "glossario" : "uso");
    if (!isTipo(tipoRaw)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "tipo de anotação inválido.",
        hint: "Use uso, codigo, alerta, glossario ou preferencia.",
      });
    }
    const existentes = await this.anotacoes.listar(escopo, fonteId);
    if (existentes.length >= MAX_ANOTACOES_POR_FONTE) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Limite de ${MAX_ANOTACOES_POR_FONTE} anotações atingido.`,
        hint: "Remova uma nota antiga com remover_anotacao antes de gravar outra.",
      });
    }
    const criada = await this.anotacoes.criar({
      escopo,
      fonteId,
      tipo: tipoRaw,
      titulo,
      texto,
    });
    await indexarSeguro(this.indice, this.logger, escopo, {
      tipo: "anotacao",
      id: criada.id,
      texto: `${titulo} ${texto}`,
    });
    return { success: true as const, anotacaoId: criada.id };
  }
}
