import type { EscopoSkill } from "./escopo.js";

export type StatusSkill = "rascunho" | "validada" | "publicada";

export type TipoParametroSkill = "string" | "number" | "date" | "boolean";

export interface ParametroSkill {
  readonly nome: string;
  readonly descricao: string;
  readonly obrigatorio: boolean;
  readonly tipo: TipoParametroSkill;
}

const TIPOS_PARAMETRO: readonly TipoParametroSkill[] = ["string", "number", "date", "boolean"];

const parseTipoParametro = (value: unknown): TipoParametroSkill =>
  typeof value === "string" && (TIPOS_PARAMETRO as readonly string[]).includes(value)
    ? (value as TipoParametroSkill)
    : "string";

/** JSON legado sem `tipo` vira `string`. */
export const parseParametroSkillList = (value: unknown): ParametroSkill[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: ParametroSkill[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const nome = typeof rec.nome === "string" ? rec.nome.trim() : "";
    if (!nome) {
      continue;
    }
    out.push({
      nome,
      descricao: typeof rec.descricao === "string" ? rec.descricao : "",
      obrigatorio: rec.obrigatorio !== false,
      tipo: parseTipoParametro(rec.tipo),
    });
  }
  return out;
};

export interface Skill {
  readonly id: string;
  readonly agentId: string;
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly sqlModelo: string;
  readonly params: readonly ParametroSkill[];
  readonly escopo: EscopoSkill;
  readonly versao: number;
  readonly status: StatusSkill;
  readonly autorUsuarioId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NovaSkill {
  readonly agentId: string;
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly sqlModelo: string;
  readonly params?: readonly ParametroSkill[];
  readonly escopo?: EscopoSkill;
  readonly autorUsuarioId: string | null;
}

export interface AnotacaoGrafo {
  readonly id: string;
  readonly agentId: string;
  readonly tabelaId: string | null;
  readonly tipo: string;
  readonly titulo: string;
  readonly texto: string;
  readonly autorUsuarioId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
