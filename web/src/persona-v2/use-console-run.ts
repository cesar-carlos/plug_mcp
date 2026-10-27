import { nextTick, ref, type Ref } from "vue";
import { ConsoleRequestError } from "./model";
import type { ConsoleArea } from "./navigation";
import { consoleFieldLabels, focusConsoleErrorField } from "./console-errors";

export function useConsoleRun(
  area: Ref<ConsoleArea>,
  onSessionExpired: () => void,
): {
  busy: Ref<boolean>;
  error: Ref<string>;
  message: Ref<string>;
  errorArea: Ref<ConsoleArea>;
  errorFields: Ref<readonly string[]>;
  errorForm: Ref<string>;
  invalidField: (field: string) => boolean;
  focusErrorField: (field: string) => void;
  run: (action: () => Promise<void>, form?: string) => Promise<void>;
} {
  const busy = ref(false);
  const error = ref("");
  const message = ref("");
  const errorArea = ref<ConsoleArea>("personas");
  const errorFields = ref<readonly string[]>([]);
  const errorForm = ref("");
  const invalidField = (field: string): boolean =>
    errorArea.value === area.value && errorFields.value.includes(field);
  function focusErrorField(field: string): void {
    focusConsoleErrorField(errorArea.value, field);
  }
  const run = async (action: () => Promise<void>, form = ""): Promise<void> => {
    if (busy.value) {
      return;
    }
    busy.value = true;
    errorArea.value = area.value;
    errorForm.value = form;
    error.value = "";
    errorFields.value = [];
    message.value = "";
    try {
      await action();
    } catch (cause) {
      if (cause instanceof ConsoleRequestError && cause.code === "ADMIN_SESSION_EXPIRED") {
        onSessionExpired();
      }
      error.value = cause instanceof Error ? cause.message : "Não foi possível concluir.";
      errorFields.value =
        cause instanceof ConsoleRequestError
          ? cause.fields.filter((field) => consoleFieldLabels[field])
          : [];
    } finally {
      busy.value = false;
      if (error.value) {
        await nextTick();
        if (errorFields.value.length) {
          const field = errorFields.value[0];
          if (field) {
            focusErrorField(field);
          }
        } else {
          document.querySelector<HTMLElement>(".area-error")?.focus();
        }
      }
    }
  };
  return {
    busy,
    error,
    message,
    errorArea,
    errorFields,
    errorForm,
    invalidField,
    focusErrorField,
    run,
  };
}
