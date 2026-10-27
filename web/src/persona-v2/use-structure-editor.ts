import { ref, watch, type Ref } from "vue";
import {
  emptyStructureContent,
  parseStructureContent,
  type StructureDraft,
} from "./structure-editor";

export function useStructureEditor(
  modelValue: () => unknown,
  emit: (value: StructureDraft) => void,
): {
  content: Ref<StructureDraft | undefined>;
  invalid: Ref<boolean>;
  start: () => void;
} {
  const content = ref<StructureDraft>();
  const invalid = ref(false);
  watch(
    modelValue,
    (value) => {
      if (value === content.value) {
        return;
      }
      const parsed = parseStructureContent(value);
      content.value = parsed.content;
      invalid.value = parsed.invalid;
    },
    { immediate: true },
  );
  watch(
    content,
    (value) => {
      if (value) {
        emit(value);
      }
    },
    { deep: true },
  );
  function start(): void {
    content.value = emptyStructureContent();
  }
  return { content, invalid, start };
}
