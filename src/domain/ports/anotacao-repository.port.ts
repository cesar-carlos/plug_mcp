import type { EscopoCatalogo } from "../entities/fonte.js";
import type { FonteAnotacao, NovaAnotacaoInput } from "../entities/anotacao.js";

export interface AnotacaoRepositoryPort {
  listar(escopo: EscopoCatalogo, fonteId: string | null): Promise<readonly FonteAnotacao[]>;
  /** Todas as anotações do escopo (glossário + de qualquer fonte), sem filtrar por fonteId. */
  listarTudo(escopo: EscopoCatalogo, limite: number): Promise<readonly FonteAnotacao[]>;
  criar(input: NovaAnotacaoInput): Promise<FonteAnotacao>;
  remover(id: string, escopo: EscopoCatalogo): Promise<boolean>;
}
