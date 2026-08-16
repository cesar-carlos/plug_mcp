import { MAX_ANOTACOES_POR_FONTE, type FonteAnotacao } from "../../domain/entities/anotacao.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AnotacaoRepositoryPort } from "../../domain/ports/anotacao-repository.port.js";
import type { CatalogoQueryPort } from "../../domain/ports/catalogo-repository.port.js";
import type { Dialeto } from "../../domain/entities/dialeto.js";
import {
  origemFonte,
  type Fonte,
  type FonteColuna,
  type FonteRelacionamento,
  type RegraNegocio,
  type Sinonimo,
} from "../../domain/entities/fonte.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export interface ObterFonteResult {
  fonte: Fonte;
  origem: "seed" | "minha";
  dialeto: Dialeto;
  sqlBase: string;
  observacoesDialeto: string;
  colunas: readonly FonteColuna[];
  relacionamentos: readonly FonteRelacionamento[];
  regras: readonly RegraNegocio[];
  sinonimos: readonly Sinonimo[];
  anotacoes: readonly FonteAnotacao[];
  orientacoesIa: readonly string[];
}

export class ObterFonte {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly catalogo: CatalogoQueryPort,
    private readonly anotacoes: AnotacaoRepositoryPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: { ambienteId?: string; fonteId?: string },
  ): Promise<ObterFonteResult> {
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const slug = input.fonteId?.trim();
    if (!slug) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "fonteId é obrigatório (slug, ex.: vendas).",
        hint: "Chame listar_fontes ou buscar_contexto e use o campo id da fonte desejada.",
      });
    }
    const escopo = { mcpAccountId: accountId, agentId: ambiente.agentId };
    const detalhe = await this.catalogo.obterDetalhe(slug, ambiente.dialeto, escopo);
    if (!detalhe) {
      const fonte = await this.catalogo.findFonteBySlug(slug, escopo);
      if (!fonte) {
        throw new DomainError({
          code: ERROR_CODES.FONTE_NOT_FOUND,
          message: `Fonte '${slug}' não existe no catálogo.`,
          hint: "Use listar_fontes ou buscar_contexto. Se a consulta que o usuário pediu não aparece, explore o schema (explorar_tabelas) e registre com registrar_fonte.",
        });
      }
      throw new DomainError({
        code: ERROR_CODES.DIALECT_VARIANT_MISSING,
        message: `Fonte '${slug}' não tem SQL base para o dialeto ${ambiente.dialeto}.`,
        hint: "O ambiente foi conectado com este dialeto. Avise o usuário ou reconecte com o dialeto correto.",
      });
    }

    const daFonte = await this.anotacoes.listar(escopo, detalhe.fonte.id);
    const doAgente = await this.anotacoes.listar(escopo, null);
    const anotacoes = [...daFonte, ...doAgente].slice(0, MAX_ANOTACOES_POR_FONTE);
    const notasOrientacao = anotacoes
      .filter((nota) => nota.tipo === "uso" || nota.tipo === "preferencia")
      .map((nota) => (nota.titulo.length > 0 ? `${nota.titulo}: ${nota.texto}` : nota.texto));

    return {
      fonte: detalhe.fonte,
      origem: origemFonte(detalhe.fonte),
      dialeto: detalhe.dialeto,
      sqlBase: detalhe.sqlBase,
      observacoesDialeto: detalhe.observacoesDialeto,
      colunas: detalhe.colunas,
      relacionamentos: detalhe.relacionamentos,
      regras: detalhe.regras,
      sinonimos: detalhe.sinonimos,
      anotacoes,
      orientacoesIa: [...notasOrientacao, ...detalhe.orientacoesIa],
    };
  }
}
