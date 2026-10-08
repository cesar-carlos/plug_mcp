import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, invalidateRequests } from "../api";
import { optionalString, record, records, stringField } from "../validation";

export interface BindingEscopo {
  tabela: string;
  coluna: string;
  param: "empresa" | "filial";
}

export interface EscopoPadrao {
  empresa?: string;
  filial?: string;
  bindings?: BindingEscopo[];
}

export interface AcessoPublico {
  id: string;
  agentId: string;
  dialeto: string;
  nomeAmigavel: string;
  statusAcesso: string;
  sqlAccessState?: string;
  sqlAccessSource?: string;
  clientTokenMasked?: string;
  nomePersona?: string | null;
  instrucoesPersona?: string | null;
  escopoPadrao?: EscopoPadrao | null;
  timezone?: string | null;
}

const escopoFromResponse = (value: unknown): EscopoPadrao | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const row = record(value);
  return {
    empresa: optionalString(row, "empresa"),
    filial: optionalString(row, "filial"),
    bindings:
      row.bindings === undefined
        ? undefined
        : records(row.bindings).map((binding) => {
            const param = stringField(binding, "param");
            if (param !== "empresa" && param !== "filial") {
              throw new Error("Vínculo de escopo incompatível na resposta do servidor.");
            }
            return {
              tabela: stringField(binding, "tabela"),
              coluna: stringField(binding, "coluna"),
              param,
            };
          }),
  };
};

export const useSessionStore = defineStore("session", () => {
  const bearer = ref<string | null>(null);
  const acesso = ref<AcessoPublico | null>(null);
  const issuedToken = ref<string | null>(null);
  const generation = ref(0);

  const authenticated = computed(() => Boolean(bearer.value));

  const setBearer = (token: string): void => {
    invalidateRequests();
    generation.value += 1;
    acesso.value = null;
    issuedToken.value = null;
    bearer.value = token;
  };

  const rememberIssued = (token: string): void => {
    setBearer(token);
    issuedToken.value = token;
  };

  const holdIssued = (token: string): void => {
    issuedToken.value = token;
  };

  const clearIssued = (): void => {
    issuedToken.value = null;
  };

  const clear = (): void => {
    invalidateRequests();
    generation.value += 1;
    bearer.value = null;
    acesso.value = null;
    issuedToken.value = null;
  };

  const refreshAcesso = async (): Promise<AcessoPublico> => {
    if (!bearer.value) {
      throw new Error("Token MCP ausente.");
    }
    const result = record(await api.get<unknown>("/app/api/acesso", bearer.value));
    const row = records(result.acessos)[0];
    const current = row
      ? {
          id: stringField(row, "id"),
          agentId: stringField(row, "agentId"),
          dialeto: stringField(row, "dialeto"),
          nomeAmigavel: stringField(row, "nomeAmigavel"),
          statusAcesso: stringField(row, "statusAcesso"),
          sqlAccessState: optionalString(row, "sqlAccessState"),
          sqlAccessSource: optionalString(row, "sqlAccessSource"),
          clientTokenMasked: optionalString(row, "clientTokenMasked"),
          nomePersona: optionalString(row, "nomePersona"),
          instrucoesPersona: optionalString(row, "instrucoesPersona"),
          timezone: optionalString(row, "timezone"),
          escopoPadrao: escopoFromResponse(row.escopoPadrao),
        }
      : undefined;
    if (!current) {
      throw new Error("Este Token MCP não tem persona.");
    }
    acesso.value = current;
    return current;
  };

  return {
    bearer,
    acesso,
    issuedToken,
    generation,
    authenticated,
    setBearer,
    rememberIssued,
    holdIssued,
    clearIssued,
    clear,
    refreshAcesso,
  };
});
