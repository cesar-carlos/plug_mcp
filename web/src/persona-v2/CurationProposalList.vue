<script setup lang="ts">
import { curationStateLabels, type CurationProposal } from "./curation-proposal";

defineProps<{
  proposals: CurationProposal[];
  nextCursor: string | null;
}>();
const emit = defineEmits<{
  refresh: [];
  more: [];
  select: [proposal: CurationProposal];
}>();
</script>

<template>
  <button type="button" class="secondary" @click="emit('refresh')">Atualizar propostas</button>
  <ul>
    <li v-for="p in proposals" :key="p.id">
      <button type="button" class="secondary" @click="emit('select', p)">
        {{ p.summary }} — {{ curationStateLabels[p.state] }}
      </button>
    </li>
  </ul>
  <p v-if="!proposals.length">
    Nenhuma proposta visível nesta página. Colaboradores veem somente suas próprias propostas.
  </p>
  <button v-if="nextCursor" type="button" class="secondary" @click="emit('more')">
    Carregar mais propostas
  </button>
</template>
