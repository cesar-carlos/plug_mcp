import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api";

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
}

export const useSessionStore = defineStore("session", () => {
  const bearer = ref<string | null>(null);
  const acesso = ref<AcessoPublico | null>(null);
  const issuedToken = ref<string | null>(null);

  const authenticated = computed(() => Boolean(bearer.value));

  const setBearer = (token: string): void => {
    bearer.value = token;
  };

  const rememberIssued = (token: string): void => {
    issuedToken.value = token;
    bearer.value = token;
  };

  const holdIssued = (token: string): void => {
    issuedToken.value = token;
  };

  const clearIssued = (): void => {
    issuedToken.value = null;
  };

  const clear = (): void => {
    bearer.value = null;
    acesso.value = null;
    issuedToken.value = null;
  };

  const refreshAcesso = async (): Promise<AcessoPublico> => {
    if (!bearer.value) {
      throw new Error("Bearer ausente.");
    }
    const result = await api.get<{ success: true; acessos: AcessoPublico[] }>(
      "/app/api/acesso",
      bearer.value,
    );
    const current = result.acessos[0];
    if (!current) {
      throw new Error("Este Bearer não tem persona.");
    }
    acesso.value = current;
    return current;
  };

  return {
    bearer,
    acesso,
    issuedToken,
    authenticated,
    setBearer,
    rememberIssued,
    holdIssued,
    clearIssued,
    clear,
    refreshAcesso,
  };
});
