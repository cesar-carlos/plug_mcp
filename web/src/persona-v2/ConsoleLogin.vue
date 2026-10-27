<script setup lang="ts">
defineProps<{ busy: boolean }>();
const email = defineModel<string>("email", { required: true });
const password = defineModel<string>("password", { required: true });
const emit = defineEmits<{ submit: [] }>();
</script>
<template>
  <form @submit.prevent="emit('submit')">
    <h2>Entre com sua conta Client</h2>
    <label>E-mail<input v-model="email" type="email" autocomplete="username" required /></label
    ><label
      >Senha<input v-model="password" type="password" autocomplete="current-password" required
    /></label>
    <button :disabled="busy">{{ busy ? "Entrando…" : "Entrar" }}</button>
  </form>
</template>
