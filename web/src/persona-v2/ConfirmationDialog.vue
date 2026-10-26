<script setup lang="ts">
import { onMounted, onBeforeUnmount, onUnmounted, ref, useId } from "vue";
import type { Confirmation } from "./useConfirmation";
defineProps<Confirmation>();
const emit = defineEmits<{ answer: [value: boolean] }>();
const dialog = ref<HTMLDialogElement>();
const id = useId();
let previous: HTMLElement | null = null;
onMounted(() => {
  previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value?.showModal();
});
onBeforeUnmount(() => dialog.value?.close());
onUnmounted(() => {
  if (previous?.isConnected) previous.focus();
});
</script>
<template>
  <dialog
    ref="dialog"
    :aria-labelledby="`${id}-title`"
    :aria-describedby="`${id}-description`"
    @cancel.prevent="emit('answer', false)"
  >
    <h2 :id="`${id}-title`">{{ title }}</h2>
    <p :id="`${id}-description`">{{ description }}</p>
    <div class="access-actions">
      <button type="button" autofocus class="secondary" @click="emit('answer', false)">
        Cancelar
      </button>
      <button type="button" class="danger" @click="emit('answer', true)">{{ confirmLabel }}</button>
    </div>
  </dialog>
</template>
