import type { EscopoSkill } from "./escopo.js";
import type { ConsultaSemantica } from "./consulta-semantica.js";
import type { PoliticaConsulta } from "./politica-consulta.js";

export type StatusSkill = "rascunho" | "validada" | "publicada" | "rascunho_revalidacao";

export type TipoParametroSkill =
  "string" | "number" | "integer" | "decimal" | "date" | "datetime" | "boolean";

export interface ParametroSkill {
  readonly nome: string;
  readonly descricao: string;
  readonly obrigatorio: boolean;
  readonly tipo: TipoParametroSkill;
}

const TIPOS_PARAMETRO: readonly TipoParametroSkill[] = [
  "string",
  "number",
  "integer",
  "decimal",
  "date",
  "datetime",
  "boolean",
];

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
  readonly conhecimentoPublicado?: ConhecimentoSkillPublicado;
  readonly publicacaoAtivaId?: string | null;
  readonly publicacaoHash?: string;
  readonly statusRascunho?: StatusSkill;
  readonly id: string;
  readonly acessoId: string | null;
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly sqlModelo: string;
  readonly params: readonly ParametroSkill[];
  readonly escopo: EscopoSkill;
  readonly versao: number;
  readonly pacoteVersao: number;
  readonly status: StatusSkill;
  readonly motivoRevalidacao: string | null;
  readonly consultaSemantica: ConsultaSemantica | null;
  readonly politicaConsulta: PoliticaConsulta | null;
  readonly autorUsuarioId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ConhecimentoSkillPublicado {
  readonly colunas: readonly {
    tabela: string;
    nome: string;
    tipo: string | null;
    nullable: boolean | null;
    papel: string | null;
    dicionario: string | null;
    formato: string | null;
    descricao: string | null;
    perfil: unknown;
    sensibilidade: string;
    origem: string;
    status: string;
  }[];
  readonly relacionamentos: readonly {
    origem: string;
    destino: string;
    colunaOrigem: string;
    colunaDestino: string;
    pares: { colunaOrigem: string; colunaDestino: string }[];
    tipoJoin: string;
    cardinalidade: string | null;
    descricao: string | null;
    origemFato: string;
    escopoValidacao: { empresa?: string; filial?: string } | null;
  }[];
  readonly regras: readonly AnotacaoGrafo[];
  readonly metricas: readonly AnotacaoGrafo[];
}

export interface NovaSkill {
  readonly acessoId: string;
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly sqlModelo: string;
  readonly params?: readonly ParametroSkill[];
  readonly escopo?: EscopoSkill;
  readonly autorUsuarioId: string | null;
  readonly pacoteVersao?: number;
  readonly motivoRevalidacao?: string | null;
  readonly consultaSemantica?: ConsultaSemantica | null;
  readonly politicaConsulta?: PoliticaConsulta | null;
}

export interface AnotacaoGrafo {
  readonly id: string;
  readonly acessoId: string | null;
  readonly tabelaId: string | null;
  readonly skillId: string | null;
  readonly tipo: string;
  readonly titulo: string;
  readonly texto: string;
  readonly fonteTipo?: FonteConhecimento;
  readonly fonteReferencia?: string | null;
  readonly responsavel?: string | null;
  readonly validadoEm?: Date | null;
  readonly vigenteDe?: string | null;
  readonly vigenteAte?: string | null;
  /** Marco inicial para revisão única ou recorrente, na timezone do acesso. */
  readonly revisarEm?: string | null;
  /** Cadência opcional de revisão a partir de `revisarEm`/validação. */
  readonly periodoRevisaoDias?: number | null;
  readonly status?: StatusConhecimento;
  readonly autorUsuarioId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type FonteConhecimento = "usuario" | "erp" | "documento" | "importacao" | "legado" | "outro";

export type StatusConhecimento = "vigente" | "obsoleta";

export interface GovernancaConhecimento {
  readonly fonteTipo?: FonteConhecimento;
  readonly fonteReferencia?: string | null;
  readonly responsavel?: string | null;
  readonly validadoEm?: Date | null;
  readonly vigenteDe?: string | null;
  readonly vigenteAte?: string | null;
  readonly revisarEm?: string | null;
  readonly periodoRevisaoDias?: number | null;
  readonly status?: StatusConhecimento;
}
