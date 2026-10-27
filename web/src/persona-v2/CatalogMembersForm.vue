<script setup lang="ts">
import type { CatalogMember } from "./catalog-panel";

defineProps<{
  members: CatalogMember[];
  clientId: string;
  role: string;
}>();
const emit = defineEmits<{
  "update:clientId": [value: string];
  "update:role": [value: string];
  save: [];
}>();
</script>

<template>
  <form aria-label="Permissões do catálogo" @submit.prevent="emit('save')">
    <h3>Participantes</h3>
    <ul>
      <li v-for="member in members" :key="member.hubClientId">
        {{ member.hubClientId }} · {{ member.role }}
      </li>
    </ul>
    <label
      >ID Client do participante<input
        :value="clientId"
        maxlength="200"
        required
        @input="emit('update:clientId', ($event.target as HTMLInputElement).value)"
    /></label>
    <label
      >Papel do participante<select
        :value="role"
        @change="emit('update:role', ($event.target as HTMLSelectElement).value)"
      >
        <option value="reader">Leitor</option>
        <option value="contributor">Colaborador</option>
        <option value="curator">Curador</option>
        <option value="administrator">Administrador</option>
        <option value="">Revogar acesso</option>
      </select></label
    >
    <button>Salvar permissão do catálogo</button>
  </form>
</template>

<style scoped>
form {
  display: grid;
  gap: 0.75rem;
}
label {
  display: grid;
  gap: 0.3rem;
}
input,
select,
button {
  max-width: 100%;
}
</style>
