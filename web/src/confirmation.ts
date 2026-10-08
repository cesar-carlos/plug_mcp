import { shallowRef } from "vue";

export interface Confirmation {
  title: string;
  message: string;
  action?: string;
  danger?: boolean;
}

export const confirmation = shallowRef<Confirmation | null>(null);
let resolvePending: ((accepted: boolean) => void) | undefined;

export const finishConfirmation = (accepted: boolean): void => {
  confirmation.value = null;
  resolvePending?.(accepted);
  resolvePending = undefined;
};

export const askConfirmation = (options: Confirmation): Promise<boolean> => {
  if (confirmation.value) {
    return Promise.resolve(false);
  }
  confirmation.value = options;
  return new Promise((resolve) => {
    resolvePending = resolve;
  });
};
