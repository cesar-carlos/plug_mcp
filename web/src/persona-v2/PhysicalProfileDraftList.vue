<script setup lang="ts">
import type { Profile } from "./knowledge-model";

defineProps<{
  drafts: readonly Profile[];
  nextCursor: string | null;
  disabled: boolean;
}>();
const emit = defineEmits<{
  create: [];
  edit: [draft: Profile];
  more: [];
}>();
</script>

<template>
  <fieldset :disabled="disabled">
    <legend>Rascunhos desta base e padrão</legend>
    <button type="button" @click="emit('create')">Criar perfil físico</button>
    <ul>
      <li v-for="draft in drafts" :key="draft.id">
        <button type="button" class="secondary" @click="emit('edit', draft)">
          Editar {{ draft.name }} · revisão {{ draft.revision }}
        </button>
      </li>
    </ul>
    <button v-if="nextCursor" type="button" class="secondary" @click="emit('more')">
      Carregar mais rascunhos físicos
    </button>
  </fieldset>
</template>
