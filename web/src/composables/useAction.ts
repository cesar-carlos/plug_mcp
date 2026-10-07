import { ref, type Ref } from "vue";
import { useSessionStore } from "../stores/session";

export interface ActionState {
  pending: Ref<boolean>;
  error: Ref<unknown>;
  run: <T>(fn: (bearer: string | undefined) => Promise<T>) => Promise<T | undefined>;
}

export const useAction = (): ActionState => {
  const session = useSessionStore();
  const pending = ref(false);
  const error = ref<unknown>(null);

  const run = async <T>(fn: (bearer: string | undefined) => Promise<T>): Promise<T | undefined> => {
    error.value = null;
    pending.value = true;
    try {
      return await fn(session.bearer ?? undefined);
    } catch (caught) {
      error.value = caught;
      return undefined;
    } finally {
      pending.value = false;
    }
  };

  return { pending, error, run };
};
