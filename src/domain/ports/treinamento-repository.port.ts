import type { DocumentoTreino, TipoDocumentoTreino } from "../entities/treinamento.js";
export interface TreinamentoRepositoryPort {
  list(
    acessoId: string,
    tipo?: TipoDocumentoTreino,
    skillId?: string,
  ): Promise<readonly DocumentoTreino[]>;
  append(
    input: Omit<DocumentoTreino, "versao" | "createdAt"> & { expectedVersion: number },
  ): Promise<DocumentoTreino>;
}
