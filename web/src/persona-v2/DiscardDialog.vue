<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
const emit = defineEmits<{ answer: [discard: boolean] }>();
const dialog = ref<HTMLDialogElement>();
let previous: HTMLElement | null = null;
onMounted(() => {
  previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value?.showModal();
});
onBeforeUnmount(() => previous?.focus());
</script>
<template>
  <dialog ref="dialog" aria-labelledby="discard-title" @cancel.prevent="emit('answer', false)">
    <h2 id="discard-title">Há alterações não salvas</h2>
    <p>Descartar remove a edição desta área. As versões já salvas serão preservadas.</p>
    <button autofocus @click="emit('answer', false)">Continuar editando</button>
    <button class="danger" @click="emit('answer', true)">Descartar alterações</button>
  </dialog>
</template>
