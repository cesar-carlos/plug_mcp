import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { api } from "../api";
import { useSessionStore } from "./session";
import { record, stringField } from "../validation";

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
  statusRascunho?: string;
  publicacaoAtivaId?: string | null;
  fluxoTreino: FluxoTreinoUi | null;
  params: ParametroSkillForm[];
  revisao: "rascunho" | "publicada";
}

const asTipo = (value: unknown): TipoParametro => {
  const tipo = typeof value === "string" ? value : "string";
  return (TIPOS as readonly string[]).includes(tipo) ? (tipo as TipoParametro) : "string";
};

const asFluxo = (value: unknown): FluxoTreinoUi | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const fluxo = record(value);
  return {
    proximoPasso: typeof fluxo.proximoPasso === "string" ? fluxo.proximoPasso : null,
    podeLiberar: fluxo.podeLiberar === true,
    passos: Array.isArray(fluxo.passos)
      ? fluxo.passos.map((item) => {
          const row = record(item);
          return {
            id: stringField(row, "id"),
            status: stringField(row, "status"),
            hint: stringField(row, "hint"),
          };
        })
      : [],
  };
};

const asParams = (value: unknown): ParametroSkillForm[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const row = record(item);
    return {
      nome: stringField(row, "nome"),
      descricao: typeof row.descricao === "string" ? row.descricao : "",
      obrigatorio: row.obrigatorio !== false,
      tipo: asTipo(row.tipo),
    };
  });
};

export const useSkillStore = defineStore("skills", () => {
  const aberta = ref<SkillAberta | null>(null);
  const confirmacaoHash = ref<string | null>(null);
  const publicada = ref<SkillAberta | null>(null);
  const sqlTreinado = ref("");

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
    const skill = record(result.skill);
    const loaded: SkillAberta = {
      id: stringField(skill, "id"),
      nome: stringField(skill, "nome"),
      descricao: stringField(skill, "descricao"),
      sqlModelo: stringField(skill, "sqlModelo"),
      status: stringField(skill, "status"),
      statusRascunho:
        typeof skill.statusRascunho === "string"
          ? skill.statusRascunho
          : stringField(skill, "status"),
      publicacaoAtivaId:
        typeof skill.publicacaoAtivaId === "string" ? skill.publicacaoAtivaId : null,
      fluxoTreino: asFluxo(result.fluxoTreino ?? skill.fluxoTreino),
      params: asParams(skill.params),
      revisao,
    };
    if (revisao === "publicada") {
      publicada.value = loaded;
    } else {
      aberta.value = loaded;
      confirmacaoHash.value = null;
    }
    return loaded;
  };

  const guardarHash = (hash: string | null): void => {
    confirmacaoHash.value = hash;
  };

  const limpar = (): void => {
    aberta.value = null;
    confirmacaoHash.value = null;
    publicada.value = null;
    sqlTreinado.value = "";
  };
  watch(() => useSessionStore().generation, limpar, { flush: "sync" });

  return {
    aberta,
    publicada,
    sqlTreinado,
    confirmacaoHash,
    podePublicar,
    carregar,
    guardarHash,
    limpar,
  };
});
