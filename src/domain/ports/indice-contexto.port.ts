import type { EscopoCatalogo } from "../entities/fonte.js";

export type TipoHitContexto = "fonte" | "anotacao" | "consulta";

export interface HitContexto {
  readonly tipo: TipoHitContexto;
  readonly id: string;
  readonly slug: string | null;
  readonly trecho: string;
  readonly score: number;
}

export interface ItemIndexavel {
  readonly tipo: TipoHitContexto;
  readonly id: string;
  readonly texto: string;
}

export const BUSCAR_CONTEXTO_DEFAULT_LIMIT = 10;
export const BUSCAR_CONTEXTO_MAX_LIMIT = 20;

export interface IndiceContextoPort {
  buscar(escopo: EscopoCatalogo, texto: string, limite: number): Promise<readonly HitContexto[]>;
  indexar(escopo: EscopoCatalogo, item: ItemIndexavel): Promise<void>;
}
