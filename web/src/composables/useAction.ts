import { getCurrentScope, onScopeDispose, ref, type Ref } from "vue";
import { useSessionStore } from "../stores/session";
import { isCancelled } from "../api";

export interface ActionState {
  outcome: Ref<"idle" | "pending" | "success" | "error" | "cancelled">;
  pending: Ref<boolean>;
  error: Ref<unknown>;
  success: Ref<boolean>;
  run: <T>(
    fn: (bearer: string | undefined) => Promise<T>,
    options?: { feedback?: boolean },
  ) => Promise<T | undefined>;
}

export const useAction = (): ActionState => {
  const session = useSessionStore();
  const pending = ref(false);
  const error = ref<unknown>(null);
  const success = ref(false);
  const outcome = ref<ActionState["outcome"]["value"]>("idle");
  let active = true;
  if (getCurrentScope()) {
    onScopeDispose(() => {
      active = false;
    });
  }

  const run = async <T>(
    fn: (bearer: string | undefined) => Promise<T>,
    options?: { feedback?: boolean },
  ): Promise<T | undefined> => {
    if (pending.value || !active) {
      return undefined;
    }
    error.value = null;
    success.value = false;
    pending.value = true;
    outcome.value = "pending";
    try {
      const result = await fn(session.bearer ?? undefined);
      if (active) {
        success.value = options?.feedback !== false;
        outcome.value = "success";
      }
      return active ? result : undefined;
    } catch (caught) {
      if (active) {
        outcome.value = isCancelled(caught) ? "cancelled" : "error";
        if (!isCancelled(caught)) {
          error.value = caught;
        }
      }
      return undefined;
    } finally {
      pending.value = false;
    }
  };

  return { pending, error, success, outcome, run };
};
