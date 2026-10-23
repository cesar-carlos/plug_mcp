import { nextTick, ref, watch } from "vue";

/** Focus the mounted error summary after rendering; never retain field values. */
export function useErrorSummary(target?: () => HTMLElement | null | undefined) {
  const error = ref(""),
    errorSummary = ref<HTMLElement>();
  watch(error, async (value) => {
    if (!value) return;
    await nextTick();
    (target?.() ?? errorSummary.value)?.focus();
  });
  return { error, errorSummary };
}
