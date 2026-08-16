import type { Dialeto } from "../entities/dialeto.js";
import type { EscopoCatalogo, Fonte, FonteDetalhe, NovaFonteInput } from "../entities/fonte.js";

export interface SeedApplyResult {
  readonly criadas: number;
  readonly atualizadas: number;
  readonly desativadas: number;
}

export interface CatalogoQueryPort {
  listFontesAtivas(escopo: EscopoCatalogo): Promise<readonly Fonte[]>;
  findFonteBySlug(slug: string, escopo: EscopoCatalogo): Promise<Fonte | null>;
  obterDetalhe(
    slug: string,
    dialeto: Dialeto,
    escopo: EscopoCatalogo,
  ): Promise<FonteDetalhe | null>;
}

export interface CatalogoWritePort {
  criarFonte(input: NovaFonteInput): Promise<Fonte>;
  substituirFonte(input: NovaFonteInput): Promise<Fonte | null>;
  adicionarRelacionamento(
    fonteId: string,
    relacionamento: NovaFonteInput["relacionamentos"][number],
  ): Promise<void>;
  removerFonte(slug: string, escopo: EscopoCatalogo): Promise<boolean>;
}

export interface CatalogoSeedPort {
  seedIfEmpty(): Promise<void>;
  aplicarSeed(): Promise<SeedApplyResult>;
}

export interface CatalogoRepositoryPort
  extends CatalogoQueryPort, CatalogoWritePort, CatalogoSeedPort {}
