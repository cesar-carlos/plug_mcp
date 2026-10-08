<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { confirmation, finishConfirmation } from "../confirmation";

const dialog = ref<HTMLDialogElement | null>(null);
watch(confirmation, async (value) => {
  await nextTick();
  if (value) {
    dialog.value?.showModal();
  } else {
    dialog.value?.close();
  }
});
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    aria-labelledby="confirm-title"
    aria-describedby="confirm-message"
    @cancel.prevent="finishConfirmation(false)"
  >
    <template v-if="confirmation">
      <p class="eyebrow">Revise antes de continuar</p>
      <h2 id="confirm-title">{{ confirmation.title }}</h2>
      <p id="confirm-message">{{ confirmation.message }}</p>
      <div class="form-actions">
        <button class="secondary" type="button" autofocus @click="finishConfirmation(false)">
          Cancelar
        </button>
        <button
          :class="{ danger: confirmation.danger }"
          type="button"
          @click="finishConfirmation(true)"
        >
          {{ confirmation.action || "Confirmar" }}
        </button>
      </div>
    </template>
  </dialog>
</template>
