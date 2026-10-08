import { onBeforeUnmount, type Ref } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import { askConfirmation } from "../confirmation";

export const useUnsavedChanges = (dirty: Ref<boolean>): void => {
  const leave = async (): Promise<boolean> =>
    !dirty.value ||
    askConfirmation({
      title: "Descartar alterações?",
      message: "Há alterações não salvas. Você pode cancelar para continuar a edição.",
      action: "Descartar e sair",
      danger: true,
    });
  onBeforeRouteLeave(leave);
  onBeforeRouteUpdate(leave);
  const beforeUnload = (event: BeforeUnloadEvent): void => {
    if (dirty.value) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnload);
  onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
};
