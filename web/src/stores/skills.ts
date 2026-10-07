import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api";
import { useSessionStore } from "./session";

const TIPOS = ["string", "number", "integer", "decimal", "date", "datetime", "boolean"] as const;

export type TipoParametro = (typeof TIPOS)[number];

export interface ParametroSkillForm {
  nome: string;
  descricao: string;
  obrigatorio: boolean;
  tipo: TipoParametro;
}

export interface PassoTreinoUi {
  id: string;
  status: string;
  hint: string;
}

export interface FluxoTreinoUi {
  proximoPasso: string | null;
  podeLiberar: boolean;
  passos: PassoTreinoUi[];
}

export interface SkillAberta {
  id: string;
  nome: string;
  descricao: string;
  sqlModelo: string;
  status: string;
  fluxoTreino: FluxoTreinoUi | null;
  params: ParametroSkillForm[];
  revisao: "rascunho" | "publicada";
}

const asTipo = (value: unknown): TipoParametro => {
  const tipo = String(value ?? "string");
  return (TIPOS as readonly string[]).includes(tipo) ? (tipo as TipoParametro) : "string";
};

const asFluxo = (value: unknown): FluxoTreinoUi | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const fluxo = value as Partial<FluxoTreinoUi>;
  return {
    proximoPasso: typeof fluxo.proximoPasso === "string" ? fluxo.proximoPasso : null,
    podeLiberar: fluxo.podeLiberar === true,
    passos: Array.isArray(fluxo.passos) ? fluxo.passos : [],
  };
};

const asParams = (value: unknown): ParametroSkillForm[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      nome: String(row.nome ?? ""),
      descricao: String(row.descricao ?? ""),
      obrigatorio: row.obrigatorio !== false,
      tipo: asTipo(row.tipo),
    };
  });
};

export const useSkillStore = defineStore("skills", () => {
  const aberta = ref<SkillAberta | null>(null);
  const confirmacaoHash = ref<string | null>(null);

  const podePublicar = computed(() => aberta.value?.fluxoTreino?.proximoPasso === "publicar_skill");

  const carregar = async (
    id: string,
    revisao: "rascunho" | "publicada" = "rascunho",
  ): Promise<SkillAberta> => {
    const session = useSessionStore();
    const result = await api.get<{
      success: true;
      skill: Record<string, unknown>;
      fluxoTreino?: unknown;
    }>(`/app/api/skills/${encodeURIComponent(id)}?revisao=${revisao}`, session.bearer ?? undefined);
    const skill = result.skill;
    aberta.value = {
      id: String(skill.id ?? id),
      nome: String(skill.nome ?? ""),
      descricao: String(skill.descricao ?? ""),
      sqlModelo: String(skill.sqlModelo ?? ""),
      status: String(skill.status ?? ""),
      fluxoTreino: asFluxo(result.fluxoTreino ?? skill.fluxoTreino),
      params: asParams(skill.params),
      revisao,
    };
    return aberta.value;
  };

  const guardarHash = (hash: string | null): void => {
    confirmacaoHash.value = hash;
  };

  const limpar = (): void => {
    aberta.value = null;
    confirmacaoHash.value = null;
  };

  return { aberta, confirmacaoHash, podePublicar, carregar, guardarHash, limpar };
});
