<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  helpId: string;
  dirty: boolean;
  needsReload: boolean;
  hasIcon: boolean;
  locked: boolean;
  loaded: boolean;
}>();
const emit = defineEmits<{
  select: [event: Event];
  save: [];
  discard: [];
  default: [];
}>();
const fileInput = ref<HTMLInputElement>();

function clearFile(): void {
  if (fileInput.value) {
    fileInput.value.value = "";
  }
}

function focusFile(): void {
  fileInput.value?.focus();
}

defineExpose({ clearFile, focusFile });
</script>

<template>
  <form @submit.prevent="emit('save')">
    <fieldset :disabled="locked || !loaded">
      <label
        >Imagem PNG, JPEG ou WebP
        <input
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          :aria-describedby="helpId"
          @change="emit('select', $event)"
        />
      </label>
      <button type="submit" :disabled="!dirty || needsReload">Salvar ícone</button>
      <button type="button" class="secondary" :disabled="!dirty" @click="emit('discard')">
        Descartar alterações do ícone
      </button>
      <button
        type="button"
        class="secondary"
        :disabled="!hasIcon && !dirty"
        @click="emit('default')"
      >
        Usar ícone padrão
      </button>
    </fieldset>
  </form>
</template>

<style scoped>
input[type="file"] {
  max-width: 100%;
  min-width: 0;
}
</style>
