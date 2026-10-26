import { onBeforeUnmount, ref } from "vue";

export interface Confirmation {
  title: string;
  description: string;
  confirmLabel: string;
}

export function useConfirmation() {
  const confirmation = ref<Confirmation>();
  let resolve: ((answer: boolean) => void) | undefined;
  function answer(value: boolean) {
    confirmation.value = undefined;
    const pending = resolve;
    resolve = undefined;
    pending?.(value);
  }
  function ask(value: Confirmation): Promise<boolean> {
    if (resolve) return Promise.resolve(false);
    confirmation.value = value;
    return new Promise((done) => {
      resolve = done;
    });
  }
  onBeforeUnmount(() => answer(false));
  return { confirmation, ask, answer };
}
