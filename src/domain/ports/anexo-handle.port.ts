import type { AnexoPutInput, AnexoRecord } from "../entities/anexo.js";

export interface AnexoHandlePort {
  put(input: AnexoPutInput): string;
  get(handle: string, usuarioId: string): AnexoRecord | null;
}
