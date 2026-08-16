import type { EscopoCatalogo } from "../entities/fonte.js";
import type { ConsultaMemoria, NovaConsultaMemoriaInput } from "../entities/consulta-memoria.js";

export interface MemoriaConsultaRepositoryPort {
  criar(input: NovaConsultaMemoriaInput): Promise<ConsultaMemoria>;
  listar(escopo: EscopoCatalogo, limite: number): Promise<readonly ConsultaMemoria[]>;
  purgeOlderThan(cutoff: Date): Promise<number>;
}
