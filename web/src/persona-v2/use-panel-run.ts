import { onBeforeUnmount, ref, type Ref } from "vue";

export interface PanelRunOptions {
  disabled: () => boolean;
  fallbackError: string;
}

export interface PanelLockEmit {
  (event: "lock", value: boolean): void;
}

export interface PanelRun {
  busy: Ref<boolean>;
  error: Ref<string>;
  message: Ref<string>;
  isLive: () => boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}

/** Loop local de busy, lock e live. Não aprova, não executa e não concede acesso. */
export function usePanelRun(options: PanelRunOptions, emit: PanelLockEmit): PanelRun {
  const busy = ref(false);
  const error = ref("");
  const message = ref("");
  let live = true;

  onBeforeUnmount(() => {
    live = false;
    emit("lock", false);
  });

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy.value || options.disabled()) {
      return;
    }
    busy.value = true;
    emit("lock", true);
    error.value = "";
    message.value = "";
    try {
      await action();
    } catch (cause) {
      if (live) {
        error.value = cause instanceof Error ? cause.message : options.fallbackError;
      }
    } finally {
      busy.value = false;
      if (live) {
        emit("lock", false);
      }
    }
  }

  return { busy, error, message, isLive: () => live, run };
}
