<script setup lang="ts">
import type { Resource } from "./knowledge-model";
import type { Dialect } from "./model";

defineProps<{
  dialect: Dialect;
  disabled: boolean;
  hasContent: boolean;
}>();
const resources = defineModel<Resource[]>("resources", { required: true });
const emit = defineEmits<{
  add: [];
  remove: [index: number];
  usePublished: [];
  inspect: [];
}>();
</script>

<template>
  <form aria-label="Escopo da inspeção" @submit.prevent="emit('inspect')">
    <fieldset :disabled="disabled">
      <legend>Até 16 recursos; quatro por página</legend>
      <div v-for="(r, index) in resources" :key="index" class="knowledge-resource-row">
        <label v-if="dialect !== 'firebird'"
          >Schema {{ index + 1
          }}<input v-model="r.schema" required maxlength="128" pattern="[A-Za-z_][A-Za-z0-9_$]*"
        /></label>
        <label
          >Tabela ou view {{ index + 1
          }}<input v-model="r.name" required maxlength="128" pattern="[A-Za-z_][A-Za-z0-9_$]*"
        /></label>
        <label
          >Tipo {{ index + 1
          }}<select v-model="r.type">
            <option value="table">Tabela</option>
            <option value="view">View</option>
          </select></label
        >
        <button
          type="button"
          class="secondary"
          :disabled="resources.length === 1"
          :aria-label="`Remover recurso ${index + 1}`"
          @click="emit('remove', index)"
        >
          Remover
        </button>
      </div>
      <button
        type="button"
        class="secondary"
        :disabled="resources.length >= 16"
        @click="emit('add')"
      >
        Adicionar recurso
      </button>
      <button v-if="hasContent" type="button" class="secondary" @click="emit('usePublished')">
        Preencher escopo da versão selecionada
      </button>
      <button type="submit">Inspecionar estrutura</button>
    </fieldset>
  </form>
</template>
