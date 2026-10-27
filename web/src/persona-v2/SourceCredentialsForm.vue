<script setup lang="ts">
import type { SourceCredentialDraft } from "./source-settings";

defineProps<{
  busy: boolean;
  sourceName: string;
}>();
const credentials = defineModel<SourceCredentialDraft>("credentials", { required: true });
const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <form :aria-label="`Trocar credenciais de ${sourceName}`" @submit.prevent="emit('submit')">
    <fieldset :disabled="busy">
      <label
        >CLIENT_EMAIL<input v-model="credentials.email" type="email" autocomplete="off" required
      /></label>
      <label
        >CLIENT_PASSWORD<input
          v-model="credentials.password"
          type="password"
          autocomplete="off"
          required
      /></label>
      <label
        >CLIENT_TOKEN<input
          v-model="credentials.clientToken"
          type="password"
          autocomplete="off"
          required
      /></label>
      <p>
        As credenciais serão verificadas pelo plug_server e plug_agente. A troca exige a mesma base
        e suspende o treinamento dependente até nova publicação.
      </p>
      <button>Verificar e trocar credenciais</button>
    </fieldset>
  </form>
</template>
