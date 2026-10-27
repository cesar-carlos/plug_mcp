import { computed, onBeforeUnmount, ref, type Ref } from "vue";
import type { PersonaProgress } from "../../../src/domain/persona-v2/console";

export const progressStateLabels: Record<string, string> = {
  pendente: "Pendente",
  disponivel: "Disponível",
  concluido: "Concluído",
  bloqueado: "Bloqueado",
  nao_aplicavel: "Não aplicável",
};

/**
 * Busca e expõe o roteiro (`/progresso`) de uma persona. Compartilhado entre o
 * painel completo (Visão geral) e o aviso resumido visível em outras áreas,
 * para não duplicar a leitura do estado do servidor em dois lugares.
 */
export function usePersonaProgress(
  api: <T>(url: string, body?: unknown) => Promise<T>,
  base: Ref<string>,
) {
  const progress = ref<PersonaProgress>();
  const loading = ref(false);
  const error = ref("");
  let live = true;
  onBeforeUnmount(() => {
    live = false;
  });
  const nextStep = computed(() =>
    progress.value?.steps.find(
      (step) => step.state !== "concluido" && step.state !== "nao_aplicavel",
    ),
  );
  const pendingCount = computed(
    () =>
      progress.value?.steps.filter(
        (step) => step.state !== "concluido" && step.state !== "nao_aplicavel",
      ).length ?? 0,
  );
  async function load(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value = "";
    try {
      const result = await api<PersonaProgress>(`${base.value}/progresso`);
      if (live) progress.value = result;
    } catch (cause) {
      if (!live) return;
      progress.value = undefined;
      error.value = cause instanceof Error ? cause.message : "Não foi possível conferir o roteiro.";
    } finally {
      if (live) loading.value = false;
    }
  }
  function reset(): void {
    progress.value = undefined;
    error.value = "";
  }
  return { progress, loading, error, nextStep, pendingCount, load, reset };
}
