import { ref, shallowRef, watch, type WatchSource, type Ref, type ShallowRef } from "vue";

export interface ReviewState<T> {
  preview: ShallowRef<T | null>;
  confirmado: Ref<boolean>;
  invalidar: () => void;
}

export const useReview = <T>(sources: WatchSource[]): ReviewState<T> => {
  const preview = shallowRef<T | null>(null);
  const confirmado = ref(false);
  const invalidar = (): void => {
    preview.value = null;
    confirmado.value = false;
  };
  watch(sources, invalidar, { deep: true, flush: "sync" });
  return { preview, confirmado, invalidar };
};
