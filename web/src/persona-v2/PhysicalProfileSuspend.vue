<script setup lang="ts">
import type { ProfilePublication } from "./knowledge-model";

defineProps<{
  profile: ProfilePublication;
  disabled: boolean;
}>();
const confirmed = defineModel<boolean>("confirmed", { required: true });
const emit = defineEmits<{
  suspend: [];
}>();
</script>

<template>
  <fieldset :disabled="disabled">
    <legend>Suspender versão selecionada</legend>
    <p>{{ profile.name }} · revisão {{ profile.revision }}</p>
    <label class="check"
      ><input v-model="confirmed" type="checkbox" />Confirmo a suspensão desta versão e o bloqueio
      das skills dependentes.</label
    ><button type="button" class="danger" :disabled="!confirmed" @click="emit('suspend')">
      Suspender perfil publicado
    </button>
  </fieldset>
</template>
