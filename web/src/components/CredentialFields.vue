<script lang="ts">
export default { name: "CredentialFields" };
</script>

<script setup lang="ts">
const credenciais = defineModel<{ email: string; senha: string }>({ required: true });

defineProps<{ senhaLabel?: string }>();
</script>

<template>
  <div>
    <label
      >E-mail
      <input v-model="credenciais.email" type="email" autocomplete="username" required
    /></label>
    <label
      >{{ senhaLabel ?? "Senha" }}
      <input v-model="credenciais.senha" type="password" autocomplete="current-password" required
    /></label>
  </div>
</template>
