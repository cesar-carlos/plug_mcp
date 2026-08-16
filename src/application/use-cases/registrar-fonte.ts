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

export interface RegistrarFonteResult {
  success: true;
  slug: string;
  origem: "minha";
  sombraDoSeed: boolean;
  avisos: string[];
}

const auditar = async (
  audit: AuditLogPort,
  input: {
    accountId: string;
    ambienteId: string;
    tool: string;
    sql: string;
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

export class RegistrarFonte {
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
  ): Promise<RegistrarFonteResult> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const consultavel = requireAmbienteConsultavel(ambiente);
    const definicao = parseDefinicaoFonte(input);
    const escopo = { mcpAccountId: accountId, agentId: ambiente.agentId };
    const existente = await this.catalogo.findFonteBySlug(definicao.slug, escopo);
    if (existente?.mcpAccountId) {
      throw new DomainError({
        code: ERROR_CODES.FONTE_JA_EXISTE,
        message: `A fonte '${definicao.slug}' já está registrada nesta conta e agente.`,
        hint: "Chame obter_fonte, aplique a alteração e use atualizar_fonte com a definição completa.",
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
        message: "Confirme com o usuário antes de gravar a fonte.",
        hint: `Resumo: slug=${definicao.slug}; nome=${definicao.nome}; colunas=${definicao.colunas.map((c) => c.nome).join(", ")}. Mostre o SQL e a amostra de testar_sql, confirme códigos (Status etc.) com o usuário em regraNegocio/regras, e se concordar chame registrar_fonte de novo com os mesmos campos e confirmado=true.`,
      });
    }
    try {
      const dry = await executarDryRun(
        { plug: this.plug, crypto: this.crypto },
        consultavel,
        definicao,
      );
      await this.catalogo.criarFonte(montarNovaFonte(ambiente, definicao, relacionamentos));
      await auditar(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "registrar_fonte",
        sql: definicao.sqlBase,
        started,
        sucesso: true,
        codigoErro: null,
      });
      const avisos = [...dry.avisos];
      if (existente) {
        avisos.unshift(
          `Esta fonte faz sombra à versão do seed '${definicao.slug}'. listar_fontes e obter_fonte passam a usar a sua.`,
        );
      }
      return {
        success: true,
        slug: definicao.slug,
        origem: "minha",
        sombraDoSeed: Boolean(existente),
        avisos,
      };
    } catch (error) {
      const code = error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR;
      await auditar(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "registrar_fonte",
        sql: definicao.sqlBase,
        started,
        sucesso: false,
        codigoErro: code,
      });
      throw error;
    }
  }
}
