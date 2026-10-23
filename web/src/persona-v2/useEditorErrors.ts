import { ref, useId, watch } from "vue";
import { ConsoleRequestError } from "./model";
import { useErrorSummary } from "./useErrorSummary";

/** Only map server-owned field references; never infer a nested field from message text. */
export function useEditorErrors() {
  const root = ref<HTMLElement>();
  const fields = ref<readonly string[]>([]);
  const errorId = `editor-error-${useId()}`;
  const summary = useErrorSummary(() =>
    root.value?.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)'),
  );
  watch(
    summary.error,
    (value) => {
      if (!value) fields.value = [];
    },
    { flush: "sync" },
  );
  function capture(cause: unknown) {
    fields.value =
      cause instanceof ConsoleRequestError
        ? cause.fields.filter((field) => ["name", "slug", "training", "contract"].includes(field))
        : [];
    summary.error.value =
      cause instanceof Error ? cause.message : "Não foi possível concluir a edição.";
  }
  return {
    ...summary,
    root,
    errorId,
    capture,
    invalid: (field: string) => !!summary.error.value && fields.value.includes(field),
  };
}
