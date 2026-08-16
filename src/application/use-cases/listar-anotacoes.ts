import {
  LISTAR_ANOTACOES_DEFAULT_LIMIT,
  LISTAR_ANOTACOES_MAX_LIMIT,
  type FonteAnotacao,
} from "../../domain/entities/anotacao.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AnotacaoRepositoryPort } from "../../domain/ports/anotacao-repository.port.js";
import type { CatalogoQueryPort } from "../../domain/ports/catalogo-repository.port.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export interface ListarAnotacoesInput {
  ambienteId?: string;
  fonteId?: string;
  limite?: number;
}

export interface AnotacaoListada {
  id: string;
  tipo: string;
  titulo: string;
  texto: string;
  fonteId: string | null;
  fonteSlug: string | null;
  updatedAt: Date;
}

export interface ListarAnotacoesResult {
  total: number;
  anotacoes: AnotacaoListada[];
}

const toListada = (row: FonteAnotacao, fonteSlug: string | null): AnotacaoListada => ({
  id: row.id,
  tipo: row.tipo,
  titulo: row.titulo,
  texto: row.texto,
  fonteId: row.fonteId,
  fonteSlug,
  updatedAt: row.updatedAt,
});

export class ListarAnotacoes {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly catalogo: CatalogoQueryPort,
    private readonly anotacoes: AnotacaoRepositoryPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: ListarAnotacoesInput,
  ): Promise<ListarAnotacoesResult> {
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const escopo = { mcpAccountId: accountId, agentId: ambiente.agentId };
    const requested = input.limite ?? LISTAR_ANOTACOES_DEFAULT_LIMIT;
    const limite = Math.min(Math.max(1, requested), LISTAR_ANOTACOES_MAX_LIMIT);

    const slug = input.fonteId?.trim();
    if (slug) {
      const fonte = await this.catalogo.findFonteBySlug(slug, escopo);
      if (!fonte?.ativo) {
        throw new DomainError({
          code: ERROR_CODES.FONTE_NOT_FOUND,
          message: `Fonte '${slug}' não existe neste ambiente.`,
          hint: "Use listar_fontes. Sem fonteId esta tool lista o glossário e as notas de todas as fontes deste agente.",
        });
      }
      const rows = await this.anotacoes.listar(escopo, fonte.id);
      return {
        total: rows.length,
        anotacoes: rows.slice(0, limite).map((row) => toListada(row, slug)),
      };
    }

    const rows = await this.anotacoes.listarTudo(escopo, limite);
    const fonteIds = [
      ...new Set(rows.map((row) => row.fonteId).filter((id): id is string => id !== null)),
    ];
    const slugById = new Map<string, string>();
    if (fonteIds.length > 0) {
      const fontes = await this.catalogo.listFontesAtivas(escopo);
      for (const fonte of fontes) {
        if (fonteIds.includes(fonte.id)) {
          slugById.set(fonte.id, fonte.slug);
        }
      }
    }
    return {
      total: rows.length,
      anotacoes: rows.map((row) =>
        toListada(row, row.fonteId === null ? null : (slugById.get(row.fonteId) ?? null)),
      ),
    };
  }
}
