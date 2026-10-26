import { onScopeDispose, ref, watch, type Ref } from "vue";

/** A selection that changes away and back still invalidates its pending response. */
export function useDatasetRequest(
  context: () => string,
  disabled: () => boolean,
  error: Ref<string>,
  invalidate: () => void,
  lock: (value: boolean) => void,
): {
  busy: Ref<boolean>;
  run: (action: (isCurrent: () => boolean) => Promise<void>) => Promise<void>;
} {
  const busy = ref(false);
  let generation = 0;
  let live = true;
  watch(
    context,
    () => {
      generation++;
      error.value = "";
      invalidate();
    },
    { flush: "sync" },
  );
  onScopeDispose(() => {
    live = false;
    generation++;
    lock(false);
  });
  async function run(action: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
    if (!live || disabled() || busy.value) return;
    const started = generation;
    const isCurrent = () => live && started === generation;
    busy.value = true;
    lock(true);
    error.value = "";
    try {
      await action(isCurrent);
    } catch (cause) {
      if (isCurrent())
        error.value =
          cause instanceof Error ? cause.message : "Não foi possível preparar o dataset.";
    } finally {
      busy.value = false;
      if (live) lock(false);
    }
  }
  return { busy, run };
}
